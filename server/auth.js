import crypto from 'crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { q } from './db.js';
import { DEFAULT_ROLE, ROLE_KEYS, demoRoster, getRole, publicRole } from './rbac.js';

export const SESSION_COOKIE = 'commerceads_session';
const TOKEN_TTL = '7d';
const OTP_TTL_MIN = 15;
const RESET_TTL_MIN = 30;

// No transactional email provider is wired up. Rather than silently drop the
// OTP (which would make registration impossible), demo mode returns it in the
// response so the flow completes. Set DEMO_MODE=false once real email exists.
const DEMO_MODE = process.env.DEMO_MODE !== 'false';
const ALLOW_DEMO_LOGIN = process.env.ALLOW_DEMO_LOGIN !== 'false';

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('[auth] JWT_SECRET is not set — generating an ephemeral secret. Sessions will not survive a restart.');
  return crypto.randomBytes(32).toString('hex');
})();

const newId = (prefix) => `${prefix}_${crypto.randomBytes(9).toString('hex')}`;
const sixDigits = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

const ok = (res, data = {}) => res.json({ ok: true, ...data });
const fail = (res, message, status = 400) => res.status(status).json({ ok: false, error: message });

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    status: row.status,
    is_demo: row.is_demo,
    email_verified: row.email_verified,
    created_at: row.created_at,
    permissions: publicRole(row.role)
  };
}

function readToken(req) {
  const cookie = req.cookies ? req.cookies[SESSION_COOKIE] : null;
  if (cookie) return cookie;
  const header = req.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return null;
}

/** Resolves req.user from the session cookie or bearer token. Never throws. */
export async function attachUser(req, _res, next) {
  req.user = null;
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await q('SELECT * FROM users WHERE id = $1', [payload.sub]);
    if (rows[0] && rows[0].status === 'active') req.user = rows[0];
  } catch {
    // Expired or tampered token — treated as anonymous.
  }
  return next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return fail(res, 'Authentication required', 401);
  return next();
}

async function findByEmail(email) {
  const { rows } = await q('SELECT * FROM users WHERE email = $1', [String(email || '').trim().toLowerCase()]);
  return rows[0] || null;
}

export async function createUser({ email, password, full_name, role, is_demo = false, email_verified = false }) {
  const id = newId('usr');
  const hash = await bcrypt.hash(password, 10);
  const safeRole = ROLE_KEYS.includes(role) ? role : DEFAULT_ROLE;
  const { rows } = await q(
    `INSERT INTO users (id, email, password_hash, full_name, role, is_demo, email_verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [id, String(email).trim().toLowerCase(), hash, full_name || '', safeRole, is_demo, email_verified]
  );
  return rows[0];
}

export const router = express.Router();

router.get('/me', requireAuth, (req, res) => res.json(publicUser(req.user)));

router.get('/roles', (_req, res) => ok(res, { roles: ROLE_KEYS.map((k) => publicRole(k)) }));

router.get('/demo-users', (_req, res) => {
  if (!ALLOW_DEMO_LOGIN) return ok(res, { enabled: false, users: [] });
  return ok(res, { enabled: true, password: 'Demo@1234', users: demoRoster() });
});

router.post('/demo-login', async (req, res) => {
  if (!ALLOW_DEMO_LOGIN) return fail(res, 'Demo login is disabled', 403);
  const role = String(req.body?.role || '').trim();
  if (!ROLE_KEYS.includes(role)) return fail(res, `Unknown role "${role}"`, 400);

  const user = await findByEmail(getRole(role).demo.email);
  if (!user) return fail(res, 'Demo accounts are not seeded yet. Run the seed step.', 503);

  await q('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  const token = signToken(user);
  setSessionCookie(res, token);
  return ok(res, { access_token: token, user: publicUser(user) });
});

router.post('/register', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const full_name = String(req.body?.full_name || '').trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 'Enter a valid email address');
  if (password.length < 8) return fail(res, 'Password must be at least 8 characters');

  const existing = await findByEmail(email);
  if (existing) {
    if (existing.email_verified) return fail(res, 'An account with this email already exists', 409);
    // Unverified signup being retried — reissue rather than dead-ending the user.
    const code = sixDigits();
    await q(
      `UPDATE users SET password_hash = $2, otp_code = $3, otp_expires_at = NOW() + INTERVAL '${OTP_TTL_MIN} minutes' WHERE id = $1`,
      [existing.id, await bcrypt.hash(password, 10), code]
    );
    return ok(res, { otp_required: true, email, ...(DEMO_MODE ? { dev_otp: code } : {}) });
  }

  // Self-registration never grants privilege; an admin promotes afterwards.
  const user = await createUser({ email, password, full_name, role: DEFAULT_ROLE });
  const code = sixDigits();
  await q(
    `UPDATE users SET otp_code = $2, otp_expires_at = NOW() + INTERVAL '${OTP_TTL_MIN} minutes' WHERE id = $1`,
    [user.id, code]
  );
  return ok(res, { otp_required: true, email, ...(DEMO_MODE ? { dev_otp: code } : {}) });
});

router.post('/verify-otp', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const otpCode = String(req.body?.otpCode || req.body?.otp_code || '').trim();

  const user = await findByEmail(email);
  if (!user) return fail(res, 'Invalid verification code', 400);
  if (!user.otp_code || user.otp_code !== otpCode) return fail(res, 'Invalid verification code', 400);
  if (user.otp_expires_at && new Date(user.otp_expires_at).getTime() < Date.now()) {
    return fail(res, 'That code has expired — request a new one', 400);
  }

  const { rows } = await q(
    `UPDATE users SET email_verified = TRUE, otp_code = NULL, otp_expires_at = NULL, last_login_at = NOW()
     WHERE id = $1 RETURNING *`,
    [user.id]
  );
  const token = signToken(rows[0]);
  setSessionCookie(res, token);
  return ok(res, { access_token: token, user: publicUser(rows[0]) });
});

router.post('/resend-otp', async (req, res) => {
  const email = String(req.body?.email || req.body || '').trim().toLowerCase();
  const user = await findByEmail(email);
  if (!user) return ok(res, { sent: true }); // Don't leak which addresses exist.
  const code = sixDigits();
  await q(
    `UPDATE users SET otp_code = $2, otp_expires_at = NOW() + INTERVAL '${OTP_TTL_MIN} minutes' WHERE id = $1`,
    [user.id, code]
  );
  return ok(res, { sent: true, ...(DEMO_MODE ? { dev_otp: code } : {}) });
});

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  const user = await findByEmail(email);
  // Same message and roughly the same work either way, so the response does not
  // reveal whether the address is registered.
  if (!user) {
    await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    return fail(res, 'Invalid email or password', 401);
  }
  const good = await bcrypt.compare(password, user.password_hash);
  if (!good) return fail(res, 'Invalid email or password', 401);
  if (user.status !== 'active') return fail(res, 'This account has been deactivated', 403);

  await q('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  const token = signToken(user);
  setSessionCookie(res, token);
  return ok(res, { access_token: token, user: publicUser(user) });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  return ok(res, { loggedOut: true });
});

router.post('/password/forgot', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const user = await findByEmail(email);
  if (!user) return ok(res, { sent: true });

  const token = crypto.randomBytes(24).toString('hex');
  await q(
    `UPDATE users SET reset_token = $2, reset_expires_at = NOW() + INTERVAL '${RESET_TTL_MIN} minutes' WHERE id = $1`,
    [user.id, token]
  );
  return ok(res, { sent: true, ...(DEMO_MODE ? { dev_reset_url: `/reset-password?token=${token}` } : {}) });
});

router.post('/password/reset', async (req, res) => {
  const token = String(req.body?.resetToken || req.body?.reset_token || '').trim();
  const newPassword = String(req.body?.newPassword || req.body?.new_password || '');
  if (newPassword.length < 8) return fail(res, 'Password must be at least 8 characters');

  const { rows } = await q('SELECT * FROM users WHERE reset_token = $1', [token]);
  const user = rows[0];
  if (!user) return fail(res, 'This reset link is invalid or has already been used', 400);
  if (user.reset_expires_at && new Date(user.reset_expires_at).getTime() < Date.now()) {
    return fail(res, 'This reset link has expired', 400);
  }
  if (user.is_demo) return fail(res, 'Demo account passwords are fixed and cannot be changed', 403);

  await q(
    `UPDATE users SET password_hash = $2, reset_token = NULL, reset_expires_at = NULL, email_verified = TRUE WHERE id = $1`,
    [user.id, await bcrypt.hash(newPassword, 10)]
  );
  return ok(res, { reset: true });
});

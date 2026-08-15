/**
 * API client for the CommerceAds backend.
 *
 * The surface deliberately matches what the pages already call:
 *   base44.entities.<Entity>.list(sort, limit)
 *   base44.entities.<Entity>.filter(where, sort, limit)
 *   base44.entities.<Entity>.get(id) / .create(data) / .update(id, data)
 *   base44.entities.<Entity>.bulkUpdate([{ id, ...patch }])
 *
 * Auth is a session cookie set by the server (httpOnly), so nothing here has to
 * hold a token. setToken exists only for the register→verify flow, which hands
 * back a bearer token as well.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const TOKEN_KEY = 'commerceads_token';

const readToken = () => {
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
};

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = payload;
  }
}

async function request(path, options = {}) {
  const token = readToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    credentials: 'include'
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = { error: text }; }
  }

  if (!response.ok) {
    const message = payload?.error || payload?.message || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload);
  }

  return payload;
}

const qs = (params) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  });
  const str = search.toString();
  return str ? `?${str}` : '';
};

function entityApi(entity) {
  const base = `/${encodeURIComponent(entity)}`;
  return {
    list: (sort = null, limit = 500) => request(`${base}${qs({ sort, limit })}`),
    get: (id) => request(`${base}/${encodeURIComponent(id)}`),
    filter: (where = {}, sort = null, limit = 500) =>
      request(`${base}/query`, { method: 'POST', body: JSON.stringify({ where, sort, limit }) }),
    create: (data) => request(base, { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`${base}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
    bulkUpdate: (items = []) => request(`${base}/bulk`, { method: 'POST', body: JSON.stringify(items) }),
    delete: (id) => request(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  };
}

// Entity accessors are created on demand, so a new backend entity needs no
// change here — base44.entities.Whatever just works.
const entityCache = new Map();
const entities = new Proxy({}, {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined;
    if (!entityCache.has(prop)) entityCache.set(prop, entityApi(prop));
    return entityCache.get(prop);
  },
  has: () => true
});

const auth = {
  me: () => request('/auth/me'),

  isAuthenticated: () => request('/auth/me').then(() => true).catch(() => false),

  loginViaEmailPassword: async (email, password) => {
    const res = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (res?.access_token) auth.setToken(res.access_token);
    return res;
  },

  demoUsers: () => request('/auth/demo-users'),

  demoLogin: async (role) => {
    const res = await request('/auth/demo-login', { method: 'POST', body: JSON.stringify({ role }) });
    if (res?.access_token) auth.setToken(res.access_token);
    return res;
  },

  register: ({ email, password, full_name }) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, full_name }) }),

  verifyOtp: ({ email, otpCode }) =>
    request('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, otpCode }) }),

  resendOtp: (email) => request('/auth/resend-otp', { method: 'POST', body: JSON.stringify({ email }) }),

  resetPasswordRequest: (email) =>
    request('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }),

  resetPassword: ({ resetToken, newPassword }) =>
    request('/auth/password/reset', { method: 'POST', body: JSON.stringify({ resetToken, newPassword }) }),

  setToken: (token) => {
    try {
      if (token) window.localStorage.setItem(TOKEN_KEY, token);
      else window.localStorage.removeItem(TOKEN_KEY);
    } catch { /* private browsing — the cookie still carries the session */ }
  },

  logout: async () => {
    auth.setToken(null);
    try { await request('/auth/logout', { method: 'POST' }); } catch { /* already gone */ }
  },

  roles: () => request('/auth/roles')
};

const functions = {
  invoke: (name, body = {}) =>
    request(`/functions/${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify(body) })
};

export const base44 = { entities, auth, functions };

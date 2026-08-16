import express from 'express';
import fs from 'fs';
import path from 'path';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { initSchema, pool } from './server/db.js';
import { router as configRouter, startConfig } from './server/config.js';
import { attachUser, router as authRouter } from './server/auth.js';
import { router as entitiesRouter } from './server/entities.js';
import { refreshExperiments, resumeInFlight, router as functionsRouter } from './server/functions.js';
import { router as webhooksRouter } from './server/webhooks.js';
import { isSeeded, seedAll } from './server/seed.js';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

// Railway terminates TLS upstream; without this, secure cookies are dropped.
app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

let dbReady = false;
let seedSummary = null;
let bootError = null;

app.get('/api/health', async (_req, res) => {
  const body = {
    ok: dbReady,
    status: dbReady ? 'ok' : 'degraded',
    database: dbReady ? 'connected' : 'unavailable',
    seeded: Boolean(seedSummary && !seedSummary.skipped) || (seedSummary?.skipped ?? false),
    uptime_sec: Math.round(process.uptime())
  };
  if (bootError) body.error = bootError;
  // A health check that only ever says "ok" is not a health check. Report the
  // database honestly and fail the status code when it is down.
  return res.status(dbReady ? 200 : 503).json(body);
});

// Runtime config carries no secrets and the shell reads it before any entity
// call, so it sits outside the auth boundary.
app.use('/api/config', configRouter);

// Provider webhooks authenticate with a shared secret, not a session, so they
// are mounted ahead of the auth middleware.
app.use('/api/webhooks', webhooksRouter);

app.use(attachUser);
app.use('/api/auth', authRouter);
app.use('/api/functions', functionsRouter);

// Entity CRUD is mounted last under /api so it cannot shadow auth or functions.
app.use('/api', entitiesRouter);

app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'No such API route' }));

// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature.
app.use('/api', (err, _req, res, _next) => {
  console.error('[api]', err);
  res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
});

const distPath = path.join(__dirname, 'dist');
const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

if (hasDist) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    return res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('*', (_req, res) => res.status(503).json({ ok: false, error: 'Frontend build not generated yet.' }));
}

async function boot() {
  // Independent of the database — the shell still needs FX and environment.
  await startConfig();

  if (!process.env.DATABASE_URL) {
    bootError = 'DATABASE_URL is not set — the API cannot serve data.';
    console.error(`[boot] ${bootError}`);
    return;
  }
  try {
    await initSchema();
    dbReady = true;
    console.log('[boot] schema ready');

    if (process.env.SEED_ON_BOOT === 'false') {
      console.log('[boot] seeding disabled (SEED_ON_BOOT=false)');
    } else {
      const already = await isSeeded();
      seedSummary = await seedAll({ force: process.env.SEED_FORCE === 'true' });
      console.log(already && seedSummary.skipped
        ? '[boot] demo data already present — demo accounts verified'
        : `[boot] seeded ${JSON.stringify(seedSummary.counts)}`);
    }

    await resumeInFlight();

    // Experiment arms are a read of the funnel, so they are recomputed on a
    // timer rather than written once at seed time.
    const reanalyse = async () => {
      try {
        const n = await refreshExperiments();
        if (n) console.log(`[scheduler] re-analysed ${n} running experiment(s)`);
      } catch (err) {
        console.error('[scheduler] experiment analysis failed', err.message);
      }
    };
    await reanalyse();
    setInterval(reanalyse, 2 * 60 * 1000).unref?.();
  } catch (err) {
    bootError = err.message;
    console.error('[boot] failed', err);
  }
}

app.listen(PORT, async () => {
  console.log(`CommerceAds API listening on port ${PORT}`);
  await boot();
});

const shutdown = async (signal) => {
  console.log(`[shutdown] ${signal}`);
  try { await pool.end(); } catch { /* already closing */ }
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

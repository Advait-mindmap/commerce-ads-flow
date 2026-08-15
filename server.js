import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '2mb' }));

const ok = (res, data = {}) => res.json({ ok: true, ...data });
const fail = (res, message, status = 400) => res.status(status).json({ ok: false, error: message });

app.get('/api/health', (_req, res) => ok(res, { status: 'ok' }));

app.get('/api/auth/me', (_req, res) => ok(res, { user: { id: 'demo-admin', email: 'admin@example.com' } }));
app.post('/api/auth/logout', (_req, res) => ok(res, { loggedOut: true }));

app.get('/api/:entity', (req, res) => ok(res, { entity: req.params.entity, rows: [] }));
app.get('/api/:entity/:id', (req, res) => ok(res, { entity: req.params.entity, id: req.params.id, data: {} }));
app.post('/api/:entity/query', (req, res) => ok(res, { entity: req.params.entity, rows: [] }));
app.post('/api/:entity', (req, res) => ok(res, { entity: req.params.entity, data: req.body || {} }));
app.patch('/api/:entity/:id', (req, res) => ok(res, { entity: req.params.entity, id: req.params.id, data: req.body || {} }));
app.post('/api/:entity/bulk', (req, res) => ok(res, { entity: req.params.entity, count: Array.isArray(req.body) ? req.body.length : 0 }));

app.post('/api/functions/:name', (req, res) => {
  const { name } = req.params;
  if (!name) return fail(res, 'Function name required', 400);
  return ok(res, { function: name, body: req.body || {}, result: { ok: true } });
});

const distPath = path.join(__dirname, 'dist');
const hasDist = path.existsSync ? path.existsSync(distPath) : false;

if (hasDist) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('*', (_req, res) => res.status(503).json({ ok: false, error: 'Frontend build not generated yet.' }));
}

app.listen(PORT, () => {
  console.log(`CommerceAds API listening on port ${PORT}`);
});

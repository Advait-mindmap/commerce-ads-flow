# InSales OS

Ad sales platform for e-commerce marketplaces. See [SPEC.md](./SPEC.md) for the
product specification.

The app is a React/Vite frontend served by an Express API backed by Postgres.
It is self-contained — there is no external backend dependency.

## Architecture

```
src/                    React frontend (Vite)
  api/client.js         API client: entities, auth, functions
  lib/AuthContext.jsx   Session + role grants
server.js               Express entry point, serves the API and the built SPA
server/
  db.js                 Postgres pool, schema, JSONB entity storage
  rbac.js               Role definitions — the authority on who can do what
  auth.js               Registration, login, sessions, password reset
  entities.js           Generic CRUD for all 13 entities, RBAC-enforced
  functions.js          placeCall, extractQualification, the suppression gate
  call-sim.js           Call generation and transcript extraction
  seed.js               Deterministic demo dataset
```

Entities are stored as `id + timestamps + JSONB`. The domain objects are wide
and deeply nested (`traffic_series`, `optimization_actions`, `transcript`), and
the frontend filters on arbitrary keys, so a fixed column per field would be
churn for no gain.

## Run locally

```bash
npm install
cp .env.example .env        # set DATABASE_URL and JWT_SECRET
npm run build               # the server serves dist/, so build before start
npm start
```

Open http://localhost:3000. On first boot the server creates the schema and
seeds the demo dataset — 400 sellers and the full funnel behind them.

For frontend-only work with hot reload, run `npm run dev` alongside `npm start`
and point `VITE_API_BASE_URL` at the API.

## Roles

Seven roles, each with its own screens, entity grants, and privileged
capabilities. The sign-in screen offers one-click access to a seeded demo
account for every one of them; all demo accounts also accept the password
`Demo@1234`.

| Role | Sees | Can |
| --- | --- | --- |
| Administrator | Everything | Everything |
| Revenue Lead | Every module | Approve optimizations, read compliance |
| Sales Manager | Everything except compliance | Dial, approve, move pipeline |
| Account Executive | Workspace, pipeline, sellers, campaigns | Dial, work own queue |
| SDR Operations | Signals, MQL, SDR console | Dial, create and qualify leads |
| Analyst | Intelligence and performance | Read only |
| Compliance Officer | Compliance, sellers, calls | Manage suppressions, read audit |

Grants live in [server/rbac.js](./server/rbac.js) and are enforced on every
entity read/write and every privileged function. The browser receives a copy to
hide what it cannot use, but that copy is never the security boundary.

## What is simulated

**Voice calls.** Without voice credentials, calls are generated
locally instead of placed over the wire. Everything downstream is real and runs
against the database: the suppression gate, the AgentRun lifecycle
(`in_progress` → terminal), transcript rendering, rule-based qualification
extraction, guardrails and escalation routing. Replacing the real dialer means
changing `server/voice.js` and nothing else.

**Email.** No transactional email provider is configured. With `DEMO_MODE=true`
the API returns OTP codes and password-reset links in the response so those
flows can be completed; the UI shows them with an explicit notice. Set
`DEMO_MODE=false` once email exists.

## Deployment

Deployed on Railway as the `app` service. The service is **not** connected to
GitHub, so pushing does not deploy — ship with:

```bash
railway up --service app
```

Required variables on the service: `DATABASE_URL` (a reference to the Postgres
service), `JWT_SECRET`, `NODE_ENV=production`. See `.env.example` for the rest.

`SEED_FORCE=true` wipes and regenerates the dataset on the next boot. Leave it
`false`.

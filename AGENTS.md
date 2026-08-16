# AGENTS.md

## Project Context

InSales OS — an ad sales platform for e-commerce marketplaces. See `SPEC.md`
for the product specification and `README.md` for setup.

This is a self-contained application: a React/Vite frontend served by an Express
API backed by Postgres. There is no external backend service and no hosted
builder. Treat it as ordinary application code.

## Key Files

- `server.js` — Express entry point; serves the API and the built SPA.
- `server/` — API layer: `db.js` (Postgres + JSONB entity store), `rbac.js`
  (roles, the authority on permissions), `auth.js`, `entities.js` (generic CRUD),
  `functions.js` (callable functions incl. the dialer), `seed.js` (demo data).
- `src/api/client.js` — the frontend API client. Pages call
  `api.entities.<Entity>.list(...)`.
- `src/lib/AuthContext.jsx` — session and role grants.
- `vite.config.js` — build config and the `@` → `src` alias.
- `.env.local` — local-only environment values; never commit secrets.

## Working Notes

- `npm run build` then `npm start` runs the whole app; the server serves `dist/`.
  `npm run dev` alone gives you the frontend without an API.
- Roles and permissions live in `server/rbac.js` and are enforced server-side on
  every read, write and privileged function. The copy the browser receives from
  `/api/auth/me` is only for hiding UI — never treat it as the boundary.
- Entities are stored as `id + timestamps + JSONB`. Adding a field needs no
  migration; adding an entity means adding it to `ENTITIES` in `server/db.js`.
- Run `npm run lint` before finishing a change.
- Deployment is Railway, CLI-only: `railway up --service app`. Pushing to git
  does not deploy.

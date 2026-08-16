import pg from 'pg';

const { Pool } = pg;

// Entity storage is id + timestamps + a JSONB blob. The domain objects here are
// wide and deeply nested (traffic_series, optimization_actions, transcript,
// qualification), and the frontend filters on arbitrary keys, so a fixed column
// per field would be churn for no gain.
export const ENTITIES = [
  'Seller',
  'Contact',
  'Lead',
  'AgentRun',
  'Opportunity',
  'Campaign',
  'Interaction',
  'AdPackage',
  'Experiment',
  'ModelVersion',
  'Sequence',
  'Suppression',
  'AuditLog'
];

export const isEntity = (name) => ENTITIES.includes(name);

export const tableFor = (entity) => `entity_${entity.toLowerCase()}`;

const connectionString = process.env.DATABASE_URL;

// Railway's private network (*.railway.internal) and local Postgres both speak
// plaintext; anything else we assume is a public endpoint that needs TLS.
function sslFor(url) {
  if (!url) return false;
  if (/railway\.internal|localhost|127\.0\.0\.1/.test(url)) return false;
  return { rejectUnauthorized: false };
}

export const pool = new Pool({
  connectionString,
  ssl: sslFor(connectionString),
  max: 8,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err.message);
});

export const q = (text, params) => pool.query(text, params);

export async function initSchema() {
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'analyst',
      status TEXT NOT NULL DEFAULT 'active',
      is_demo BOOLEAN NOT NULL DEFAULT FALSE,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      otp_code TEXT,
      otp_expires_at TIMESTAMPTZ,
      reset_token TEXT,
      reset_expires_at TIMESTAMPTZ,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS users_reset_token_idx ON users (reset_token)`);

  for (const entity of ENTITIES) {
    const table = tableFor(entity);
    await q(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        data JSONB NOT NULL DEFAULT '{}'::jsonb
      )
    `);
    await q(`CREATE INDEX IF NOT EXISTS ${table}_data_idx ON ${table} USING GIN (data)`);
  }
}

// Rows go out as flat objects: the JSON blob plus the columns the UI reads by
// name (id, created_date). Blob keys never shadow the real id.
export function rowToObject(row) {
  if (!row) return null;
  return {
    ...row.data,
    id: row.id,
    created_date: row.created_date instanceof Date ? row.created_date.toISOString() : row.created_date,
    updated_date: row.updated_date instanceof Date ? row.updated_date.toISOString() : row.updated_date
  };
}

/**
 * Build an ORDER BY for a signed sort key ("-started_at" = descending).
 *
 * Values land in JSONB as either numbers or strings, and a text sort of a
 * number column puts "9" above "10". So sort numerically when the key holds a
 * JSON number, and fall back to text otherwise — ISO date strings sort
 * chronologically as text, which covers every date key the UI sorts on.
 */
export function orderByClause(sort) {
  if (!sort || typeof sort !== 'string') return 'ORDER BY created_date DESC';
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  if (!/^[a-zA-Z0-9_]+$/.test(key)) return 'ORDER BY created_date DESC';
  const dir = desc ? 'DESC' : 'ASC';
  if (key === 'created_date' || key === 'updated_date') return `ORDER BY ${key} ${dir}`;
  return (
    `ORDER BY (CASE WHEN jsonb_typeof(data->'${key}') = 'number' ` +
    `THEN (data->>'${key}')::numeric ELSE NULL END) ${dir} NULLS LAST, ` +
    `data->>'${key}' ${dir} NULLS LAST`
  );
}

export function clampLimit(limit, fallback = 500) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 2000);
}

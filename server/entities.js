import crypto from 'crypto';
import express from 'express';
import { clampLimit, isEntity, orderByClause, q, rowToObject, tableFor } from './db.js';
import { canEntity } from './rbac.js';
import { requireAuth } from './auth.js';

export const newEntityId = (entity) => `${entity.toLowerCase()}_${crypto.randomBytes(8).toString('hex')}`;

const fail = (res, message, status = 400) => res.status(status).json({ ok: false, error: message });

/** Resolves :entity, rejecting unknown names and actions the role lacks. */
function guard(action) {
  return (req, res, next) => {
    const { entity } = req.params;
    if (!isEntity(entity)) return fail(res, `Unknown entity "${entity}"`, 404);
    if (!canEntity(req.user.role, entity, action)) {
      return fail(res, `Your role (${req.user.role}) cannot ${action} ${entity} records`, 403);
    }
    req.entity = entity;
    req.table = tableFor(entity);
    return next();
  };
}

/**
 * Turns a filter object into a JSONB containment predicate.
 *
 * Every filter the UI issues is simple equality ({ seller_id }, { stage },
 * { model_key }, { entity_type, entity_id }), which @> matches exactly and the
 * GIN index serves directly. `id` is a real column, so it is pulled out.
 */
function buildWhere(where = {}) {
  const clauses = [];
  const params = [];
  const containment = {};

  for (const [key, value] of Object.entries(where || {})) {
    if (value === undefined) continue;
    if (key === 'id') {
      params.push(String(value));
      clauses.push(`id = $${params.length}`);
      continue;
    }
    if (value === null) {
      clauses.push(`(data->'${key.replace(/[^a-zA-Z0-9_]/g, '')}' IS NULL OR data->>'${key.replace(/[^a-zA-Z0-9_]/g, '')}' IS NULL)`);
      continue;
    }
    if (typeof value === 'object') continue; // Nested matching is not supported.
    containment[key] = value;
  }

  if (Object.keys(containment).length) {
    params.push(JSON.stringify(containment));
    clauses.push(`data @> $${params.length}::jsonb`);
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

async function selectRows(table, where, sort, limit) {
  const { sql, params } = buildWhere(where);
  const capped = clampLimit(limit);
  params.push(capped);
  const { rows } = await q(
    `SELECT * FROM ${table} ${sql} ${orderByClause(sort)} LIMIT $${params.length}`,
    params
  );
  return rows.map(rowToObject);
}

/** Strips fields the store owns so a client payload cannot forge them. */
function sanitize(payload = {}) {
  const { id, created_date, updated_date, ...rest } = payload || {};
  return rest;
}

async function insert(table, entity, payload) {
  const id = payload?.id && typeof payload.id === 'string' ? payload.id : newEntityId(entity);
  const data = sanitize(payload);
  const { rows } = await q(
    `INSERT INTO ${table} (id, data) VALUES ($1, $2::jsonb)
     ON CONFLICT (id) DO UPDATE SET data = ${table}.data || EXCLUDED.data, updated_date = NOW()
     RETURNING *`,
    [id, JSON.stringify(data)]
  );
  return rowToObject(rows[0]);
}

async function patch(table, id, payload) {
  const data = sanitize(payload);
  const { rows } = await q(
    `UPDATE ${table} SET data = data || $2::jsonb, updated_date = NOW() WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(data)]
  );
  return rows[0] ? rowToObject(rows[0]) : null;
}


/*
 * Auditing every write, with the actor taken from the session.
 *
 * Two problems this closes. Only a handful of screens called logAudit by hand,
 * so most real work — moving a lead, assigning an owner, editing a record —
 * left no trace at all. And the actor was whatever the browser sent, so an
 * entry could name anyone; an audit trail that can be authored by the thing
 * being audited is not evidence of anything.
 */

// Records whose own writes must not be audited, or the log would describe
// itself and grow without bound.
const NOT_AUDITED = new Set(['AuditLog']);

/** A readable name for the record, without assuming a particular schema. */
const labelFor = (row) =>
  row?.seller_name || row?.display_name || row?.name || row?.full_name || row?.title || row?.id || null;

/** Which fields a patch actually changed, so the entry says something useful. */
function changedFields(before, after) {
  if (!before || !after) return [];
  return Object.keys(after)
    .filter((k) => !['id', 'created_date', 'updated_date'].includes(k))
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

async function recordAudit(req, { action, entity, row, summary, before_value, after_value }) {
  if (NOT_AUDITED.has(entity)) return;
  try {
    await q(
      `INSERT INTO ${tableFor('AuditLog')} (id, data) VALUES ($1, $2::jsonb)`,
      [newEntityId('AuditLog'), JSON.stringify({
        timestamp: new Date().toISOString(),
        // Taken from the authenticated session, never from the request body.
        actor_type: 'human_rep',
        actor_name: req.user?.full_name || req.user?.email || 'Unknown user',
        actor_id: req.user?.id || null,
        actor_role: req.user?.role || null,
        action,
        entity_type: entity,
        entity_id: row?.id || null,
        entity_name: labelFor(row),
        summary,
        before_value: before_value != null ? String(before_value) : undefined,
        after_value: after_value != null ? String(after_value) : undefined
      })]
    );
  } catch (err) {
    // A failed audit write must never fail the user's action, but it must be
    // visible rather than swallowed.
    console.error('[audit] could not record', action, entity, err.message);
  }
}

export const router = express.Router();

router.use(requireAuth);

// GET /api/:entity?sort=-started_at&limit=500
router.get('/:entity', guard('read'), async (req, res, next) => {
  try {
    res.json(await selectRows(req.table, {}, req.query.sort, req.query.limit));
  } catch (err) { next(err); }
});

// POST /api/:entity/query { where, sort, limit } — registered before /:id so
// "query" is never read as a record id.
router.post('/:entity/query', guard('read'), async (req, res, next) => {
  try {
    const { where, query, sort, limit } = req.body || {};
    res.json(await selectRows(req.table, where || query || {}, sort, limit));
  } catch (err) { next(err); }
});

router.post('/:entity/bulk', guard('update'), async (req, res, next) => {
  try {
    const items = Array.isArray(req.body) ? req.body : req.body?.items;
    if (!Array.isArray(items)) return fail(res, 'Bulk update expects an array of records');
    const updated = [];
    for (const item of items) {
      if (!item || !item.id) continue;
      const row = await patch(req.table, item.id, item);
      if (row) updated.push(row);
    }
    if (updated.length) {
      await recordAudit(req, {
        action: `${req.entity.toLowerCase()}_bulk_updated`,
        entity: req.entity,
        row: updated[0],
        summary: `Bulk updated ${updated.length} ${req.entity} record(s)`
      });
    }
    return res.json(updated);
  } catch (err) { return next(err); }
});

router.get('/:entity/:id', guard('read'), async (req, res, next) => {
  try {
    const { rows } = await q(`SELECT * FROM ${req.table} WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return fail(res, `${req.entity} ${req.params.id} was not found`, 404);
    return res.json(rowToObject(rows[0]));
  } catch (err) { return next(err); }
});

router.post('/:entity', guard('create'), async (req, res, next) => {
  try {
    /*
     * An audit entry names whoever the session says is acting, not whoever the
     * request body claims. Without this a client can author history under
     * another person's name, which makes the whole log worthless as evidence.
     */
    const body = req.entity === 'AuditLog'
      ? {
          ...req.body,
          actor_name: req.user?.full_name || req.user?.email || 'Unknown user',
          actor_id: req.user?.id || null,
          actor_role: req.user?.role || null
        }
      : req.body;

    const created = await insert(req.table, req.entity, body);

    // Enrolment and the SLA clock are applied server-side, so a lead created
    // from Signal Explorer, Seller 360 or a raw API call is treated identically
    // rather than depending on which screen made it.
    await recordAudit(req, {
      action: `${req.entity.toLowerCase()}_created`,
      entity: req.entity,
      row: created,
      summary: `Created ${req.entity} ${labelFor(created) || ''}`.trim()
    });

    if (req.entity === 'Lead') {
      const { enrichNewLead } = await import('./functions.js');
      return res.status(201).json(await enrichNewLead(created));
    }
    return res.status(201).json(created);
  } catch (err) { return next(err); }
});

router.patch('/:entity/:id', guard('update'), async (req, res, next) => {
  try {
    const prior = (await q(`SELECT * FROM ${req.table} WHERE id = $1`, [req.params.id])).rows[0];
    const before = prior ? rowToObject(prior) : null;
    const row = await patch(req.table, req.params.id, req.body);
    if (!row) return fail(res, `${req.entity} ${req.params.id} was not found`, 404);

    const changed = changedFields(before, row);
    if (changed.length) {
      const headline = changed.slice(0, 4).join(', ');
      await recordAudit(req, {
        action: `${req.entity.toLowerCase()}_updated`,
        entity: req.entity,
        row,
        summary: `Changed ${headline}${changed.length > 4 ? ` and ${changed.length - 4} more` : ''}`,
        before_value: changed.length === 1 ? before?.[changed[0]] : undefined,
        after_value: changed.length === 1 ? row[changed[0]] : undefined
      });
    }
    return res.json(row);
  } catch (err) { return next(err); }
});

router.delete('/:entity/:id', guard('delete'), async (req, res, next) => {
  try {
    const prior = (await q(`SELECT * FROM ${req.table} WHERE id = $1`, [req.params.id])).rows[0];
    const { rowCount } = await q(`DELETE FROM ${req.table} WHERE id = $1`, [req.params.id]);
    if (!rowCount) return fail(res, `${req.entity} ${req.params.id} was not found`, 404);
    await recordAudit(req, {
      action: `${req.entity.toLowerCase()}_deleted`,
      entity: req.entity,
      row: prior ? rowToObject(prior) : { id: req.params.id },
      summary: `Deleted ${req.entity} ${req.params.id}`
    });
    return res.json({ ok: true, deleted: req.params.id });
  } catch (err) { return next(err); }
});

export const helpers = { selectRows, insert, patch };

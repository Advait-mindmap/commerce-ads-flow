/**
 * Callable backend functions: /api/functions/:name
 *
 * bolnaCall is the critical path in SPEC.md — the suppression gate runs before
 * any dial, blocks are reported with their reason rather than swallowed, and a
 * placed call moves through in_progress to a terminal state so the Call Detail
 * poller has a real transition to observe.
 */

import express from 'express';
import { q, rowToObject, tableFor } from './db.js';
import { requireAuth } from './auth.js';
import { CAPS, hasCap } from './rbac.js';
import { makeRng } from './rng.js';
import { buildCall, extractFromTranscript } from './call-sim.js';
import { newEntityId } from './entities.js';

const DAY = 86400000;
// How long a simulated call stays in flight. Long enough that the 5s poller on
// Call Detail observes in_progress → terminal, short enough to not stall a demo.
const CALL_DURATION_MS = Number(process.env.SIM_CALL_MS || 22000);

const CALL_WINDOW_ENFORCED = process.env.CALL_WINDOW_ENFORCED !== 'false';
const CALL_WINDOW_START = 9;
const CALL_WINDOW_END = 20;

const table = (entity) => tableFor(entity);

async function getRow(entity, id) {
  const { rows } = await q(`SELECT * FROM ${table(entity)} WHERE id = $1`, [id]);
  return rows[0] ? rowToObject(rows[0]) : null;
}

async function patchRow(entity, id, patch) {
  const { rows } = await q(
    `UPDATE ${table(entity)} SET data = data || $2::jsonb, updated_date = NOW() WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(patch)]
  );
  return rows[0] ? rowToObject(rows[0]) : null;
}

async function insertRow(entity, payload) {
  const { id, created_date, ...rest } = payload;
  const rowId = id || newEntityId(entity);
  const { rows } = await q(
    `INSERT INTO ${table(entity)} (id, data, created_date) VALUES ($1, $2::jsonb, COALESCE($3::timestamptz, NOW()))
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = NOW()
     RETURNING *`,
    [rowId, JSON.stringify(rest), created_date || null]
  );
  return rowToObject(rows[0]);
}

async function audit(entry) {
  await insertRow('AuditLog', {
    timestamp: new Date().toISOString(),
    ...entry
  });
}

/** Current IST hour, independent of where the server runs. */
function istHour(date = new Date()) {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  return new Date(utcMs + 5.5 * 3600000).getHours();
}

/**
 * The mandatory pre-dial gate from SPEC.md. Returns null when clear, or
 * { reason, detail } describing the first rule that blocked.
 */
export async function evaluateSuppression({ lead, seller }) {
  const now = Date.now();

  if (!seller) return { reason: 'seller_not_found', detail: 'No seller record is attached to this lead.' };

  if (seller.dnd) {
    return { reason: 'dnd_registry', detail: `${seller.display_name} is on the DND registry.` };
  }
  if (!seller.channel_consent || seller.channel_consent.voice !== true) {
    return { reason: 'opted_out', detail: `${seller.display_name} has not consented to voice contact.` };
  }
  if (seller.status === 'suspended' || seller.status === 'churned') {
    return { reason: 'account_suspended', detail: `Seller account status is "${seller.status}".` };
  }

  const { rows: supRows } = await q(
    `SELECT * FROM ${table('Suppression')} WHERE data @> $1::jsonb`,
    [JSON.stringify({ seller_id: seller.id })]
  );
  const active = supRows.map(rowToObject).find((s) => !s.expires_at || new Date(s.expires_at).getTime() > now);
  if (active) {
    return { reason: active.reason, detail: `An active suppression record is in force (${String(active.reason).replace(/_/g, ' ')}).` };
  }

  if (lead?.stage === 'disqualified') {
    const at = lead.updated_date || lead.mql_at;
    if (at && now - new Date(at).getTime() < 90 * DAY) {
      return { reason: 'disqualified_recent', detail: 'Lead was disqualified within the last 90 days.' };
    }
  }

  const last = lead?.last_agent_contact_at || seller.last_contacted_at;
  if (last && now - new Date(last).getTime() < 7 * DAY) {
    const days = Math.ceil((7 * DAY - (now - new Date(last).getTime())) / DAY);
    return { reason: 'recent_contact', detail: `Contacted within the last 7 days — eligible again in ${days} day(s).` };
  }

  const { rows: runRows } = await q(
    `SELECT * FROM ${table('AgentRun')} WHERE data @> $1::jsonb`,
    [JSON.stringify({ seller_id: seller.id })]
  );
  const attempts30 = runRows
    .map(rowToObject)
    .filter((r) => r.started_at && now - new Date(r.started_at).getTime() < 30 * DAY).length;
  if (attempts30 >= 4) {
    return { reason: 'frequency_cap', detail: `${attempts30} call attempts already made in the last 30 days (cap is 4).` };
  }

  if (CALL_WINDOW_ENFORCED) {
    const hour = istHour();
    if (hour < CALL_WINDOW_START || hour >= CALL_WINDOW_END) {
      return {
        reason: 'outside_calling_window',
        detail: `It is ${hour}:00 IST — outside the ${CALL_WINDOW_START}:00–${CALL_WINDOW_END}:00 IST calling window. Set CALL_WINDOW_ENFORCED=false to relax this for demos.`
      };
    }
  }

  return null;
}

/** Least-loaded rep by open assigned leads, per SPEC's escalation routing. */
async function leastLoadedRep() {
  const { rows } = await q(`SELECT data FROM ${table('Lead')}`);
  const load = {};
  rows.forEach(({ data }) => {
    if (!data?.assigned_rep_name) return;
    if (!['mql', 'sql', 'opportunity'].includes(data.stage)) return;
    load[data.assigned_rep_name] = (load[data.assigned_rep_name] || 0) + 1;
  });
  const entries = Object.entries(load);
  if (!entries.length) return 'Ananya Iyer';
  return entries.sort((a, b) => a[1] - b[1])[0][0];
}

/** Writes the terminal state of a call that was placed in_progress. */
async function completeRun(runId) {
  try {
    const run = await getRow('AgentRun', runId);
    if (!run || run.status !== 'in_progress') return;

    const seller = run.seller_id ? await getRow('Seller', run.seller_id) : null;
    const lead = run.lead_id ? await getRow('Lead', run.lead_id) : null;
    if (!seller) {
      await patchRow('AgentRun', runId, { status: 'completed', outcome: 'failed', ended_at: new Date().toISOString() });
      return;
    }

    const pending = run._pending || {};
    const rng = makeRng(`live-${runId}`);
    const call = buildCall({
      seller,
      lead,
      rng,
      startedAt: run.started_at,
      scriptVariant: run.script_variant,
      forceScenario: pending.scenario
    });

    const escalation = call.escalation
      ? { ...call.escalation, assigned_rep: await leastLoadedRep(), status: 'open' }
      : null;

    await patchRow('AgentRun', runId, {
      status: 'completed',
      outcome: call.outcome,
      ended_at: new Date(new Date(run.started_at).getTime() + call.duration_sec * 1000).toISOString(),
      duration_sec: call.duration_sec,
      cost_usd: call.cost_usd,
      transcript: call.transcript,
      objections: call.objections,
      guardrail_events: call.guardrail_events,
      qualification: call.qualification,
      overall_sentiment: call.overall_sentiment,
      talk_ratio: call.talk_ratio,
      signature_verified: true,
      escalation,
      _pending: null
    });

    if (call.transcript.length) {
      await insertRow('Interaction', {
        id: `int_${runId}`,
        seller_id: seller.id,
        seller_name: seller.display_name,
        lead_id: run.lead_id,
        agent_run_id: runId,
        channel: 'voice_out',
        actor_type: 'agent',
        actor_name: 'AI SDR (Meera)',
        direction: 'outbound',
        outcome: call.outcome,
        disposition: call.outcome,
        summary: `AI SDR call — ${call.outcome.replace(/_/g, ' ')}.`,
        objections: call.objections.map((o) => o.objection_type),
        sentiment_score: call.overall_sentiment,
        duration_sec: call.duration_sec,
        started_at: run.started_at
      });
    }

    // A booked meeting advances the lead to SQL, per SPEC.
    if (lead && call.meeting_booked) {
      await patchRow('Lead', lead.id, {
        stage: ['mql', 'nurture'].includes(lead.stage) ? 'sql' : lead.stage,
        sql_at: lead.sql_at || new Date().toISOString(),
        meeting_status: 'booked',
        meeting_scheduled_at: new Date(Date.now() + 2 * DAY).toISOString(),
        meeting_booked_by: 'agent',
        meeting_rep: lead.assigned_rep_name,
        agent_disposition: 'meeting_booked',
        sla_status: 'met'
      });
      await audit({
        actor_type: 'agent',
        actor_name: 'AI SDR (Meera)',
        action: 'lead_advanced_to_sql',
        entity_type: 'Lead',
        entity_id: lead.id,
        entity_name: lead.seller_name,
        summary: 'Meeting booked on the qualification call — advanced to SQL',
        before_value: lead.stage,
        after_value: 'sql'
      });
    } else if (lead) {
      await patchRow('Lead', lead.id, { agent_disposition: call.outcome });
    }

    if (escalation) {
      await audit({
        actor_type: 'system',
        actor_name: 'Guardrail monitor',
        action: 'escalation_raised',
        entity_type: 'AgentRun',
        entity_id: runId,
        entity_name: seller.display_name,
        summary: `Guardrail fired on ${escalation.trigger_type.replace(/_/g, ' ')} — assigned to ${escalation.assigned_rep}`
      });
    }
  } catch (err) {
    console.error('[functions] completeRun failed', runId, err.message);
  }
}

const scheduleCompletion = (runId, delay = CALL_DURATION_MS) => {
  setTimeout(() => { completeRun(runId); }, delay).unref?.();
};

/** Finishes calls left in_progress by a restart (and the two seeded live ones). */
export async function resumeInFlight() {
  try {
    const { rows } = await q(
      `SELECT * FROM ${table('AgentRun')} WHERE data->>'status' = 'in_progress' LIMIT 50`
    );
    rows.map(rowToObject).forEach((run, i) => {
      const elapsed = run.started_at ? Date.now() - new Date(run.started_at).getTime() : Infinity;
      const remaining = Math.max(3000, CALL_DURATION_MS - elapsed);
      scheduleCompletion(run.id, remaining + i * 1500);
    });
    if (rows.length) console.log(`[functions] resuming ${rows.length} in-flight call(s)`);
  } catch (err) {
    console.error('[functions] resumeInFlight failed', err.message);
  }
}

/* ------------------------------------------------------------------ */

const handlers = {
  async bolnaCall(req, body) {
    if (!hasCap(req.user.role, CAPS.DIAL)) {
      return { status: 403, payload: { error: `Your role (${req.user.role}) is not permitted to place calls.` } };
    }

    const leadId = body?.lead_id;
    if (!leadId) return { status: 400, payload: { error: 'lead_id is required' } };

    const lead = await getRow('Lead', leadId);
    if (!lead) return { status: 404, payload: { error: `Lead ${leadId} was not found` } };

    const seller = lead.seller_id ? await getRow('Seller', lead.seller_id) : null;

    const blocked = await evaluateSuppression({ lead, seller });
    if (blocked) {
      await audit({
        actor_type: 'system',
        actor_name: 'Suppression gate',
        action: 'call_blocked',
        entity_type: 'Lead',
        entity_id: leadId,
        entity_name: lead.seller_name,
        summary: `Dial blocked — ${blocked.detail}`,
        after_value: blocked.reason
      });
      return {
        status: 200,
        payload: {
          blocked: true,
          reason: `${lead.seller_name}: ${blocked.detail}`,
          suppression_reason: blocked.reason,
          lead_id: leadId
        }
      };
    }

    const startedAt = new Date().toISOString();
    const runId = newEntityId('AgentRun');
    const rng = makeRng(`live-${runId}`);
    const preview = buildCall({ seller, lead, rng, startedAt, scriptVariant: body?.script_variant });

    await insertRow('AgentRun', {
      id: runId,
      agent_key: 'sdr_qualification',
      agent_name: 'AI SDR (Meera)',
      lead_id: leadId,
      seller_id: seller.id,
      seller_name: seller.display_name,
      contact_phone: seller.contact_phone,
      channel: 'voice_out',
      status: 'in_progress',
      outcome: null,
      started_at: startedAt,
      ended_at: null,
      duration_sec: null,
      cost_usd: 0,
      script_variant: body?.script_variant || preview.script_variant,
      language: seller.preferred_language || preview.language,
      // First turn only, so the transcript pane has the opener while the call runs.
      transcript: preview.transcript.slice(0, 1),
      objections: [],
      guardrail_events: [],
      qualification: null,
      overall_sentiment: 0,
      talk_ratio: 0.5,
      signature_verified: true,
      escalation: null,
      _pending: { scenario: preview.scenario },
      created_date: startedAt
    });

    await patchRow('Lead', leadId, {
      agent_attempts: (lead.agent_attempts || 0) + 1,
      last_agent_contact_at: startedAt
    });

    await audit({
      actor_type: 'agent',
      actor_name: 'AI SDR (Meera)',
      action: 'call_placed',
      entity_type: 'AgentRun',
      entity_id: runId,
      entity_name: seller.display_name,
      summary: `Outbound qualification call placed by ${req.user.full_name || req.user.email}`
    });

    scheduleCompletion(runId);

    return { status: 200, payload: { agent_run_id: runId, id: runId, status: 'in_progress', lead_id: leadId, started_at: startedAt } };
  },

  async bolnaFetchTranscript(req, body) {
    const runId = body?.agent_run_id;
    if (!runId) return { status: 400, payload: { error: 'agent_run_id is required' } };
    const run = await getRow('AgentRun', runId);
    if (!run) return { status: 404, payload: { error: `AgentRun ${runId} was not found` } };

    if (run.status === 'in_progress') {
      return {
        status: 200,
        payload: { transcript: run.transcript || [], status: 'in_progress', note: 'Call is still connected — the full transcript lands when it ends.' }
      };
    }
    return { status: 200, payload: { transcript: run.transcript || [], status: run.status, outcome: run.outcome } };
  },

  async extractQualification(req, body) {
    const runId = body?.agent_run_id;
    if (!runId) return { status: 400, payload: { error: 'agent_run_id is required' } };
    const run = await getRow('AgentRun', runId);
    if (!run) return { status: 404, payload: { error: `AgentRun ${runId} was not found` } };
    if (!(run.transcript || []).length) {
      return { status: 200, payload: { error: 'There is no transcript on this call yet — pull the latest first.' } };
    }

    const extracted = extractFromTranscript(run.transcript);

    let escalation = run.escalation;
    const pricingBreach = extracted.guardrail_events.find((g) =>
      ['pricing_question', 'roas_guarantee_request', 'contract_terms'].includes(g.type));

    if (pricingBreach && !escalation?.triggered) {
      escalation = {
        triggered: true,
        trigger_type: pricingBreach.type,
        trigger_verbatim: pricingBreach.verbatim,
        status: 'open',
        assigned_rep: await leastLoadedRep(),
        raised_at: new Date().toISOString()
      };
      await audit({
        actor_type: 'system',
        actor_name: 'Guardrail monitor',
        action: 'escalation_raised',
        entity_type: 'AgentRun',
        entity_id: runId,
        entity_name: run.seller_name,
        summary: `Extraction found a ${pricingBreach.type.replace(/_/g, ' ')} — assigned to ${escalation.assigned_rep}`
      });
    }

    await patchRow('AgentRun', runId, {
      qualification: extracted.qualification,
      objections: extracted.objections,
      guardrail_events: extracted.guardrail_events,
      overall_sentiment: extracted.overall_sentiment,
      talk_ratio: extracted.talk_ratio,
      escalation
    });

    if (extracted.meeting_booked && run.lead_id) {
      const lead = await getRow('Lead', run.lead_id);
      if (lead && ['mql', 'nurture'].includes(lead.stage)) {
        await patchRow('Lead', run.lead_id, {
          stage: 'sql',
          sql_at: new Date().toISOString(),
          meeting_status: 'booked',
          meeting_booked_by: 'agent',
          meeting_rep: lead.assigned_rep_name
        });
      }
    }

    return {
      status: 200,
      payload: {
        ...extracted.qualification,
        qualified: extracted.qualification.qualified,
        objections: extracted.objections,
        guardrail_events: extracted.guardrail_events,
        escalated: Boolean(escalation?.triggered)
      }
    };
  },

  async checkSuppression(req, body) {
    const leadId = body?.lead_id;
    if (!leadId) return { status: 400, payload: { error: 'lead_id is required' } };
    const lead = await getRow('Lead', leadId);
    if (!lead) return { status: 404, payload: { error: `Lead ${leadId} was not found` } };
    const seller = lead.seller_id ? await getRow('Seller', lead.seller_id) : null;
    const blocked = await evaluateSuppression({ lead, seller });
    return { status: 200, payload: blocked ? { allowed: false, ...blocked } : { allowed: true } };
  }
};

export const router = express.Router();

router.use(requireAuth);

router.post('/:name', async (req, res, next) => {
  const handler = handlers[req.params.name];
  if (!handler) return res.status(404).json({ ok: false, error: `Unknown function "${req.params.name}"` });
  try {
    const { status, payload } = await handler(req, req.body || {});
    // Wrapped in `data` to match the shape src/lib/dialer.js unwraps.
    return res.status(status).json({ data: payload });
  } catch (err) {
    return next(err);
  }
});

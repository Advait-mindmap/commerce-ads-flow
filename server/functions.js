/**
 * Callable backend functions: /api/functions/:name
 *
 * placeCall is the critical path in SPEC.md — the suppression gate runs before
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
import * as voice from './voice.js';
import {
  analyseExperiment,
  assignmentsFor,
  metricCatalogue,
  validateDefinition
} from './experiments.js';

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

async function allRows(entity, limit = 5000) {
  const { rows } = await q(`SELECT * FROM ${table(entity)} LIMIT $1`, [limit]);
  return rows.map(rowToObject);
}

/** Analyses one experiment against the current populations. */
async function analyseOne(experiment) {
  const [leads, opportunities, campaigns] = await Promise.all([
    allRows('Lead'), allRows('Opportunity'), allRows('Campaign')
  ]);
  return analyseExperiment(experiment, { lead: leads, opportunity: opportunities, campaign: campaigns });
}

/**
 * Recomputes every running experiment. Concluded and stopped experiments keep
 * the numbers they were frozen at, which is what makes a decision auditable.
 */
export async function refreshExperiments() {
  const [experiments, leads, opportunities, campaigns] = await Promise.all([
    allRows('Experiment', 500), allRows('Lead'), allRows('Opportunity'), allRows('Campaign')
  ]);
  const populations = { lead: leads, opportunity: opportunities, campaign: campaigns };
  let updated = 0;

  for (const exp of experiments) {
    if (exp.status !== 'running') continue;
    const analysis = analyseExperiment(exp, populations);
    if (analysis) {
      await patchRow('Experiment', exp.id, analysis);
      updated += 1;
    }
  }
  return updated;
}

/**
 * Enrols a newly created lead into every running lead-unit experiment and
 * stamps its SLA clock. Runs server-side so it holds no matter which screen
 * created the lead.
 */
export async function enrichNewLead(lead) {
  const patch = {};
  if (!lead.experiment_assignments || !Object.keys(lead.experiment_assignments).length) {
    const experiments = await allRows('Experiment', 500);
    patch.experiment_assignments = assignmentsFor(lead.id, 'lead', experiments);
  }
  if (!lead.sla_due_at) {
    const hours = { A: 2, B: 8, C: 24, D: 48 }[lead.pta_band] ?? 24;
    patch.sla_due_at = new Date(new Date(lead.mql_at || Date.now()).getTime() + hours * 3600000).toISOString();
    patch.sla_status = 'on_track';
  }
  if (!Object.keys(patch).length) return lead;
  return (await patchRow('Lead', lead.id, patch)) || lead;
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

/**
 * Builds the template variables the voice agent opens with. This is what makes
 * the agent cite the seller's own numbers rather than a generic pitch.
 */
function callContext({ lead, seller, contact, scriptVariant }) {
  const reasons = (seller && seller.pta_reasons) || (lead && lead.pta_reasons) || [];
  const growth = seller ? Math.abs(Math.round((seller.gmv_growth_30 || 0) * 100)) : 0;
  return {
    seller_name: (lead && lead.seller_name) || (seller && seller.display_name) || 'there',
    contact_name: (contact && contact.full_name) || '',
    category: (lead && lead.category) || (seller && seller.category) || '',
    tenure_months: String(Math.round(((seller && seller.tenure_days) || 0) / 30)),
    signal_headline: reasons[0] || '',
    signal_detail: reasons[1] || '',
    organic_decline_pct: String(Math.round(((seller && seller.organic_impr_decline) || 0) * 100)),
    sku_added_30d: String((seller && seller.sku_added_30d) || 0),
    gmv_trend: (seller && seller.gmv_growth_30) > 0 ? `up ${growth}% month on month` : `down ${growth}% month on month`,
    budget_band: `${(seller && seller.budget_low) || 0} to ${(seller && seller.budget_stretch) || 0}`,
    language: (contact && contact.preferred_language) || (seller && seller.preferred_language) || 'Hindi',
    script_variant: scriptVariant || 'v3_signal_open'
  };
}

async function primaryContact(sellerId) {
  if (!sellerId) return null;
  const { rows } = await q(
    `SELECT * FROM ${table('Contact')} WHERE data @> $1::jsonb`,
    [JSON.stringify({ seller_id: sellerId })]
  );
  const contacts = rows.map(rowToObject);
  return contacts.find((c) => c.is_primary) || contacts[0] || null;
}

/**
 * Places the call through the voice provider when credentials exist,
 * otherwise runs the
 * local simulation. Returns the AgentRun fields describing how it started.
 */
/**
 * Which calls are allowed to reach the real provider.
 *
 *   manual  only numbers a person typed into the console (default)
 *   all     every dial, including ones against stored seller records
 *   none    never; always simulate
 *
 * The default is deliberate. Seeded sellers carry randomly generated Indian
 * mobile numbers, and those digits belong to real people — dialling them would
 * cold-call strangers who never opted in. Until the seller records come from a
 * genuine data source, only a number a human typed is safe to actually ring.
 */
const LIVE_DIAL_SCOPE = (process.env.LIVE_DIAL_SCOPE || 'manual').toLowerCase();

function liveDialAllowed({ manual }) {
  if (LIVE_DIAL_SCOPE === 'none') return false;
  if (LIVE_DIAL_SCOPE === 'all') return true;
  return Boolean(manual);
}

async function dial({ phone, lead, seller, contact, scriptVariant, rng, startedAt, manual = false }) {
  const userData = callContext({ lead, seller, contact, scriptVariant });

  if (voice.isConfigured() && liveDialAllowed({ manual })) {
    const result = await voice.placeCall({ phone, userData });
    if (!result.ok) {
      return { error: result.error, provider: 'live' };
    }
    return {
      provider: 'live',
      provider_call_id: result.callId,
      // A real call is genuinely queued until the provider reports otherwise;
      // the webhook or the poller moves it on.
      status: 'queued',
      call_status: 'queued',
      transcript: [],
      language: userData.language,
      script_variant: userData.script_variant
    };
  }

  // Simulated: the run starts in_progress and a timer completes it.
  const preview = buildCall({ seller, lead, rng, startedAt, scriptVariant });
  return {
    provider: 'simulated',
    status: 'in_progress',
    call_status: 'simulated',
    transcript: preview.transcript.slice(0, 1),
    language: seller?.preferred_language || preview.language,
    script_variant: scriptVariant || preview.script_variant,
    _pending: { scenario: preview.scenario }
  };
}

const handlers = {
  /**
   * Ad-hoc outbound call to a phone number typed into the console. Used for
   * live demos where there is no seeded lead to dial.
   */
  async startDial(req, body) {
    if (!hasCap(req.user.role, CAPS.DIAL)) {
      return { status: 403, payload: { error: `Your role (${req.user.role}) is not permitted to place calls.` } };
    }

    const phone = voice.normalizePhone(body?.phone_number);
    if (!phone) {
      return { status: 400, payload: { error: 'Enter a valid 10-digit Indian mobile number.' } };
    }

    // Optional context: dialling a known seller keeps the agent's opening
    // grounded in that seller's numbers.
    const seller = body?.seller_id ? await getRow('Seller', body.seller_id) : null;
    const lead = body?.lead_id ? await getRow('Lead', body.lead_id) : null;
    const contact = seller ? await primaryContact(seller.id) : null;

    // The calling-window rule still applies to ad-hoc dials; seller-specific
    // rules only apply when we actually know the seller.
    if (seller || lead) {
      const blocked = await evaluateSuppression({ lead, seller });
      if (blocked) {
        return { status: 200, payload: { blocked: true, reason: blocked.detail, suppression_reason: blocked.reason } };
      }
    } else {
      const hour = istHour();
      if (CALL_WINDOW_ENFORCED && (hour < CALL_WINDOW_START || hour >= CALL_WINDOW_END)) {
        return {
          status: 200,
          payload: {
            blocked: true,
            reason: `It is ${hour}:00 IST — outside the ${CALL_WINDOW_START}:00–${CALL_WINDOW_END}:00 calling window.`,
            suppression_reason: 'outside_calling_window'
          }
        };
      }
    }

    const startedAt = new Date().toISOString();
    const runId = newEntityId('AgentRun');
    const rng = makeRng(`live-${runId}`);
    const started = await dial({
      phone, lead, seller, contact, rng, startedAt,
      scriptVariant: body?.script_variant,
      manual: true
    });

    if (started.error) {
      return { status: 502, payload: { error: `Could not place the call: ${started.error}` } };
    }

    await insertRow('AgentRun', {
      id: runId,
      agent_key: 'sdr_qualification',
      agent_name: 'AI SDR (Meera)',
      lead_id: lead?.id || null,
      seller_id: seller?.id || null,
      seller_name: seller?.display_name || body?.label || phone,
      contact_phone: phone,
      channel: 'voice_out',
      outcome: null,
      started_at: startedAt,
      ended_at: null,
      duration_sec: null,
      cost_usd: 0,
      objections: [],
      guardrail_events: [],
      qualification: null,
      overall_sentiment: 0,
      talk_ratio: 0.5,
      signature_verified: false,
      escalation: null,
      is_manual_dial: true,
      created_date: startedAt,
      ...started
    });

    if (lead) {
      await patchRow('Lead', lead.id, {
        agent_attempts: (lead.agent_attempts || 0) + 1,
        last_agent_contact_at: startedAt
      });
    }

    await audit({
      actor_type: 'human_rep',
      actor_name: req.user.full_name || req.user.email,
      action: 'manual_call_placed',
      entity_type: 'AgentRun',
      entity_id: runId,
      entity_name: seller?.display_name || phone,
      summary: `Manual outbound call to ${phone} via ${started.provider}`
    });

    if (started.provider === 'simulated') scheduleCompletion(runId);

    return {
      status: 200,
      payload: {
        agent_run_id: runId,
        id: runId,
        status: started.status,
        provider: started.provider,
        phone,
        provider_call_id: started.provider_call_id || null
      }
    };
  },

  /** Metric catalogue for the experiment builder. */
  async experimentMetrics() {
    return { status: 200, payload: { metrics: metricCatalogue() } };
  },

  /** Creates an experiment from a user-supplied definition. */
  async createExperiment(req, body) {
    if (!hasCap(req.user.role, CAPS.APPROVE_OPTIMIZATION) && req.user.role !== 'admin') {
      return { status: 403, payload: { error: `Your role (${req.user.role}) cannot create experiments.` } };
    }

    const { errors, definition } = validateDefinition(body || {});
    if (errors) return { status: 400, payload: { error: errors.join('; ') } };

    const existing = await allRows('Experiment');
    if (existing.some((e) => e.experiment_key === definition.experiment_key)) {
      return { status: 409, payload: { error: `An experiment with key "${definition.experiment_key}" already exists.` } };
    }

    const created = await insertRow('Experiment', {
      ...definition,
      created_by: req.user.full_name || req.user.email
    });

    // Analyse immediately so it opens with real arms rather than blank.
    const analysis = await analyseOne(created);
    const saved = analysis ? await patchRow('Experiment', created.id, analysis) : created;

    await audit({
      actor_type: 'human_rep',
      actor_name: req.user.full_name || req.user.email,
      action: 'experiment_created',
      entity_type: 'Experiment',
      entity_id: created.id,
      entity_name: created.name,
      summary: `Created on ${definition.primary_metric.replace(/_/g, ' ')} over ${definition.unit_type} units, ${definition.required_n_per_arm} required per arm`
    });

    return { status: 201, payload: saved };
  },

  /** Start / stop / conclude an experiment. */
  async setExperimentStatus(req, body) {
    if (!hasCap(req.user.role, CAPS.APPROVE_OPTIMIZATION) && req.user.role !== 'admin') {
      return { status: 403, payload: { error: `Your role (${req.user.role}) cannot change experiment status.` } };
    }
    const { experiment_id, status, note } = body || {};
    const allowed = ['running', 'paused', 'concluded', 'stopped_guardrail'];
    if (!allowed.includes(status)) return { status: 400, payload: { error: `Status must be one of ${allowed.join(', ')}` } };

    const exp = await getRow('Experiment', experiment_id);
    if (!exp) return { status: 404, payload: { error: 'Experiment not found' } };

    // Freeze the numbers at the moment of the decision.
    const analysis = await analyseOne(exp);
    const decision = status === 'running'
      ? 'in_flight'
      : status === 'stopped_guardrail'
        ? 'stopped_on_guardrail'
        : status === 'concluded'
          ? (analysis?.significant && analysis?.moved_right_way ? 'ship_treatment' : 'keep_control')
          : 'paused';

    const updated = await patchRow('Experiment', experiment_id, {
      ...(analysis || {}),
      status,
      decision,
      status_note: note || (status === 'concluded'
        ? (analysis?.significant ? 'Treatment promoted — significant on the always-valid p-value.' : 'No significant difference — control retained.')
        : `Status set to ${status}.`),
      ended_at: status === 'running' ? null : new Date().toISOString()
    });

    await audit({
      actor_type: 'human_rep',
      actor_name: req.user.full_name || req.user.email,
      action: `experiment_${status}`,
      entity_type: 'Experiment',
      entity_id: experiment_id,
      entity_name: exp.name,
      summary: note || `Experiment moved to ${status}`,
      before_value: exp.status,
      after_value: status
    });

    return { status: 200, payload: updated };
  },

  /** Recomputes every running experiment on demand. */
  async analyseExperiments() {
    const n = await refreshExperiments();
    return { status: 200, payload: { analysed: n } };
  },

  async placeCall(req, body) {
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

    const phone = voice.normalizePhone(seller.contact_phone);
    if (!phone) {
      return { status: 400, payload: { error: `No usable phone number on ${seller.display_name}.` } };
    }

    const startedAt = new Date().toISOString();
    const runId = newEntityId('AgentRun');
    const rng = makeRng(`live-${runId}`);
    const contact = await primaryContact(seller.id);

    const started = await dial({
      phone, lead, seller, contact, rng, startedAt,
      scriptVariant: body?.script_variant
    });
    if (started.error) {
      return { status: 502, payload: { error: `Could not place the call: ${started.error}` } };
    }

    await insertRow('AgentRun', {
      id: runId,
      agent_key: 'sdr_qualification',
      agent_name: 'AI SDR (Meera)',
      lead_id: leadId,
      seller_id: seller.id,
      seller_name: seller.display_name,
      contact_phone: phone,
      channel: 'voice_out',
      outcome: null,
      started_at: startedAt,
      ended_at: null,
      duration_sec: null,
      cost_usd: 0,
      objections: [],
      guardrail_events: [],
      qualification: null,
      overall_sentiment: 0,
      talk_ratio: 0.5,
      signature_verified: false,
      escalation: null,
      created_date: startedAt,
      ...started
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
      summary: `Outbound qualification call to ${phone} via ${started.provider}, placed by ${req.user.full_name || req.user.email}`
    });

    // Only the simulator needs a timer; a real call is advanced by the webhook
    // or by polling the provider.
    if (started.provider === 'simulated') scheduleCompletion(runId);

    return {
      status: 200,
      payload: {
        agent_run_id: runId,
        id: runId,
        status: started.status,
        provider: started.provider,
        provider_call_id: started.provider_call_id || null,
        lead_id: leadId,
        started_at: startedAt
      }
    };
  },

  async fetchTranscript(req, body) {
    const runId = body?.agent_run_id;
    if (!runId) return { status: 400, payload: { error: 'agent_run_id is required' } };
    const run = await getRow('AgentRun', runId);
    if (!run) return { status: 404, payload: { error: `AgentRun ${runId} was not found` } };

    // A provider-backed call is pulled live; this is the path that turns a
    // queued real call into a transcript without waiting for the webhook.
    if (run.provider_call_id && voice.isConfigured()) {
      const execution = await voice.fetchExecution(run.provider_call_id);
      if (!execution) {
        return { status: 200, payload: { error: 'The call has not been published yet — try again shortly.', transcript: run.transcript || [] } };
      }
      const read = voice.readExecution(execution);
      const patch = {
        call_status: read.rawStatus || run.call_status,
        status: read.status,
        duration_sec: read.duration_sec || run.duration_sec || 0,
        recording_url: read.recording_url || run.recording_url || null,
        transcript: read.transcript.length ? read.transcript : (run.transcript || []),
        cost_usd: read.cost_usd || run.cost_usd || 0
      };
      // A finished call with turns should carry an outcome for the console.
      if (read.status === 'completed' && !run.outcome) {
        patch.outcome = read.transcript.length ? 'qualified' : 'no_answer';
      }
      await patchRow('AgentRun', runId, patch);
      return { status: 200, payload: { transcript: patch.transcript, status: patch.status, call_status: patch.call_status, duration_seconds: patch.duration_sec, recording_url: patch.recording_url } };
    }

    if (['in_progress', 'queued'].includes(run.status)) {
      return {
        status: 200,
        payload: { transcript: run.transcript || [], status: run.status, note: 'Call is still connected — the full transcript lands when it ends.' }
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

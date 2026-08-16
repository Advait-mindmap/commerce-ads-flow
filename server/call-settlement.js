/**
 * Turning a finished provider call into a parsed AgentRun.
 *
 * One implementation, two callers. The webhook is the primary path — the
 * provider pushes each status change and we settle the run from that event.
 * The poller is a reconciliation fallback for calls whose webhook never
 * arrived, because a dropped delivery used to leave a row stuck on the console
 * with no duration and no outcome.
 *
 * Settlement is idempotent: a webhook and a poll landing on the same call
 * produce the same result, and a run already completed is left alone.
 */

import crypto from 'crypto';
import { q, rowToObject, tableFor } from './db.js';
import { extractFromTranscript } from './call-sim.js';

const table = (entity) => tableFor(entity);
const newEntityId = (entity) => `${entity.toLowerCase()}_${crypto.randomBytes(8).toString('hex')}`;

async function getRow(entity, id) {
  const { rows } = await q(`SELECT * FROM ${table(entity)} WHERE id = $1`, [id]);
  return rows[0] ? rowToObject(rows[0]) : null;
}

export async function patchRow(entity, id, patch) {
  const { rows } = await q(
    `UPDATE ${table(entity)} SET data = data || $2::jsonb, updated_date = NOW() WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(patch)]
  );
  return rows[0] ? rowToObject(rows[0]) : null;
}

async function insertRow(entity, payload) {
  const { id, ...rest } = payload;
  await q(
    `INSERT INTO ${table(entity)} (id, data) VALUES ($1, $2::jsonb)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = NOW()`,
    [id || newEntityId(entity), JSON.stringify(rest)]
  );
}

const audit = (entry) => insertRow('AuditLog', { timestamp: new Date().toISOString(), ...entry });

/** Least-loaded rep by open assigned leads, for escalation routing. */
async function leastLoadedRep() {
  const { rows } = await q(`SELECT data FROM ${table('Lead')}`);
  const load = {};
  rows.forEach(({ data }) => {
    if (!data?.assigned_rep_name) return;
    if (!['mql', 'sql', 'opportunity'].includes(data.stage)) return;
    load[data.assigned_rep_name] = (load[data.assigned_rep_name] || 0) + 1;
  });
  const entries = Object.entries(load);
  return entries.length ? entries.sort((a, b) => a[1] - b[1])[0][0] : 'Unassigned';
}

/**
 * Distributes turns across the call's real duration, weighted by how much was
 * said in each. Providers rarely timestamp individual turns, and a transcript
 * with no timing makes the replay control meaningless.
 */
export function spreadTurnsOver(turns, totalSec) {
  const weights = turns.map((t) => Math.max(1, String(t.content || '').length));
  const total = weights.reduce((a, w) => a + w, 0) || 1;
  let elapsed = 0;
  return turns.map((t, i) => {
    const at = Math.round(elapsed);
    elapsed += (weights[i] / total) * totalSec;
    return { ...t, timestamp_sec: at, sentiment: t.sentiment ?? 0 };
  });
}

/** Outcome derived from what was actually said, not from status alone. */
export function deriveOutcome(extracted, transcript, escalated) {
  if (!transcript || transcript.length === 0) return 'no_answer';
  if (extracted?.meeting_booked) return 'meeting_booked';
  const objections = extracted?.objections || [];
  if (objections.some((o) => o.objection_type === 'not_interested')) return 'not_interested';
  if (objections.some((o) => o.objection_type === 'no_time')) return 'callback_requested';
  if (extracted?.qualification?.qualified) return 'qualified';
  if (escalated) return 'escalated';
  return 'not_qualified';
}

/** Finds the run an event belongs to, by call id then by recent phone match. */
export async function findRunForCall({ callId, phoneLast10 }) {
  if (callId) {
    const { rows } = await q(
      `SELECT * FROM ${table('AgentRun')} WHERE data @> $1::jsonb LIMIT 1`,
      [JSON.stringify({ provider_call_id: String(callId) })]
    );
    if (rows[0]) return rowToObject(rows[0]);
  }
  if (phoneLast10) {
    const { rows } = await q(
      `SELECT * FROM ${table('AgentRun')} WHERE data @> $1::jsonb
       ORDER BY data->>'started_at' DESC LIMIT 1`,
      [JSON.stringify({ contact_phone: `+91${phoneLast10}` })]
    );
    if (rows[0]) return rowToObject(rows[0]);
  }
  return null;
}

/**
 * Applies a provider event to a run.
 *
 * `read` is the normalised shape from voice.readExecution(). `source` is
 * recorded so it is always clear whether a call was settled by a pushed event
 * or picked up later by reconciliation.
 */
export async function settleRun(run, read, { source = 'webhook', signatureVerified = null } = {}) {
  if (!run || !read) return { settled: false, reason: 'missing run or payload' };

  // Mid-call events keep the row current without closing it.
  if (['queued', 'in_progress'].includes(read.status)) {
    await patchRow('AgentRun', run.id, {
      status: read.status,
      call_status: read.rawStatus,
      duration_sec: read.duration_sec || run.duration_sec || 0,
      ...(signatureVerified === null ? {} : { signature_verified: signatureVerified })
    });
    return { settled: false, status: read.status };
  }

  // Already closed by whichever path got there first.
  if (run.status === 'completed' && run.outcome) {
    return { settled: false, reason: 'already settled', status: run.status };
  }

  const rawTranscript = read.transcript.length ? read.transcript : (run.transcript || []);

  /*
   * The provider closes a call before it finalises the duration, so a
   * completion event routinely arrives reporting zero seconds alongside a full
   * transcript. Falling back to the wall clock between placing the call and
   * this event gives an accurate figure immediately, instead of showing 00:00
   * against a real conversation.
   */
  const wallClockSec = run.started_at
    ? Math.max(0, Math.round((Date.now() - new Date(run.started_at).getTime()) / 1000))
    : 0;
  const durationSec = read.duration_sec > 0
    ? read.duration_sec
    : (rawTranscript.length ? wallClockSec : 0);

  // With a real duration known, spread the turns across it so the replay on
  // Call Detail runs to the length the call actually took.
  const transcript = durationSec > 0 && rawTranscript.length
    ? spreadTurnsOver(rawTranscript, durationSec)
    : rawTranscript;

  const extracted = transcript.length ? extractFromTranscript(transcript) : null;

  let escalation = run.escalation;
  const breach = (extracted?.guardrail_events || []).find((g) =>
    ['pricing_question', 'roas_guarantee_request', 'contract_terms'].includes(g.type));
  if (breach && !escalation?.triggered) {
    escalation = {
      triggered: true,
      trigger_type: breach.type,
      trigger_verbatim: breach.verbatim,
      status: 'open',
      assigned_rep: await leastLoadedRep(),
      raised_at: new Date().toISOString()
    };
  }

  const outcome = deriveOutcome(extracted, transcript, Boolean(escalation?.triggered));

  await patchRow('AgentRun', run.id, {
    status: 'completed',
    call_status: read.rawStatus,
    outcome,
    ended_at: new Date().toISOString(),
    duration_sec: durationSec,
    cost_usd: read.cost_usd || run.cost_usd || 0,
    recording_url: read.recording_url || run.recording_url || null,
    transcript,
    qualification: extracted?.qualification || null,
    objections: extracted?.objections || [],
    guardrail_events: extracted?.guardrail_events || [],
    overall_sentiment: extracted?.overall_sentiment ?? 0,
    talk_ratio: extracted?.talk_ratio ?? 0.5,
    escalation,
    settled_by: source,
    ...(signatureVerified === null ? {} : { signature_verified: signatureVerified })
  });

  if (transcript.length) {
    await insertRow('Interaction', {
      id: `int_${run.id}`,
      seller_id: run.seller_id,
      seller_name: run.seller_name,
      lead_id: run.lead_id,
      agent_run_id: run.id,
      channel: 'voice_out',
      actor_type: 'agent',
      actor_name: run.agent_name || 'AI SDR',
      direction: 'outbound',
      outcome,
      disposition: outcome,
      duration_sec: durationSec,
      summary: `Call ${outcome.replace(/_/g, ' ')} with ${transcript.length} conversation turns.`,
      objections: (extracted?.objections || []).map((o) => o.objection_type),
      sentiment_score: extracted?.overall_sentiment ?? 0,
      started_at: run.started_at || new Date().toISOString()
    });
  }

  // A booked meeting advances the lead, exactly as a simulated call does.
  if (run.lead_id && extracted?.meeting_booked) {
    const lead = await getRow('Lead', run.lead_id);
    if (lead) {
      await patchRow('Lead', run.lead_id, {
        stage: ['mql', 'nurture'].includes(lead.stage) ? 'sql' : lead.stage,
        sql_at: lead.sql_at || new Date().toISOString(),
        meeting_status: 'booked',
        meeting_booked_by: 'agent',
        meeting_rep: lead.assigned_rep_name || null,
        agent_disposition: outcome,
        sla_status: 'met'
      });
    }
  }

  await audit({
    actor_type: 'agent',
    actor_name: run.agent_name || 'AI SDR',
    action: 'call_completed',
    entity_type: 'AgentRun',
    entity_id: run.id,
    entity_name: run.seller_name,
    summary: `Call finished as ${outcome.replace(/_/g, ' ')} with ${transcript.length} turn(s), settled by ${source}`
  });

  return { settled: true, outcome, turns: transcript.length };
}

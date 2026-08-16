/**
 * Settles real, provider-backed calls.
 *
 * A live call is placed and then nothing brings it back: the provider has no
 * webhook configured, so no completion event arrives, and the console is left
 * showing a row with no duration and no outcome. This poller closes that gap.
 *
 * It also runs the same extraction the Call Detail button runs, so the
 * qualification, objections, guardrails, sentiment and talk ratio are filled in
 * automatically — a rep should not have to open a record and press a button
 * before the console tells the truth about a call.
 *
 * Simulated calls are handled elsewhere and are deliberately excluded here.
 */

import crypto from 'crypto';
import { q, rowToObject, tableFor } from './db.js';
import * as voice from './voice.js';
import { extractFromTranscript } from './call-sim.js';

const table = (entity) => tableFor(entity);
// Defined locally so this module depends only on the data layer.
const newEntityId = (entity) => `${entity.toLowerCase()}_${crypto.randomBytes(8).toString('hex')}`;
const GIVE_UP_AFTER_MS = 20 * 60 * 1000;

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

export async function pollLiveCalls() {
  if (!voice.isConfigured()) return 0;

  const { rows } = await q(
    `SELECT * FROM ${table('AgentRun')}
     WHERE data->>'status' IN ('queued', 'in_progress')
       AND data->>'provider_call_id' IS NOT NULL
     LIMIT 25`
  );
  const runs = rows.map(rowToObject);
  let settled = 0;

  for (const run of runs) {
    try {
      const execution = await voice.fetchExecution(run.provider_call_id);

      if (!execution) {
        // Stop waiting on a call the provider never published, rather than
        // leaving the row pending on the console forever.
        const age = Date.now() - new Date(run.started_at || 0).getTime();
        if (age > GIVE_UP_AFTER_MS) {
          await patchRow('AgentRun', run.id, {
            status: 'completed',
            outcome: 'failed',
            ended_at: new Date().toISOString()
          });
          settled += 1;
        }
        continue;
      }

      const read = voice.readExecution(execution);

      if (['queued', 'in_progress'].includes(read.status)) {
        // Still connected — keep the duration current but leave it open.
        await patchRow('AgentRun', run.id, {
          status: read.status,
          call_status: read.rawStatus,
          duration_sec: read.duration_sec || run.duration_sec || 0
        });
        continue;
      }

      const transcript = read.transcript.length ? read.transcript : (run.transcript || []);
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
        duration_sec: read.duration_sec || 0,
        cost_usd: read.cost_usd || run.cost_usd || 0,
        recording_url: read.recording_url || run.recording_url || null,
        transcript,
        qualification: extracted?.qualification || null,
        objections: extracted?.objections || [],
        guardrail_events: extracted?.guardrail_events || [],
        overall_sentiment: extracted?.overall_sentiment ?? 0,
        talk_ratio: extracted?.talk_ratio ?? 0.5,
        escalation
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
          duration_sec: read.duration_sec || 0,
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
        summary: `Call finished as ${outcome.replace(/_/g, ' ')} with ${transcript.length} turn(s)`
      });

      settled += 1;
    } catch (err) {
      console.error('[poll] failed for run', run.id, err.message);
    }
  }

  return settled;
}

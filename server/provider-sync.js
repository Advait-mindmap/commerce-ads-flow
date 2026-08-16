/**
 * Pulling every real call back from the voice provider.
 *
 * The webhook settles calls as they happen, but it is not the whole truth: a
 * call placed from the provider's own console, one whose webhook was dropped,
 * or one made before the endpoint was configured exists only on the provider's
 * side. Reading the executions list is the only way for the console to show
 * everything that actually happened.
 *
 * This is a reconciliation, not a fetch. Executions already known are settled
 * through the same path as a webhook, so a synced call and a pushed one are
 * identical records. Executions with no matching run are adopted, so a call
 * placed outside the app still lands on the console with its transcript.
 */

import { q, rowToObject, tableFor } from './db.js';
import * as voice from './voice.js';
import { findRunForCall, settleRun } from './call-settlement.js';

const table = (entity) => tableFor(entity);

async function insertRow(entity, payload) {
  const { id, ...rest } = payload;
  await q(
    `INSERT INTO ${table(entity)} (id, data) VALUES ($1, $2::jsonb)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = NOW()`,
    [id, JSON.stringify(rest)]
  );
}

/** Finds the seller a phone number belongs to, so an adopted call is attributed. */
async function sellerForPhone(phoneLast10) {
  if (!phoneLast10) return null;
  const { rows } = await q(`SELECT * FROM ${table('Contact')}`);
  const contact = rows
    .map(rowToObject)
    .find((c) => voice.last10(c.phone) === phoneLast10);
  if (!contact) return null;
  const { rows: sellerRows } = await q(`SELECT * FROM ${table('Seller')} WHERE id = $1`, [contact.seller_id]);
  return sellerRows[0] ? { seller: rowToObject(sellerRows[0]), contact } : null;
}

/**
 * Reconciles the app against the provider.
 *
 * Returns a per-call account rather than a count, because "synced 4" tells you
 * nothing about the one that is still missing its transcript.
 */
export async function syncFromProvider({ adopt = true } = {}) {
  if (!voice.isConfigured()) {
    return { ok: false, error: 'No voice provider is configured.', calls: [] };
  }

  const executions = await voice.listExecutions();
  const calls = [];

  for (const execution of executions) {
    const callId = voice.extractCallId(execution) || execution.id || execution.execution_id;
    if (!callId) continue;

    const read = voice.readExecution(execution);
    const phone = voice.last10(
      read.to_number || execution.user_number || execution.recipient_phone_number || execution.phone_number || ''
    );

    let run = await findRunForCall({ callId, phoneLast10: null });

    // A call the app never recorded — placed from the provider's console, or
    // recorded before the integration existed. Adopt it so the console is
    // complete rather than quietly missing real conversations.
    if (!run && adopt) {
      if (['queued', 'in_progress'].includes(read.status)) continue;

      const match = await sellerForPhone(phone);
      // The agent was told who it was calling; use that when the number is not
      // one of ours, so an adopted call is not left as "Unknown".
      const toldName = read.recipient?.seller_name && read.recipient.seller_name !== 'there'
        ? read.recipient.seller_name
        : null;
      const runId = `agentrun_sync_${String(callId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;
      const startedAt = execution.created_at || execution.started_at || new Date().toISOString();

      await insertRow('AgentRun', {
        id: runId,
        agent_key: 'sdr_qualification',
        agent_name: 'AI SDR (Meera)',
        seller_id: match?.seller?.id || null,
        seller_name: match?.seller?.display_name || toldName || (phone ? `+91${phone}` : 'Unknown caller'),
        contact_phone: phone ? `+91${phone}` : null,
        channel: 'voice_out',
        status: 'queued',
        provider_call_id: String(callId),
        started_at: startedAt,
        language: read.recipient?.language || null,
        from_number: read.from_number || null,
        transcript: [],
        adopted_from_provider: true
      });

      run = await findRunForCall({ callId, phoneLast10: null });
      calls.push({ callId, action: 'adopted', seller: match?.seller?.display_name || null });
    }

    if (!run) continue;

    const before = (run.transcript || []).length;
    const result = await settleRun(run, read, { source: 'provider_sync' });

    if (result.settled) {
      calls.push({
        callId,
        action: 'settled',
        seller: run.seller_name,
        turns: result.turns,
        outcome: result.outcome
      });
      continue;
    }

    /*
     * Already settled, but the provider may now hold a transcript the app
     * settled without — the completion event routinely arrives before the
     * transcript is finalised, and settlement is one-way. Backfilling here is
     * what turns a call recorded as "no answer with no turns" into the
     * conversation that actually took place.
     */
    if (read.transcript.length > before) {
      const durationSec = read.duration_sec > 0 ? read.duration_sec : run.duration_sec;
      await settleRun(
        { ...run, status: 'queued', outcome: null },
        { ...read, duration_sec: durationSec },
        { source: 'provider_sync' }
      );
      calls.push({
        callId,
        action: 'backfilled',
        seller: run.seller_name,
        turns: read.transcript.length,
        was: before
      });
      continue;
    }

    calls.push({ callId, action: 'unchanged', seller: run.seller_name, turns: before });
  }

  return {
    ok: true,
    executions: executions.length,
    changed: calls.filter((c) => c.action !== 'unchanged').length,
    calls
  };
}

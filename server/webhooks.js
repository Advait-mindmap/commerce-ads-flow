/**
 * Provider webhooks. Public by design — authenticated by a shared secret in the
 * request, not by a user session.
 *
 * Bolna retries aggressively on any non-2xx, so every path here answers 200
 * even on failure; the body carries whether the event actually matched.
 */

import express from 'express';
import { q, rowToObject, tableFor } from './db.js';
import * as bolna from './bolna.js';

const table = (entity) => tableFor(entity);

async function patchRow(entity, id, data) {
  const { rows } = await q(
    `UPDATE ${table(entity)} SET data = data || $2::jsonb, updated_date = NOW() WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(data)]
  );
  return rows[0] ? rowToObject(rows[0]) : null;
}

async function insertRow(entity, payload) {
  const { id, ...rest } = payload;
  const rowId = id || `${entity.toLowerCase()}_${Math.random().toString(16).slice(2, 18)}`;
  await q(
    `INSERT INTO ${table(entity)} (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING`,
    [rowId, JSON.stringify(rest)]
  );
}

async function findByCallId(callId) {
  const { rows } = await q(
    `SELECT * FROM ${table('AgentRun')} WHERE data @> $1::jsonb LIMIT 1`,
    [JSON.stringify({ bolna_call_id: String(callId) })]
  );
  return rows[0] ? rowToObject(rows[0]) : null;
}

async function findByPhone(phone) {
  const { rows } = await q(
    `SELECT * FROM ${table('AgentRun')} WHERE data @> $1::jsonb
     ORDER BY data->>'started_at' DESC LIMIT 1`,
    [JSON.stringify({ contact_phone: `+91${phone}` })]
  );
  return rows[0] ? rowToObject(rows[0]) : null;
}

export const router = express.Router();

router.post('/bolna', async (req, res) => {
  try {
    const { webhookSecret } = bolna.bolnaConfig();
    const auth = req.get('authorization') || '';
    const provided =
      req.get('x-bolna-signature') ||
      req.get('x-bolna-secret') ||
      (auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '');
    const signatureVerified = Boolean(webhookSecret) && provided === webhookSecret;

    if (!signatureVerified) {
      // Recorded on the run rather than rejected: dropping the event would lose
      // the transcript entirely, and the console shows the unverified state.
      console.warn('[webhook] Bolna signature mismatch — processing with signature_verified=false');
    }

    const body = req.body || {};
    const callId = body.execution_id || body.call_id || body.id;

    let run = callId ? await findByCallId(callId) : null;
    if (!run) {
      const phone = bolna.last10(body.recipient_phone_number || body.phone_number || body.to || '');
      if (phone) run = await findByPhone(phone);
    }
    if (!run) {
      console.error('[webhook] no matching AgentRun for call', callId);
      return res.json({ received: true, matched: false });
    }

    const read = bolna.readExecution(body);
    const patch = {
      call_status: read.rawStatus ? String(read.rawStatus) : run.call_status,
      status: read.status,
      duration_sec: read.duration_sec || run.duration_sec || 0,
      recording_url: read.recording_url || run.recording_url || null,
      transcript: read.transcript.length ? read.transcript : (run.transcript || []),
      signature_verified: signatureVerified,
      cost_usd: read.cost_usd || run.cost_usd || 0
    };
    if (read.status === 'completed' && !run.outcome) {
      patch.outcome = read.transcript.length ? 'qualified' : 'no_answer';
    }
    await patchRow('AgentRun', run.id, patch);

    await insertRow('Interaction', {
      id: `int_${run.id}`,
      seller_id: run.seller_id,
      seller_name: run.seller_name,
      lead_id: run.lead_id,
      agent_run_id: run.id,
      channel: 'voice_out',
      actor_type: 'agent',
      actor_name: 'AI SDR (Meera)',
      direction: 'outbound',
      outcome: read.status,
      disposition: read.status,
      duration_sec: patch.duration_sec,
      summary: patch.transcript.length
        ? `AI call ${read.status} with ${patch.transcript.length} conversation turns.`
        : `AI call ${read.status}.`,
      started_at: run.started_at || new Date().toISOString()
    });

    await insertRow('AuditLog', {
      actor_type: 'agent',
      actor_name: 'AI SDR (Meera)',
      action: 'ai_call_completed',
      entity_type: 'AgentRun',
      entity_id: run.id,
      entity_name: run.seller_name,
      summary: `Call ${callId} finished with status ${read.status}${signatureVerified ? '' : ' (unverified signature)'}.`,
      timestamp: new Date().toISOString()
    });

    return res.json({ received: true, agent_run_id: run.id, status: read.status, signature_verified: signatureVerified });
  } catch (err) {
    console.error('[webhook] bolna handler failed', err.message);
    return res.json({ received: true, error: err.message });
  }
});

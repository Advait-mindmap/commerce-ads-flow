/**
 * Provider webhooks. Public by design — authenticated by a shared secret in the
 * request, not by a user session.
 *
 * This is the primary way a call's result reaches the app: the provider pushes
 * each status change and the run is settled from that event. The poller exists
 * only to reconcile calls whose delivery never arrived.
 *
 * The provider retries aggressively on any non-2xx, so every path here answers
 * 200 even on failure; the body carries whether the event actually matched.
 */

import express from 'express';
import * as voice from './voice.js';
import { findRunForCall, settleRun } from './call-settlement.js';

export const router = express.Router();

async function handleVoiceEvent(req, res) {
  try {
    const { webhookSecret } = voice.providerConfig();
    const auth = req.get('authorization') || '';
    // Header names are dictated by the provider, so they stay as sent.
    const provided =
      req.get('x-bolna-signature') ||
      req.get('x-bolna-secret') ||
      req.get('x-webhook-secret') ||
      (auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '');

    // An unverified event is processed rather than dropped — refusing it would
    // lose the transcript entirely. The run records that it was unverified.
    const signatureVerified = Boolean(webhookSecret) && provided === webhookSecret;
    if (!signatureVerified) {
      console.warn('[webhook] unverified voice event — processing with signature_verified=false');
    }

    const body = req.body || {};
    const callId = body.execution_id || body.call_id || body.id;
    const phone = voice.last10(body.recipient_phone_number || body.phone_number || body.to || '');

    const run = await findRunForCall({ callId, phoneLast10: phone });
    if (!run) {
      console.error('[webhook] no matching call record for', callId || phone || '(no identifier)');
      return res.json({ received: true, matched: false });
    }

    const read = voice.readExecution(body);

    // Some events carry status but no turns. If this one closes the call and
    // has no transcript, read the execution back so the run is settled with the
    // conversation attached rather than as an empty no-answer.
    if (!read.transcript.length && !['queued', 'in_progress'].includes(read.status) && run.provider_call_id) {
      const execution = await voice.fetchExecution(run.provider_call_id);
      if (execution) {
        const full = voice.readExecution(execution);
        if (full.transcript.length) {
          read.transcript = full.transcript;
          read.duration_sec = read.duration_sec || full.duration_sec;
          read.recording_url = read.recording_url || full.recording_url;
          read.cost_usd = read.cost_usd || full.cost_usd;
        }
      }
    }

    const result = await settleRun(run, read, { source: 'webhook', signatureVerified });

    return res.json({
      received: true,
      matched: true,
      agent_run_id: run.id,
      status: read.status,
      settled: result.settled,
      outcome: result.outcome || null,
      signature_verified: signatureVerified
    });
  } catch (err) {
    console.error('[webhook] voice handler failed', err.message);
    return res.json({ received: true, error: err.message });
  }
}

// Both paths are accepted. The provider-named one is what is already configured
// in the console, and changing a live webhook URL is a needless way to lose
// events. Neither path is ever shown to a user.
router.post('/voice', handleVoiceEvent);
router.post('/bolna', handleVoiceEvent);

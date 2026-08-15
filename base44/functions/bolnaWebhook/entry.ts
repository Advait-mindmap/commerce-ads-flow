import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { normalizeTranscript, mapStatus, last10 } from '../../shared/bolna.ts';

export default async function (req) {
  // Always answer 200 — Bolna retries aggressively on non-2xx.
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const secret = secrets.get('BOLNA_WEBHOOK_SECRET');
    const auth = req.headers.get('authorization') || '';
    const provided =
      req.headers.get('x-bolna-signature') ||
      req.headers.get('x-bolna-secret') ||
      (auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '');
    const signatureVerified = !!secret && provided === secret;
    if (!signatureVerified) {
      console.warn('Bolna webhook signature mismatch — processing with signature_verified=false');
    }

    let body = {};
    try {
      body = await req.json();
    } catch (_e) {
      console.error('Bolna webhook: unparseable body');
      return Response.json({ received: true, error: 'unparseable body' });
    }

    const callId = body.execution_id || body.call_id || body.id;
    const rawStatus = body.status || body.call_status || body.state;
    const duration = body.duration || body.duration_seconds || body.call_duration || 0;
    const recording = body.recording_url || body.recordingUrl || null;
    const rawTranscript =
      body.transcript || (body.data && body.data.transcript) || (body.call && body.call.transcript) || body.messages;

    let run = null;
    if (callId) {
      const found = await svc.entities.AgentRun.filter({ bolna_call_id: String(callId) });
      run = found[0] || null;
    }
    if (!run) {
      const phone = last10(body.recipient_phone_number || body.phone_number || body.to || '');
      if (phone) {
        const recent = await svc.entities.AgentRun.filter({ contact_phone: '+91' + phone }, '-started_at', 5);
        run = recent[0] || null;
      }
    }
    if (!run) {
      console.error('Bolna webhook: no matching AgentRun for call', callId);
      return Response.json({ received: true, matched: false });
    }

    const turns = normalizeTranscript(rawTranscript);
    const status = mapStatus(rawStatus);

    await svc.entities.AgentRun.update(run.id, {
      call_status: rawStatus ? String(rawStatus) : run.call_status,
      status,
      duration_sec: Number(duration) || 0,
      recording_url: recording || run.recording_url,
      transcript: turns.length ? turns : run.transcript,
      signature_verified: signatureVerified
    });

    await svc.entities.Interaction.create({
      seller_id: run.seller_id,
      seller_name: run.seller_name,
      lead_id: run.lead_id,
      agent_run_id: run.id,
      channel: 'voice_out',
      actor_type: 'agent',
      actor_name: 'Meera (AI)',
      direction: 'outbound',
      outcome: status,
      disposition: status,
      duration_sec: Number(duration) || 0,
      summary: turns.length ? `AI call ${status} with ${turns.length} conversation turns.` : `AI call ${status}.`,
      started_at: run.started_at || new Date().toISOString()
    });

    await svc.entities.AuditLog.create({
      actor_type: 'agent',
      actor_name: 'Meera (AI)',
      action: 'ai_call_completed',
      entity_type: 'AgentRun',
      entity_id: run.id,
      entity_name: run.seller_name,
      summary: `Bolna call ${callId} finished with status ${status}${signatureVerified ? '' : ' (unverified signature)'}.`,
      timestamp: new Date().toISOString()
    });

    return Response.json({ received: true, agent_run_id: run.id, status, signature_verified: signatureVerified });
  } catch (error) {
    console.error('Bolna webhook error:', error.message);
    return Response.json({ received: true, error: error.message });
  }
}
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { normalizeTranscript, mapStatus } from '../../shared/bolna.ts';

async function tryGet(url, key) {
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) return null;
    const t = await r.text();
    try { return JSON.parse(t); } catch (_e) { return null; }
  } catch (_e) {
    return null;
  }
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole;
    const apiKey = secrets.get('BOLNA_API_KEY');
    const agentId = secrets.get('BOLNA_AGENT_ID');

    let run = null;
    let callId = body.call_id || null;
    if (body.agent_run_id) {
      run = await svc.entities.AgentRun.get(body.agent_run_id);
      if (!run) return Response.json({ error: 'AgentRun not found' }, { status: 404 });
      callId = callId || run.bolna_call_id;
    }
    if (!callId) return Response.json({ error: 'call_id or agent_run_id with a call id is required' }, { status: 400 });
    if (!run) {
      const found = await svc.entities.AgentRun.filter({ bolna_call_id: String(callId) });
      run = found[0] || null;
    }

    let data =
      (await tryGet(`https://api.bolna.dev/execution/${callId}`, apiKey)) ||
      (await tryGet(`https://api.bolna.dev/call/${callId}`, apiKey));

    if (!data) {
      const list =
        (await tryGet(`https://api.bolna.dev/agent/${agentId}/executions`, apiKey)) ||
        (await tryGet(`https://api.bolna.dev/executions?agent_id=${agentId}`, apiKey));
      const items = Array.isArray(list) ? list : (list && (list.data || list.executions)) || [];
      const withTranscript = items
        .filter((e) => normalizeTranscript(e.transcript || (e.data && e.data.transcript) || e.messages).length)
        .sort((a, b) => new Date(b.created_at || b.started_at || 0) - new Date(a.created_at || a.started_at || 0));
      data = withTranscript[0] || null;
    }

    if (!data) return Response.json({ error: 'Could not retrieve transcript from Bolna' }, { status: 502 });

    const rawTranscript = data.transcript || (data.data && data.data.transcript) || (data.call && data.call.transcript) || data.messages;
    const turns = normalizeTranscript(rawTranscript);
    const rawStatus = data.status || data.call_status || data.state;
    const duration = data.duration || data.duration_seconds || data.call_duration || 0;
    const recording = data.recording_url || data.recordingUrl || null;

    if (run) {
      await svc.entities.AgentRun.update(run.id, {
        call_status: rawStatus ? String(rawStatus) : run.call_status,
        status: mapStatus(rawStatus),
        duration_sec: Number(duration) || run.duration_sec || 0,
        recording_url: recording || run.recording_url,
        transcript: turns.length ? turns : run.transcript
      });
    }

    return Response.json({
      call_status: rawStatus || null,
      transcript: turns,
      duration_seconds: Number(duration) || 0,
      recording_url: recording
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
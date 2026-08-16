/**
 * Voice provider integration.
 *
 * The provider is an implementation detail and is never named anywhere a user
 * can reach — not in the UI, not in an error, not in a function name visible in
 * devtools. Swapping vendors should touch this file and nothing else.
 *
 * Tolerates the three transcript shapes the provider returns, and the same
 * webhook matching rules. When credentials are absent the caller falls back to
 * local simulation — that decision belongs to functions.js, not here.
 */

const API_BASE = process.env.VOICE_API_BASE || process.env.BOLNA_API_BASE || 'https://api.bolna.dev';
const TIMEOUT_MS = 15000;

// New names take precedence; the previous vendor-specific names still resolve
// so an existing deployment keeps working through the rename.
export const providerConfig = () => ({
  apiKey: process.env.VOICE_API_KEY || process.env.BOLNA_API_KEY,
  agentId: process.env.VOICE_AGENT_ID || process.env.BOLNA_AGENT_ID,
  webhookSecret: process.env.VOICE_WEBHOOK_SECRET || process.env.BOLNA_WEBHOOK_SECRET,
  // Caller ID the recipient sees. Must be a number the account owns.
  fromNumber: process.env.VOICE_FROM_NUMBER || null
});

/** True only when a real call could actually be placed. */
export function isConfigured() {
  const { apiKey, agentId } = providerConfig();
  return Boolean(apiKey && agentId && apiKey !== 'change-me' && agentId !== 'change-me');
}

/** Indian numbering: keep the last 10 digits and prefix +91. */
export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const ten = digits.slice(-10);
  if (ten.length !== 10) return null;
  return `+91${ten}`;
}

export const last10 = (raw) => String(raw || '').replace(/\D/g, '').slice(-10);

export function extractCallId(data) {
  if (!data) return null;
  return data.call_id || data.execution_id || data.id || (data.data && data.data.call_id) || null;
}

/** The provider's status vocabulary varies; collapse it to ours. */
export function mapStatus(providerStatus) {
  const s = String(providerStatus || '').toLowerCase();
  if (s.includes('complet')) return 'completed';
  if (s.includes('busy')) return 'busy';
  if (s.includes('no-answer') || s.includes('no_answer') || s.includes('noanswer')) return 'no_answer';
  if (s.includes('fail') || s.includes('error')) return 'failed';
  if (s.includes('progress') || s.includes('ringing') || s.includes('ongoing')) return 'in_progress';
  if (s.includes('queue') || s.includes('initiat')) return 'queued';
  return 'completed';
}

function roleOf(value) {
  const r = String(value || '').toLowerCase();
  if (['user', 'human', 'customer', 'seller', 'caller'].some((k) => r.includes(k))) return 'user';
  return 'assistant';
}

/**
 * Transcripts arrive in three shapes: an array of turns, a single
 * newline-delimited prefixed string, or separate agent/user arrays. All three
 * are handled — the UI only ever sees {role, content} turns.
 */
export function normalizeTranscript(transcript) {
  if (!transcript) return [];

  if (Array.isArray(transcript)) {
    return transcript
      .map((t) => {
        if (typeof t === 'string') return { role: 'assistant', content: t.trim() };
        const content = t.content || t.text || t.message || '';
        return { role: roleOf(t.role || t.speaker || t.type), content: String(content).trim() };
      })
      .filter((t) => t.content);
  }

  if (typeof transcript === 'string') {
    const lines = transcript.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      const m = line.match(/^([A-Za-zऀ-ॿ ]{1,20})\s*:\s*(.*)$/);
      if (m && m[2]) {
        const label = m[1].toLowerCase().trim();
        const isUser = ['user', 'human', 'customer', 'seller', 'caller'].some((k) => label.includes(k));
        out.push({ role: isUser ? 'user' : 'assistant', content: m[2].trim() });
      } else if (out.length) {
        out[out.length - 1].content += ` ${line}`;
      } else {
        out.push({ role: 'assistant', content: line });
      }
    }
    return out.filter((t) => t.content);
  }

  if (typeof transcript === 'object') {
    const agent = transcript.agent_responses || transcript.agent || [];
    const user = transcript.user_responses || transcript.user || [];
    if (Array.isArray(agent) || Array.isArray(user)) {
      const out = [];
      const max = Math.max(agent.length || 0, user.length || 0);
      for (let i = 0; i < max; i += 1) {
        if (agent[i]) out.push({ role: 'assistant', content: String(agent[i].content || agent[i].text || agent[i]).trim() });
        if (user[i]) out.push({ role: 'user', content: String(user[i].content || user[i].text || user[i]).trim() });
      }
      return out.filter((t) => t.content);
    }
    if (transcript.transcript) return normalizeTranscript(transcript.transcript);
  }

  return [];
}

/** Turns arrive without timestamps from some shapes; space them for the player. */
export function withTimestamps(turns) {
  let at = 0;
  return turns.map((t) => {
    const spoken = { ...t, timestamp_sec: at, sentiment: t.sentiment ?? 0 };
    // ~14 characters a second is close to natural speech pace.
    at += Math.max(3, Math.round(String(t.content || '').length / 14));
    return spoken;
  });
}

async function request(path, { method = 'GET', body } = {}) {
  const { apiKey } = providerConfig();
  const controller = new AbortController();
  const abort = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err.name === 'AbortError' ? 'The voice service timed out' : err.message } };
  } finally {
    clearTimeout(abort);
  }
}

/**
 * Places a real outbound call.
 * `userData` is handed to the voice agent as template variables — this is what
 * lets the agent open with the seller's own numbers.
 */
export async function placeCall({ phone, userData = {}, agentId, fromNumber }) {
  const cfg = providerConfig();
  const from = normalizePhone(fromNumber || cfg.fromNumber);

  const payload = {
    agent_id: agentId || cfg.agentId,
    recipient_phone_number: phone,
    user_data: userData
  };
  // Sent only when configured, so an account that relies on the number bound
  // to the agent keeps working untouched.
  if (from) payload.from_phone_number = from;

  const res = await request('/call', { method: 'POST', body: payload });
  if (!res.ok) {
    // Surface the provider's own message verbatim. If the caller-ID field were
    // named differently or the number were not owned, this is where it shows —
    // silently dropping it would mean calls quietly using the wrong number.
    const detail = res.data?.message || res.data?.error || res.data?.detail;
    return {
      ok: false,
      error: detail ? String(detail) : `The voice service returned ${res.status}`,
      status: res.status,
      raw: res.data
    };
  }
  return { ok: true, callId: extractCallId(res.data), from: from || null, raw: res.data };
}

/** Reads a call's current state. Tries both endpoint spellings the API uses. */
export async function fetchExecution(callId) {
  const byExecution = await request(`/execution/${encodeURIComponent(callId)}`);
  if (byExecution.ok) return byExecution.data;
  const byCall = await request(`/call/${encodeURIComponent(callId)}`);
  if (byCall.ok) return byCall.data;
  return null;
}

/** Pulls the pieces we care about out of an execution/webhook payload. */
export function readExecution(data) {
  if (!data) return null;
  const rawTranscript =
    data.transcript || (data.data && data.data.transcript) || (data.call && data.call.transcript) || data.messages;
  return {
    rawStatus: data.status || data.call_status || data.state || null,
    status: mapStatus(data.status || data.call_status || data.state),
    transcript: withTimestamps(normalizeTranscript(rawTranscript)),
    duration_sec: Number(data.duration || data.duration_seconds || data.call_duration || 0) || 0,
    recording_url: data.recording_url || data.recordingUrl || null,
    cost_usd: Number(data.cost || data.total_cost || 0) || 0
  };
}

/** Connectivity probe that does NOT place a call — safe to run on boot. */
export async function probe() {
  if (!isConfigured()) return { configured: false, reachable: false, detail: 'Voice credentials are not configured' };
  const { agentId } = providerConfig();
  const res = await request(`/agent/${encodeURIComponent(agentId)}`);
  if (!res.ok) {
    return { configured: true, reachable: false, detail: res.data?.error || res.data?.detail || `HTTP ${res.status}` };
  }
  // Surfacing the agent's real identity matters: whoever answers hears this
  // agent, not whatever name the UI happens to print.
  return {
    configured: true,
    reachable: true,
    from_number: providerConfig().fromNumber || null,
    agent_id: agentId,
    agent_name: res.data?.agent_name || null,
    agent_status: res.data?.agent_status || null,
    webhook_configured: Boolean(res.data?.webhook_url),
    detail: res.data?.agent_name ? `connected to "${res.data.agent_name}"` : 'agent reachable'
  };
}

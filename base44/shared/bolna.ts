// Shared helpers for Bolna voice-call integration.

export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  if (last10.length !== 10) return null;
  return '+91' + last10;
}

export function last10(raw) {
  return String(raw || '').replace(/\D/g, '').slice(-10);
}

export function extractCallId(data) {
  if (!data) return null;
  return data.call_id || data.execution_id || data.id || (data.data && data.data.call_id) || null;
}

export function mapStatus(bolnaStatus) {
  const s = String(bolnaStatus || '').toLowerCase();
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
  if (r.includes('user') || r.includes('human') || r.includes('customer') || r.includes('seller') || r.includes('caller')) return 'user';
  return 'assistant';
}

// Handles: (a) array of turn objects, (b) prefixed string, (c) separate agent/user arrays.
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
      const m = line.match(/^([A-Za-z\u0900-\u097F ]{1,20})\s*:\s*(.*)$/);
      if (m && m[2]) {
        const label = m[1].toLowerCase().trim();
        const isUser = ['user', 'human', 'customer', 'seller', 'caller'].some((k) => label.includes(k));
        out.push({ role: isUser ? 'user' : 'assistant', content: m[2].trim() });
      } else if (out.length) {
        out[out.length - 1].content += ' ' + line;
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
      for (let i = 0; i < max; i++) {
        if (agent[i]) out.push({ role: 'assistant', content: String(agent[i].content || agent[i].text || agent[i]).trim() });
        if (user[i]) out.push({ role: 'user', content: String(user[i].content || user[i].text || user[i]).trim() });
      }
      return out.filter((t) => t.content);
    }
    if (transcript.transcript) return normalizeTranscript(transcript.transcript);
  }

  return [];
}

export function transcriptToText(turns) {
  return (turns || [])
    .map((t) => (t.role === 'user' ? 'Seller: ' : 'Agent: ') + t.content)
    .join('\n');
}

export function stripFences(text) {
  return String(text || '')
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
}
import React from 'react';
import { Play, Pause, SkipForward, Download, Sparkles, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Panel from '@/components/common/Panel';
import { mmss } from '@/lib/format';

function sentimentColor(v) {
  const n = Number(v) || 0;
  return n < -0.15 ? '#DC2626' : n < 0.2 ? '#D97706' : '#059669';
}

function GuardrailStrip({ event }) {
  return (
    <div className="flex items-start gap-2 border rounded px-3 py-2 my-2" style={{ backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }}>
      <AlertTriangle className="w-3.5 h-3.5 text-amber-700 mt-0.5 shrink-0" />
      <span className="text-xs text-amber-900">
        Guardrail: {(event.type || '').replace(/_/g, ' ')} detected — {event.action || 'agent deflected, escalation logged'}
      </span>
    </div>
  );
}

function Turn({ turn }) {
  const isUser = turn.role === 'user';
  return (
    <div className="flex gap-2 my-1.5">
      <div className="w-[3px] rounded-sm shrink-0" style={{ backgroundColor: sentimentColor(turn.sentiment) }} />
      <div
        className={`flex-1 rounded px-3 py-2 ${isUser ? 'bg-white border-l-2' : ''}`}
        style={isUser ? { borderLeftColor: '#E2E8F0' } : { backgroundColor: '#F8FAFC' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{isUser ? 'Seller' : 'Agent'}</span>
          <span className="text-[11px] font-mono text-slate-400 tabular-nums">{mmss(turn.timestamp_sec)}</span>
        </div>
        <p className="text-sm text-slate-800 mt-1">{turn.content}</p>
      </div>
    </div>
  );
}

export default function TranscriptViewer({
  turns, guardrails, visibleCount, playing, speed,
  onTogglePlay, onSpeedToggle, onSkipEnd, onFetchLatest, onExtract, busy
}) {
  const shown = turns.slice(0, visibleCount);

  return (
    <Panel
      title="Transcript"
      action={
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onTogglePlay}>
            {playing ? <Pause className="w-3.5 h-3.5 mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
            {playing ? 'Pause' : 'Replay call'}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs tabular-nums" onClick={onSpeedToggle}>{speed}x</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onSkipEnd}><SkipForward className="w-3.5 h-3.5" /></Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onFetchLatest} disabled={busy}>
            <Download className="w-3.5 h-3.5 mr-1" /> Pull latest
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={onExtract} disabled={busy}>
            <Sparkles className="w-3.5 h-3.5 mr-1" /> Extract qualification
          </Button>
        </div>
      }
    >
      <div className="text-[11px] text-slate-500 tabular-nums mb-2">
        {shown.length} of {turns.length} turns
      </div>
      {shown.map((t, i) => {
        const next = turns[i + 1];
        const inline = (guardrails || []).filter(
          (g) => g.at_sec != null && g.at_sec >= (t.timestamp_sec || 0) && (!next || g.at_sec < (next.timestamp_sec || Infinity))
        );
        return (
          <React.Fragment key={i}>
            <Turn turn={t} />
            {inline.map((g, j) => <GuardrailStrip key={j} event={g} />)}
          </React.Fragment>
        );
      })}
      {turns.length === 0 && <p className="text-xs text-slate-500">No transcript on this call yet — pull the latest from Bolna.</p>}
    </Panel>
  );
}
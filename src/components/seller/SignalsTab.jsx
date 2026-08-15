import React from 'react';
import Panel from '@/components/common/Panel';

const DOTS = { critical: 'bg-red-600', high: 'bg-amber-500', medium: 'bg-yellow-500', low: 'bg-slate-300' };

export default function SignalsTab({ signals }) {
  return (
    <Panel title="Signals" bodyClassName="p-0">
      {(signals || []).map((s, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${DOTS[s.severity] || DOTS.low}`} />
          <div className="flex-1">
            <div className="text-[13px] text-slate-900">{s.label || (s.signal_type || '').replace(/_/g, ' ')}</div>
            <div className="text-[11px] text-slate-500 capitalize">{s.severity} · {(s.signal_type || '').replace(/_/g, ' ')}</div>
          </div>
          <span className="text-[13px] text-slate-700 tabular-nums">{s.value != null ? Number(s.value).toFixed(2) : '—'}</span>
          <span className="text-[11px] text-slate-500 tabular-nums w-24 text-right">
            {s.occurred_at ? new Date(s.occurred_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
          </span>
        </div>
      ))}
      {(!signals || signals.length === 0) && <p className="p-4 text-xs text-slate-500">No signals recorded.</p>}
    </Panel>
  );
}
import React from 'react';
import Panel from '@/components/common/Panel';
import { dateTime } from '@/lib/format';

export default function DecisionLog({ exp, logs }) {
  const entries = [
    exp.started_at && { at: exp.started_at, label: 'Experiment started', detail: `${(exp.unit_type || '')} randomisation · baseline ${(exp.baseline_rate * 100 || 0).toFixed(1)}%, MDE ${((exp.mde_relative || 0) * 100).toFixed(0)}%` },
    exp.ended_at && { at: exp.ended_at, label: (exp.status || '').replace(/_/g, ' '), detail: exp.status_note || '' },
    ...(logs || []).map((l) => ({ at: l.timestamp, label: (l.action || '').replace(/_/g, ' '), detail: `${l.actor_name} · ${l.summary || ''}` })),
    exp.decision && exp.decision !== 'pending' && { at: exp.ended_at, label: `Decision: ${exp.decision.replace(/_/g, ' ')}`, detail: exp.status_note || '' }
  ].filter(Boolean);

  return (
    <Panel title="Decision log" bodyClassName="p-0">
      {entries.map((e, i) => (
        <div key={i} className="px-4 py-2.5 border-b border-slate-100 last:border-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] text-slate-900 capitalize">{e.label}</span>
            <span className="text-[11px] text-slate-500 tabular-nums">{e.at ? dateTime(e.at) : '—'}</span>
          </div>
          {e.detail && <p className="text-xs text-slate-600 mt-0.5">{e.detail}</p>}
        </div>
      ))}
      {entries.length === 0 && <p className="p-4 text-xs text-slate-500">No decisions logged.</p>}
    </Panel>
  );
}
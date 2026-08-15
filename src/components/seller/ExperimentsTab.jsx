import React from 'react';
import Panel from '@/components/common/Panel';

export default function ExperimentsTab({ assignments, experiments }) {
  const entries = Object.entries(assignments || {});

  return (
    <Panel title="Experiment assignments" bodyClassName="p-0">
      {entries.map(([key, variant]) => {
        const exp = experiments.find((e) => e.experiment_key === key);
        return (
          <div key={key} className="px-4 py-3 border-b border-slate-100 last:border-0">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-slate-900">{exp ? exp.name : key}</span>
              <span className="text-[11px] border border-blue-200 bg-blue-50 text-blue-800 rounded px-1.5 py-0.5">{variant}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {exp ? `${(exp.status || '').replace(/_/g, ' ')} · ${exp.funnel_stage} · primary metric ${(exp.primary_metric || '').replace(/_/g, ' ')}` : 'Experiment definition not found'}
            </div>
            {exp && exp.hypothesis && <p className="text-xs text-slate-600 mt-1">{exp.hypothesis}</p>}
          </div>
        );
      })}
      {entries.length === 0 && <p className="p-4 text-xs text-slate-500">Not enrolled in any experiment.</p>}
    </Panel>
  );
}
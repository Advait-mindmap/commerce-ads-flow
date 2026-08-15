import React from 'react';
import Panel from '@/components/common/Panel';
import { inr } from '@/lib/format';

const STAGES = ['proposed', 'negotiating', 'verbal', 'won', 'lost'];

export default function PipelineByStage({ opportunities }) {
  const rows = STAGES.map((stage) => {
    const items = opportunities.filter((o) => o.stage === stage);
    return {
      stage,
      count: items.length,
      value: items.reduce((a, o) => a + (o.total_value || 0), 0)
    };
  });
  const maxValue = Math.max(...rows.map((r) => r.value), 1);

  return (
    <Panel title="Pipeline by stage">
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.stage}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-slate-600 capitalize">{r.stage}</span>
              <span className="text-xs text-slate-500 tabular-nums">
                {r.count} · <span className="text-slate-900 font-medium">{inr(r.value)}</span>
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-sm overflow-hidden">
              <div
                className={`h-full rounded-sm ${r.stage === 'lost' ? 'bg-slate-300' : r.stage === 'won' ? 'bg-emerald-600' : 'bg-blue-800'}`}
                style={{ width: `${Math.max(1, (r.value / maxValue) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
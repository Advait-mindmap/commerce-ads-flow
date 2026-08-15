import React from 'react';
import Panel from '@/components/common/Panel';

export default function QueueDepthCard({ depth, nextDialAt }) {
  return (
    <Panel title="Queue depth">
      <div className="flex items-stretch">
        {['A', 'B', 'C'].map((b, i) => (
          <div key={b} className={`flex-1 ${i > 0 ? 'border-l border-slate-200 pl-3' : ''}`}>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Band {b}</div>
            <div className="text-xl font-semibold text-slate-900 tabular-nums">{depth[b] || 0}</div>
          </div>
        ))}
      </div>
      <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-200">
        Next dial at <span className="text-slate-900 tabular-nums">{nextDialAt}</span>
      </div>
    </Panel>
  );
}
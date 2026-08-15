import React from 'react';
import Panel from '@/components/common/Panel';
import { mmss } from '@/lib/format';

export default function CallAnalyticsCard({ run }) {
  const agent = Math.round((run.talk_ratio != null ? run.talk_ratio : 0.5) * 100);
  const turns = run.transcript || [];
  let longest = 0;
  turns.forEach((t, i) => {
    const next = turns[i + 1];
    const span = next && next.timestamp_sec != null && t.timestamp_sec != null ? next.timestamp_sec - t.timestamp_sec : 0;
    if (span > longest) longest = span;
  });
  const sentiment = run.overall_sentiment != null ? run.overall_sentiment : 0;

  return (
    <Panel title="Call analytics">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1.5">Talk ratio</div>
      <div className="flex h-2.5 rounded-sm overflow-hidden">
        <div className="bg-blue-800" style={{ width: `${agent}%` }} />
        <div className="bg-slate-300" style={{ width: `${100 - agent}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-slate-500 mt-1 tabular-nums">
        <span>Agent {agent}%</span>
        <span>Seller {100 - agent}%</span>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-600">Overall sentiment</span>
          <span className={`tabular-nums font-medium ${sentiment < -0.15 ? 'text-red-600' : sentiment < 0.2 ? 'text-amber-600' : 'text-emerald-700'}`}>
            {sentiment.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-600">Longest monologue</span>
          <span className="text-slate-900 font-mono tabular-nums">{mmss(longest)}</span>
        </div>
      </div>
    </Panel>
  );
}
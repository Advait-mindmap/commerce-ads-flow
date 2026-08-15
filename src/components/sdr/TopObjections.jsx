import React from 'react';
import Panel from '@/components/common/Panel';

export default function TopObjections({ items }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <Panel title="Top objections">
      <div className="space-y-2.5">
        {items.map((i) => (
          <div key={i.type}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-600 capitalize">{i.type.replace(/_/g, ' ')}</span>
              <span className="text-slate-900 tabular-nums">{i.count}</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-sm overflow-hidden">
              <div className="h-full bg-blue-800 rounded-sm" style={{ width: `${(i.count / max) * 100}%` }} />
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-slate-500">No objections logged yet.</p>}
      </div>
    </Panel>
  );
}
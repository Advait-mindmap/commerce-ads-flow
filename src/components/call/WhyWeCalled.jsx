import React from 'react';
import Panel from '@/components/common/Panel';

export default function WhyWeCalled({ reasons }) {
  return (
    <Panel title="Why we called">
      <ul className="space-y-2">
        {(reasons || []).map((r, i) => (
          <li key={i} className="flex gap-2 text-[13px] text-slate-700">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-blue-800 shrink-0" />
            <span>{r}</span>
          </li>
        ))}
        {(!reasons || reasons.length === 0) && <li className="text-xs text-slate-500">No signals recorded.</li>}
      </ul>
    </Panel>
  );
}
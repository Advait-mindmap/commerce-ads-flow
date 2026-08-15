import React from 'react';
import Panel from '@/components/common/Panel';
import { pct } from '@/lib/format';

export default function ArmTable({ arms }) {
  return (
    <Panel title="Arm comparison" bodyClassName="p-0">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {['Variant', 'n', 'Conversions', 'Rate'].map((h) => (
              <th key={h} className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(arms || []).map((a, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-2 text-[13px] font-medium text-slate-900">{a.variant}</td>
              <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{(a.n || 0).toLocaleString('en-IN')}</td>
              <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{(a.conversions || 0).toLocaleString('en-IN')}</td>
              <td className="px-3 py-2 text-[13px] text-slate-900 tabular-nums">{pct(a.rate, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
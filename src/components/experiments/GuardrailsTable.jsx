import React from 'react';
import Panel from '@/components/common/Panel';

const p = (v) => (v == null ? '—' : v < 0.001 ? '<0.001' : v.toFixed(3));

export default function GuardrailsTable({ guardrails }) {
  return (
    <Panel title="Guardrails" bodyClassName="p-0">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {['Metric', 'Control', 'Treatment', 'p-value', 'Breach'].map((h) => (
              <th key={h} className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(guardrails || []).map((g, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-2 text-[13px] text-slate-900">{(g.metric || '').replace(/_/g, ' ')}</td>
              <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{g.control}</td>
              <td className={`px-3 py-2 text-[13px] tabular-nums ${g.breach ? 'text-red-600' : 'text-slate-700'}`}>{g.treatment}</td>
              <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{p(g.p_value)}</td>
              <td className="px-3 py-2">
                <span className={`text-[11px] border rounded px-1.5 py-0.5 ${g.breach ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                  {g.breach ? 'Breach' : 'OK'}
                </span>
              </td>
            </tr>
          ))}
          {(!guardrails || guardrails.length === 0) && (
            <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-slate-500">No guardrails configured.</td></tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}
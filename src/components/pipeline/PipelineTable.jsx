import React from 'react';
import { inr, pct } from '@/lib/format';

const HEADERS = ['Seller', 'Package', 'Monthly budget', 'Total value', 'Stage', 'Close prob', 'Expected close', 'Owner', 'Days in stage'];

export default function PipelineTable({ opportunities, onOpen }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {HEADERS.map((h) => (
              <th key={h} className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {opportunities.map((o) => (
            <tr key={o.id} onClick={() => onOpen(o)} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
              <td className="px-3 py-2 text-[13px] font-medium text-slate-900">{o.seller_name}</td>
              <td className="px-3 py-2 text-[13px] text-slate-600">{o.package_name}</td>
              <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{inr(o.monthly_budget)}</td>
              <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{inr(o.total_value)}</td>
              <td className="px-3 py-2 text-xs text-slate-600 capitalize">{o.stage}</td>
              <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{pct(o.close_probability)}</td>
              <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{o.expected_close_date || '—'}</td>
              <td className="px-3 py-2 text-[13px] text-slate-600">{o.owner_rep_name}</td>
              <td className={`px-3 py-2 text-[13px] tabular-nums ${(o.days_in_stage || 0) > 30 ? 'text-red-600' : (o.days_in_stage || 0) > 14 ? 'text-amber-600' : 'text-slate-600'}`}>{o.days_in_stage || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
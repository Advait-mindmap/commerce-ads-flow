import React from 'react';
import { inr } from '@/lib/format';

function initials(name = '') {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function PipelineCard({ opp, onClick, dragging }) {
  const days = opp.days_in_stage || 0;
  const dayColor = days > 30 ? 'text-red-600' : days > 14 ? 'text-amber-600' : 'text-slate-500';
  const prob = Math.round((opp.close_probability || 0) * 100);

  return (
    <div
      onClick={onClick}
      className={`bg-white border rounded-lg p-3 cursor-pointer hover:border-slate-300 ${dragging ? 'border-blue-800' : 'border-slate-200'}`}
    >
      <div className="text-[13px] font-medium text-slate-900 truncate">{opp.seller_name}</div>
      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{opp.package_name}</div>
      <div className="text-[13px] text-slate-900 tabular-nums mt-1.5">{inr(opp.monthly_budget)} / mo</div>

      <div className="mt-2">
        <div className="bg-slate-100 rounded-sm overflow-hidden" style={{ height: 4 }}>
          <div className="h-full bg-blue-800" style={{ width: `${prob}%` }} />
        </div>
        <div className="flex justify-between text-[11px] text-slate-500 tabular-nums mt-1">
          <span>{prob}% close</span>
          <span>{opp.expected_close_date || '—'}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
        <span
          className="rounded-sm border border-slate-200 bg-slate-50 text-slate-600 text-[10px] font-semibold flex items-center justify-center"
          style={{ width: 24, height: 24 }}
          title={opp.owner_rep_name}
        >
          {initials(opp.owner_rep_name)}
        </span>
        <span className={`text-[11px] tabular-nums ${dayColor}`}>{days}d in stage</span>
      </div>
    </div>
  );
}
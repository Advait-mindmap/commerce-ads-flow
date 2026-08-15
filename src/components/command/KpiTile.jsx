import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function KpiTile({ label, value, subtext, trend, danger }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      <div className={`text-2xl leading-8 mt-1.5 font-semibold tabular-nums ${danger ? 'text-red-600' : 'text-slate-900'}`}>
        {value}
      </div>
      <div className={`text-xs mt-0.5 flex items-center gap-1 ${danger ? 'text-red-600' : 'text-slate-500'}`}>
        {trend != null && trend !== 0 && (
          trend > 0
            ? <ArrowUpRight className="w-3 h-3 text-emerald-600" />
            : <ArrowDownRight className="w-3 h-3 text-red-600" />
        )}
        <span className="tabular-nums">{subtext}</span>
      </div>
    </div>
  );
}
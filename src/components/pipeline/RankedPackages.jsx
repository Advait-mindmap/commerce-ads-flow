import React from 'react';
import { inr, pct } from '@/lib/format';

export function rankPackages(packages, opp) {
  const budget = opp.monthly_budget || 0;
  return packages
    .map((p) => {
      const inBand = budget >= (p.min_budget || 0) && budget <= (p.max_budget || Infinity);
      const catFit = !p.eligible_categories || !p.eligible_categories.length || p.eligible_categories.includes(opp.category);
      const score = (inBand ? 0.5 : 0) + (catFit ? 0.2 : 0) + (p.historical_close_rate || 0) * 0.2 + (p.historical_retention_90d || 0) * 0.1;
      const reasons = [
        inBand ? `Budget ${inr(budget)} sits inside the ${inr(p.min_budget)}–${inr(p.max_budget)} band` : `Budget ${inr(budget)} is outside the ${inr(p.min_budget)}–${inr(p.max_budget)} band`,
        catFit ? `${opp.category} is an eligible category` : `${opp.category} is outside typical eligibility`,
        `${pct(p.historical_close_rate)} historical close, ${pct(p.historical_retention_90d)} 90-day retention`
      ];
      return { ...p, fit: score, reasons };
    })
    .sort((a, b) => b.fit - a.fit)
    .slice(0, 3);
}

export default function RankedPackages({ packages, selectedCode }) {
  return (
    <div className="space-y-2">
      {packages.map((p, i) => (
        <div key={p.code} className={`border rounded p-3 ${p.code === selectedCode ? 'border-blue-200 bg-blue-50' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-slate-900">#{i + 1} {p.name}</span>
            <span className="text-[11px] text-slate-500 tabular-nums">fit {(p.fit * 100).toFixed(0)}</span>
          </div>
          <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
            {inr(p.min_budget)}–{inr(p.max_budget)} · {(p.avg_roas_delivered || 0).toFixed(1)}x avg ROAS
          </div>
          <ul className="mt-2 space-y-1">
            {p.reasons.map((r, j) => (
              <li key={j} className="flex gap-2 text-[11px] text-slate-600">
                <span className="mt-1 w-1 h-1 rounded-full bg-slate-400 shrink-0" />{r}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
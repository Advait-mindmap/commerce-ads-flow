import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Button } from '@/components/ui/button';
import { pct } from '@/lib/format';

function intervention(c) {
  const top = (c.churn_drivers || []).slice().sort((a, b) => b.contribution - a.contribution)[0];
  const driver = top ? top.driver : 'roas_decline';
  const map = {
    roas_decline: 'Run keyword pruning + bid rebalance, then share a recovery plan on a rep call.',
    budget_underspend: 'Raise daily cap and expand match types to recover lost impression share.',
    keyword_waste: 'Add negative keywords for the wasted spend cohort and reallocate to top converters.',
    no_rep_contact: 'Book a check-in call within 48 hours with a performance review deck.',
    pause_churn: 'Offer a managed-service trial for one cycle to stabilise campaign uptime.'
  };
  return map[driver] || `Address ${driver.replace(/_/g, ' ')} with a rep-led performance review.`;
}

export default function ChurnExpansion({ campaign, onAssign }) {
  const drivers = (campaign.churn_drivers || []).slice().sort((a, b) => b.contribution - a.contribution);
  const maxC = Math.max(...drivers.map((d) => d.contribution), 0.01);
  const series = (campaign.roas_series || []).slice(-12);

  return (
    <div className="bg-slate-50 border-t border-slate-200 px-4 py-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-2">Churn drivers</div>
        <ul className="space-y-2">
          {drivers.map((d, i) => (
            <li key={i}>
              <div className="flex justify-between text-[13px]">
                <span className="text-slate-800">{(d.driver || '').replace(/_/g, ' ')}</span>
                <span className="text-slate-500 tabular-nums">{pct(d.contribution, 0)}</span>
              </div>
              <div className="bg-slate-200 rounded-sm mt-1 overflow-hidden" style={{ height: 4 }}>
                <div className="h-full bg-red-500" style={{ width: `${(d.contribution / maxC) * 100}%` }} />
              </div>
            </li>
          ))}
          {drivers.length === 0 && <li className="text-xs text-slate-500">No drivers attributed.</li>}
        </ul>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-2">ROAS — last 12 weeks</div>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={series}>
            <CartesianGrid stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#64748B' }} interval={2} />
            <YAxis tick={{ fontSize: 10, fill: '#64748B' }} width={30} />
            <Tooltip contentStyle={{ fontSize: 12, borderColor: '#E2E8F0' }} />
            <Line type="monotone" dataKey="roas" stroke="#1E40AF" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-2">Recommended intervention</div>
        <p className="text-[13px] text-slate-800">{intervention(campaign)}</p>
        <Button size="sm" variant="outline" className="h-8 text-xs mt-3 bg-white" onClick={onAssign}>Assign to rep</Button>
      </div>
    </div>
  );
}
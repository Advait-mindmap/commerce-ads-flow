import React from 'react';
import Panel from '@/components/common/Panel';
import { inr } from '@/lib/format';

const HEADERS = ['Campaign type', 'Status', 'Monthly budget', 'Spend 30d', 'ROAS 30d', 'vs Promised', 'Days active', 'Churn band'];

const BANDS = {
  RED: 'bg-red-50 text-red-700 border-red-200',
  AMBER: 'bg-amber-50 text-amber-700 border-amber-200',
  YELLOW: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  GREEN: 'bg-emerald-50 text-emerald-700 border-emerald-200'
};

export default function AdHistoryTab({ campaigns, seller }) {
  return (
    <Panel title="Ad history" bodyClassName="p-0">
      <div className="px-4 py-3 border-b border-slate-100 text-xs text-slate-600 tabular-nums">
        Lifetime ad spend {inr(seller.lifetime_ad_spend)} · last campaign ROAS {(seller.last_campaign_roas || 0).toFixed(1)}x
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {HEADERS.map((h) => <th key={h} className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 font-medium whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="px-3 py-2 text-[13px] text-slate-900">{(c.campaign_type || '').replace(/_/g, ' ')}</td>
                <td className="px-3 py-2 text-xs text-slate-600 capitalize">{c.status}</td>
                <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{inr(c.monthly_budget)}</td>
                <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{inr(c.spend_30d)}</td>
                <td className="px-3 py-2 text-[13px] text-slate-900 tabular-nums">{(c.roas_30d || 0).toFixed(1)}x</td>
                <td className={`px-3 py-2 text-[13px] tabular-nums ${(c.roas_vs_promised || 1) < 1 ? 'text-red-600' : 'text-slate-700'}`}>
                  {(c.roas_vs_promised || 0).toFixed(2)}
                </td>
                <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{c.days_active || 0}</td>
                <td className="px-3 py-2">
                  <span className={`text-[11px] border rounded px-1.5 py-0.5 ${BANDS[c.churn_band] || BANDS.GREEN}`}>{c.churn_band || '—'}</span>
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-500">Never advertised.</td></tr>}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
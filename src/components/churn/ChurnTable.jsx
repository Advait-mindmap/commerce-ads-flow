import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import ChurnBandBadge from '@/components/churn/ChurnBandBadge';
import ChurnExpansion from '@/components/churn/ChurnExpansion';
import EmptyState from '@/components/common/EmptyState';
import { inr, pct } from '@/lib/format';

const HEADERS = ['', 'Seller', 'Campaign type', 'Monthly budget', 'ROAS 30d', 'vs Promised', 'Budget util', 'Days since contact', 'Churn P30', 'Band', 'Action'];

export default function ChurnTable({ campaigns, onAssign }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {HEADERS.map((h, i) => <th key={i} className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 font-medium whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => {
            const open = expanded === c.id;
            const p30 = c.churn_p30 || 0;
            return (
              <React.Fragment key={c.id}>
                <tr className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <button onClick={() => setExpanded(open ? null : c.id)} className="text-slate-400 hover:text-slate-700">
                      <ChevronRight className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} />
                    </button>
                  </td>
                  <td className="px-3 py-2 text-[13px] font-medium text-slate-900 max-w-[180px] truncate">{c.seller_name}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{(c.campaign_type || '').replace(/_/g, ' ')}</td>
                  <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{inr(c.monthly_budget)}</td>
                  <td className="px-3 py-2 text-[13px] text-slate-900 tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      {(c.roas_30d || 0).toFixed(1)}x
                      {(c.roas_trend_slope || 0) < 0
                        ? <ArrowDown className="w-3 h-3 text-red-600" />
                        : <ArrowUp className="w-3 h-3 text-emerald-600" />}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-[13px] tabular-nums ${(c.roas_vs_promised || 1) < 1 ? 'text-red-600' : 'text-slate-700'}`}>{(c.roas_vs_promised || 0).toFixed(2)}</td>
                  <td className="px-3 py-2 w-28">
                    <div className="bg-slate-100 rounded-sm overflow-hidden" style={{ height: 4 }}>
                      <div className="h-full bg-blue-800" style={{ width: `${Math.min(100, (c.budget_utilization || 0) * 100)}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-500 tabular-nums">{pct(c.budget_utilization)}</span>
                  </td>
                  <td className={`px-3 py-2 text-[13px] tabular-nums ${(c.days_since_rep_contact || 0) > 30 ? 'text-red-600' : 'text-slate-700'}`}>{c.days_since_rep_contact || 0}</td>
                  <td className="px-3 py-2 w-28">
                    <div className="bg-slate-100 rounded-sm overflow-hidden" style={{ height: 4 }}>
                      <div className="h-full bg-red-500" style={{ width: `${Math.min(100, p30 * 100)}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-700 tabular-nums">{pct(p30, 1)}</span>
                  </td>
                  <td className="px-3 py-2"><ChurnBandBadge band={c.churn_band} /></td>
                  <td className="px-3 py-2">
                    {c.seller_id
                      ? <Link to={`/sellers/${c.seller_id}`} className="text-xs text-blue-800 hover:underline">Open</Link>
                      : <span className="text-xs text-slate-400">—</span>}
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td colSpan={HEADERS.length} className="p-0">
                      <ChurnExpansion campaign={c} onAssign={() => onAssign(c)} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {campaigns.length === 0 && (
            <tr><td colSpan={HEADERS.length} className="p-0">
              <EmptyState message="No campaigns are currently flagged at risk." actionLabel="Review all campaigns" to="/campaigns" />
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
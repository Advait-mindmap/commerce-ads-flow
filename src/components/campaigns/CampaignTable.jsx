import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import ChurnBandBadge from '@/components/churn/ChurnBandBadge';
import OptimizationAction from '@/components/campaigns/OptimizationAction';
import EmptyState from '@/components/common/EmptyState';
import { inr, pct } from '@/lib/format';

const HEADERS = ['', 'Seller', 'Type', 'Status', 'Monthly budget', 'Spend 30d', 'ROAS 30d', 'Conv 30d', 'Revenue 30d', 'Budget util', 'Churn band', 'Pending'];

export default function CampaignTable({ campaigns, onDecide, busy }) {
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
            const actions = c.optimization_actions || [];
            const pending = actions.filter((a) => !a.status || a.status === 'pending' || a.status === 'proposed');
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
                  <td className="px-3 py-2 text-xs text-slate-600 capitalize">{c.status}</td>
                  <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{inr(c.monthly_budget)}</td>
                  <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{inr(c.spend_30d)}</td>
                  <td className="px-3 py-2 text-[13px] text-slate-900 tabular-nums">{(c.roas_30d || 0).toFixed(1)}x</td>
                  <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{(c.conversions_30d || 0).toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{inr(c.revenue_30d)}</td>
                  <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{pct(c.budget_utilization)}</td>
                  <td className="px-3 py-2"><ChurnBandBadge band={c.churn_band} /></td>
                  <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{pending.length || '—'}</td>
                </tr>
                {open && (
                  <tr>
                    <td colSpan={HEADERS.length} className="p-0">
                      <div className="bg-slate-50 border-t border-slate-200 p-4">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-2">Optimization recommendations</div>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                          {actions.map((a, i) => (
                            <OptimizationAction key={i} action={a} busy={busy} onDecide={(status) => onDecide(c, i, status)} />
                          ))}
                          {actions.length === 0 && <p className="text-xs text-slate-500">No recommendations for this campaign.</p>}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {campaigns.length === 0 && (
            <tr><td colSpan={HEADERS.length} className="p-0">
              <EmptyState message="No campaigns match these filters." actionLabel="Open pipeline" to="/pipeline" />
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
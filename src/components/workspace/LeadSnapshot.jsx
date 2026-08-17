import React from 'react';
import Panel from '@/components/common/Panel';
import { inr, pct, dateTime } from '@/lib/format';

function Stat({ label, value, sub }) {
  return (
    <div className="border border-slate-200 rounded p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      <div className="text-[15px] font-semibold text-slate-900 tabular-nums mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export default function LeadSnapshot({ seller, pkg, interactions = [] }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Panel title="Seller snapshot">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="GMV 30d" value={inr(seller && seller.gmv_30d)} sub={seller ? `${((seller.gmv_growth_30 || 0) * 100).toFixed(1)}% growth` : ''} />
          <Stat label="AOV" value={inr(seller && seller.aov)} sub={seller ? `${pct(seller.return_rate, 1)} returns` : ''} />
          <Stat label="SKUs" value={(seller && seller.sku_count) || '—'} sub={seller ? `+${seller.sku_added_30d || 0} in 30d` : ''} />
          <Stat label="Category SoV" value={seller ? pct(seller.category_sov, 1) : '—'} sub={seller ? `pos ${(seller.avg_position || 0).toFixed(1)}` : ''} />
        </div>
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1.5">Signals</div>
          <ul className="space-y-1">
            {((seller && seller.signals) || []).slice(0, 4).map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px] text-slate-700">
                <span className={`w-1.5 h-1.5 rounded-full ${s.severity === 'critical' ? 'bg-red-600' : s.severity === 'high' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                {s.label || s.signal_type}
              </li>
            ))}
            {(!seller || !(seller.signals || []).length) && <li className="text-xs text-slate-500">No active signals.</li>}
          </ul>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel title="Recommended package">
          {pkg ? (
            <>
              <div className="text-[15px] font-semibold text-slate-900">{pkg.name}</div>
              <p className="text-xs text-slate-600 mt-1">{pkg.description}</p>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <Stat label="Budget band" value={`${inr(pkg.min_budget)}–${inr(pkg.max_budget)}`} />
                {/* The band is the package's observed 25th-75th percentile
                    delivery, not the average nudged by an arbitrary factor. */}
                <Stat
                  label="Projected ROAS"
                  value={pkg.roas_p25 != null && pkg.roas_p75 != null
                    ? `${pkg.roas_p25.toFixed(1)}x–${pkg.roas_p75.toFixed(1)}x`
                    : `${(pkg.avg_roas_delivered || 0).toFixed(1)}x avg`}
                  sub={`${pct(pkg.historical_close_rate)} close rate`}
                />
              </div>
            </>
          ) : <p className="text-xs text-slate-500">No eligible package for this budget band.</p>}
        </Panel>

        {/* A rep picking this lead up needs the history, not the latest line:
            who spoke to them, what came of it, and what they objected to. The
            outcome was previously not shown at all — only the free-text note. */}
        <Panel title={interactions.length > 1 ? `Interaction history (${interactions.length})` : 'Previous interaction'}>
          {interactions.length ? (
            <ol className="space-y-3">
              {interactions.slice(0, 5).map((it, idx) => (
                <li key={it.id || idx} className={idx ? 'pt-3 border-t border-slate-100' : ''}>
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-500">
                    <span className="uppercase tracking-wide">{(it.channel || '').replace(/_/g, ' ')}</span>
                    <span>·</span>
                    <span>{it.actor_name}</span>
                    <span>·</span>
                    <span className="tabular-nums">{dateTime(it.started_at)}</span>
                    {it.outcome && (
                      <span className="ml-auto text-[11px] border border-slate-200 bg-slate-50 rounded px-1.5 py-0.5 text-slate-700">
                        {String(it.outcome).replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  {it.summary && <p className="text-[13px] text-slate-800 mt-1.5">{it.summary}</p>}
                  {(it.objections || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {it.objections.map((o, i) => (
                        <span key={i} className="text-[11px] border border-amber-200 bg-amber-50 rounded px-1.5 py-0.5 text-amber-800">{String(o).replace(/_/g, ' ')}</span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
              {interactions.length > 5 && (
                <li className="pt-2 text-[11px] text-slate-500">
                  and {interactions.length - 5} earlier — full timeline on Seller 360
                </li>
              )}
            </ol>
          ) : <p className="text-xs text-slate-500">First touch — no prior interaction logged.</p>}
        </Panel>
      </div>
    </div>
  );
}
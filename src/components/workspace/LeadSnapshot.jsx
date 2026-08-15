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

export default function LeadSnapshot({ seller, pkg, lastInteraction }) {
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

        <Panel title="Previous interaction">
          {lastInteraction ? (
            <>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="uppercase tracking-wide">{(lastInteraction.channel || '').replace(/_/g, ' ')}</span>
                <span>·</span>
                <span>{lastInteraction.actor_name}</span>
                <span>·</span>
                <span className="tabular-nums">{dateTime(lastInteraction.started_at)}</span>
              </div>
              <p className="text-[13px] text-slate-800 mt-2">{lastInteraction.summary}</p>
              {(lastInteraction.objections || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {lastInteraction.objections.map((o, i) => (
                    <span key={i} className="text-[11px] border border-slate-200 bg-slate-50 rounded px-1.5 py-0.5 text-slate-600">{o.replace(/_/g, ' ')}</span>
                  ))}
                </div>
              )}
            </>
          ) : <p className="text-xs text-slate-500">First touch — no prior interaction logged.</p>}
        </Panel>
      </div>
    </div>
  );
}
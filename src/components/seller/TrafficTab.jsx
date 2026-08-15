import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import Panel from '@/components/common/Panel';
import { inr, pct } from '@/lib/format';

function Gauge({ label, value, median }) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  return (
    <div>
      <div className="flex justify-between text-[11px] text-slate-500 mb-1">
        <span className="uppercase tracking-wide font-medium">{label}</span>
        <span className="tabular-nums text-slate-900">{pct(v, 1)}</span>
      </div>
      <div className="relative bg-slate-100 rounded-sm h-2.5">
        <div className="h-2.5 bg-blue-800 rounded-sm" style={{ width: `${v * 100}%` }} />
        {median != null && (
          <span className="absolute top-[-3px] w-px h-4 bg-slate-900" style={{ left: `${Math.min(1, median) * 100}%` }} title="category median" />
        )}
      </div>
      {median != null && <div className="text-[11px] text-slate-500 mt-1 tabular-nums">Category median {pct(median, 1)}</div>}
    </div>
  );
}

export default function TrafficTab({ seller, categoryMedianSov }) {
  const series = (seller.traffic_series || []).slice(-24);
  // Recorded per week alongside impressions, not reconstructed from a single
  // 90-day delta — so this line reflects what actually happened.
  const posSeries = series.filter((p) => p.position != null).map((p) => ({ week: p.week, position: p.position }));

  return (
    <div className="space-y-4">
      <Panel title="Organic impressions vs GMV — 24 weeks">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={series}>
            <CartesianGrid stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#64748B' }} interval={3} />
            <YAxis yAxisId="l" tick={{ fontSize: 10, fill: '#64748B' }} width={54} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: '#64748B' }} width={54} tickFormatter={inr} />
            <Tooltip contentStyle={{ fontSize: 12, borderColor: '#E2E8F0' }} />
            <Line yAxisId="l" type="monotone" dataKey="organic" name="Organic impr" stroke="#1E40AF" strokeWidth={1.5} dot={false} />
            <Line yAxisId="r" type="monotone" dataKey="gmv" name="GMV" stroke="#94A3B8" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Average search position">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={posSeries}>
              <CartesianGrid stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#64748B' }} interval={5} />
              <YAxis reversed tick={{ fontSize: 10, fill: '#64748B' }} width={30} />
              <Tooltip contentStyle={{ fontSize: 12, borderColor: '#E2E8F0' }} />
              <Line type="monotone" dataKey="position" stroke="#DC2626" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Catalog">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={[
              { name: 'SKUs live', value: seller.sku_count || 0 },
              { name: 'Added 30d', value: seller.sku_added_30d || 0 },
              { name: 'Zero-impression', value: Math.round((seller.sku_count || 0) * (seller.zero_impression_sku_pct || 0)) }
            ]}>
              <CartesianGrid stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748B' }} width={40} />
              <Tooltip contentStyle={{ fontSize: 12, borderColor: '#E2E8F0' }} />
              <Bar dataKey="value" fill="#1E40AF" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-4">
            <Gauge label="Listing quality" value={(seller.listing_quality || 0) > 1 ? seller.listing_quality / 100 : seller.listing_quality} />
            <Gauge label="Category SoV" value={seller.category_sov} median={categoryMedianSov} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
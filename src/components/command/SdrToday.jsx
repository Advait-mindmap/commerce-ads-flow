import React from 'react';
import Panel from '@/components/common/Panel';
import Sparkline from '@/components/common/Sparkline';
import { inrFull } from '@/lib/format';

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-600">{label}</span>
      <span className="text-[13px] font-medium text-slate-900 tabular-nums">{value}</span>
    </div>
  );
}

export default function SdrToday({ stats, weeklyBooked }) {
  return (
    <Panel title="AI SDR today">
      <Row label="Dials" value={stats.dials} />
      <Row label="Connects" value={`${stats.connects} (${stats.dials ? Math.round((stats.connects / stats.dials) * 100) : 0}%)`} />
      <Row label="Qualified" value={stats.qualified} />
      <Row label="Booked" value={stats.booked} />
      <Row label="Escalated" value={stats.escalated} />
      <Row label="Cost per meeting" value={stats.booked ? inrFull(stats.costInr / stats.booked) : '—'} />
      <div className="mt-3 pt-3 border-t border-slate-200">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1.5">Booked meetings · 7 days</div>
        <Sparkline values={weeklyBooked} width={240} height={36} stroke="#1E40AF" />
      </div>
    </Panel>
  );
}
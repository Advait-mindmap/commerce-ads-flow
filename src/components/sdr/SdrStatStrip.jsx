import React from 'react';

export default function SdrStatStrip({ stats }) {
  const items = [
    ['Dials', stats.dials],
    ['Connects', `${stats.connects} (${stats.dials ? Math.round((stats.connects / stats.dials) * 100) : 0}%)`],
    ['Qualified', stats.qualified],
    ['Booked', stats.booked],
    ['Escalated', stats.escalated],
    ['Cost/Meeting', stats.costPerMeeting]
  ];
  return (
    <div className="flex flex-wrap items-center bg-white border border-slate-200 rounded-lg px-4 py-3">
      {items.map(([label, value], i) => (
        <div key={label} className={`flex items-baseline gap-2 px-4 ${i > 0 ? 'border-l border-slate-200' : 'pl-0'}`}>
          <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
          <span className="text-[15px] font-semibold text-slate-900 tabular-nums">{value}</span>
        </div>
      ))}
    </div>
  );
}
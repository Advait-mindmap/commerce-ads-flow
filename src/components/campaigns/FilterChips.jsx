import React from 'react';

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] border rounded px-2 py-1 ${active ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
    >
      {children}
    </button>
  );
}

const STATUSES = ['live', 'paused', 'draft', 'ended'];
const BANDS = ['RED', 'AMBER', 'YELLOW', 'GREEN'];

export default function FilterChips({ filters, setFilters, shown, total }) {
  const toggle = (key, value) =>
    setFilters((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] }));

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-1">Status</span>
        {STATUSES.map((s) => <Chip key={s} active={filters.status.includes(s)} onClick={() => toggle('status', s)}>{s}</Chip>)}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-1">Churn band</span>
        {BANDS.map((b) => <Chip key={b} active={filters.bands.includes(b)} onClick={() => toggle('bands', b)}>{b}</Chip>)}
      </div>
      <Chip active={filters.pendingOnly} onClick={() => setFilters((f) => ({ ...f, pendingOnly: !f.pendingOnly }))}>
        Has pending recommendations
      </Chip>
      <span className="ml-auto text-[11px] text-slate-500 tabular-nums">{shown} of {total}</span>
    </div>
  );
}
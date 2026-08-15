import React from 'react';
import { Input } from '@/components/ui/input';

const PRESETS = [
  { key: 7, label: 'Last 7 days' },
  { key: 30, label: 'Last 30 days' },
  { key: 90, label: 'Last 90 days' },
  { key: 'custom', label: 'Custom' }
];

export default function DateRangeSelector({ range, setRange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center border border-slate-200 rounded-md overflow-hidden bg-white">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setRange({ ...range, preset: p.key })}
            className={`text-xs px-2.5 py-1.5 border-r border-slate-200 last:border-0 ${range.preset === p.key ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {range.preset === 'custom' && (
        <>
          <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="h-8 w-[140px] text-xs" />
          <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="h-8 w-[140px] text-xs" />
        </>
      )}
    </div>
  );
}
import React from 'react';

export default function RoasRangeBar({ low = 0, high = 0, max = 8 }) {
  const l = Math.max(0, Math.min(max, low));
  const h = Math.max(l, Math.min(max, high));
  return (
    <div>
      <div className="relative bg-slate-100 rounded-sm h-2">
        <div
          className="absolute top-0 h-2 bg-blue-800 rounded-sm"
          style={{ left: `${(l / max) * 100}%`, width: `${((h - l) / max) * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-slate-500 tabular-nums mt-1">
        <span>0x</span>
        <span className="text-slate-900 font-medium">{l.toFixed(1)}x – {h.toFixed(1)}x projected</span>
        <span>{max}x</span>
      </div>
    </div>
  );
}
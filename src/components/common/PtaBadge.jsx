import React from 'react';

const STYLES = {
  A: 'bg-blue-50 text-blue-800 border-blue-200',
  B: 'bg-slate-100 text-slate-700 border-slate-200',
  C: 'bg-slate-50 text-slate-500 border-slate-200',
  D: 'bg-slate-50 text-slate-400 border-slate-200'
};

export default function PtaBadge({ band, score }) {
  const b = band || 'D';
  return (
    <span className={`inline-flex items-center gap-1 border rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${STYLES[b] || STYLES.D}`}>
      <span className="font-semibold">{b}</span>
      {score != null && <span className="opacity-70">{Math.round(Number(score) * (Number(score) <= 1 ? 100 : 1))}</span>}
    </span>
  );
}
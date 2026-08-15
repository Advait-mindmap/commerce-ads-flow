import React from 'react';

const BANDS = {
  RED: 'bg-red-50 text-red-700 border-red-200',
  AMBER: 'bg-amber-50 text-amber-700 border-amber-200',
  YELLOW: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  GREEN: 'bg-emerald-50 text-emerald-700 border-emerald-200'
};

export default function ChurnBandBadge({ band }) {
  return (
    <span className={`text-[11px] font-medium border rounded px-1.5 py-0.5 ${BANDS[band] || BANDS.GREEN}`}>{band || '—'}</span>
  );
}
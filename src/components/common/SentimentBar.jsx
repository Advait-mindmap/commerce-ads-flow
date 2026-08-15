import React from 'react';

export default function SentimentBar({ value = 0, width = 40 }) {
  const v = Math.max(-1, Math.min(1, Number(value) || 0));
  const fill = ((v + 1) / 2) * 100;
  const color = v < -0.15 ? '#DC2626' : v < 0.2 ? '#D97706' : '#059669';
  return (
    <div className="bg-slate-100 rounded-sm h-1.5 overflow-hidden" style={{ width }}>
      <div className="h-full rounded-sm" style={{ width: `${fill}%`, backgroundColor: color }} />
    </div>
  );
}
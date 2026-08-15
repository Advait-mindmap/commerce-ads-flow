import React from 'react';

export default function Sparkline({ values = [], width = 80, height = 24, stroke }) {
  const nums = (values || []).map((v) => Number(v) || 0);
  if (nums.length < 2) return <span className="text-slate-300 text-[11px]">—</span>;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pad = 2;
  const step = (width - pad * 2) / (nums.length - 1);

  const points = nums
    .map((v, i) => {
      const x = pad + i * step;
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const declining = nums[nums.length - 1] < nums[0] * 0.97;
  const color = stroke || (declining ? '#DC2626' : '#94A3B8');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
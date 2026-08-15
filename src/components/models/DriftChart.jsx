import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Cell } from 'recharts';
import Panel from '@/components/common/Panel';

export default function DriftChart({ drift, maxPsi }) {
  const data = (drift || [])
    .slice()
    .sort((a, b) => (b.psi || 0) - (a.psi || 0))
    .map((d) => ({ name: (d.feature || '').replace(/_/g, ' '), psi: Number((d.psi || 0).toFixed(3)) }));

  return (
    <Panel title="Population drift (PSI per feature)">
      {data.length ? (
        <ResponsiveContainer width="100%" height={Math.max(220, data.length * 24)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid stroke="#E2E8F0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#64748B' }} />
            <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10, fill: '#334155' }} />
            <Tooltip contentStyle={{ fontSize: 12, borderColor: '#E2E8F0' }} />
            <ReferenceLine x={0.2} stroke="#DC2626" strokeDasharray="4 4" label={{ value: '0.20', fontSize: 10, fill: '#DC2626', position: 'top' }} />
            <Bar dataKey="psi" barSize={10}>
              {data.map((d, i) => <Cell key={i} fill={d.psi >= 0.2 ? '#DC2626' : '#1E40AF'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-xs text-slate-500 tabular-nums">
          No per-feature PSI recorded. Max PSI across features: {(maxPsi || 0).toFixed(3)} (threshold 0.20).
        </p>
      )}
    </Panel>
  );
}
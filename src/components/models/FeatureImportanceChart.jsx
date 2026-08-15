import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import Panel from '@/components/common/Panel';

export default function FeatureImportanceChart({ features }) {
  const data = (features || [])
    .slice()
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 15)
    .map((f) => ({ name: (f.feature || '').replace(/_/g, ' '), importance: Number((f.importance || 0).toFixed(4)) }));

  return (
    <Panel title="Feature importance — top 15">
      <ResponsiveContainer width="100%" height={Math.max(220, data.length * 24)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid stroke="#E2E8F0" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: '#64748B' }} />
          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10, fill: '#334155' }} />
          <Tooltip contentStyle={{ fontSize: 12, borderColor: '#E2E8F0' }} />
          <Bar dataKey="importance" fill="#1E40AF" barSize={10} />
        </BarChart>
      </ResponsiveContainer>
      {data.length === 0 && <p className="text-xs text-slate-500">No feature importances recorded.</p>}
    </Panel>
  );
}
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import Panel from '@/components/common/Panel';

const COLORS = ['#1E40AF', '#059669', '#D97706', '#DC2626', '#94A3B8', '#CBD5E1', '#64748B'];

export default function OutcomeDonut({ data }) {
  return (
    <Panel title="7-day outcomes">
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={40} outerRadius={62} strokeWidth={0}>
              {data.map((d, i) => <Cell key={d.name} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E2E8F0' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1 mt-2">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="text-slate-600 capitalize">{d.name.replace(/_/g, ' ')}</span>
            <span className="ml-auto text-slate-900 tabular-nums">{d.value}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
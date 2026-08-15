import React from 'react';
import { ResponsiveContainer, Scatter, XAxis, YAxis, Tooltip, CartesianGrid, Line, ComposedChart } from 'recharts';
import Panel from '@/components/common/Panel';

export default function CalibrationChart({ curve }) {
  const data = (curve || []).map((p) => ({
    predicted: Number(p.predicted),
    actual: Number(p.actual),
    reference: Number(p.predicted)
  }));

  return (
    <Panel title="Calibration curve">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
          <CartesianGrid stroke="#E2E8F0" />
          <XAxis type="number" dataKey="predicted" domain={[0, 1]} tick={{ fontSize: 10, fill: '#64748B' }} label={{ value: 'Predicted', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#64748B' }} />
          <YAxis type="number" domain={[0, 1]} tick={{ fontSize: 10, fill: '#64748B' }} label={{ value: 'Actual', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748B' }} />
          <Tooltip contentStyle={{ fontSize: 12, borderColor: '#E2E8F0' }} />
          <Line type="linear" dataKey="reference" stroke="#94A3B8" strokeDasharray="4 4" dot={false} strokeWidth={1} />
          <Scatter dataKey="actual" fill="#1E40AF" />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-xs text-slate-500">Dashed diagonal is perfect calibration.</p>
    </Panel>
  );
}
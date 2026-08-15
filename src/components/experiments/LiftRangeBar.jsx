import React from 'react';
import Panel from '@/components/common/Panel';

export default function LiftRangeBar({ low, high, point }) {
  if (low == null || high == null) {
    return <Panel title="Lift & confidence interval"><p className="text-xs text-slate-500">No interval computed yet.</p></Panel>;
  }
  const crossesZero = low <= 0 && high >= 0;
  const span = Math.max(Math.abs(low), Math.abs(high)) * 1.25 || 0.01;
  const toPct = (v) => ((v + span) / (2 * span)) * 100;

  return (
    <Panel title="Lift & confidence interval">
      <div className="relative h-16">
        <div className="absolute inset-x-0 top-7 h-px bg-slate-200" />
        <div className="absolute top-2 bottom-4 w-px bg-slate-400" style={{ left: '50%' }} />
        <div
          className={`absolute top-5 rounded-sm ${crossesZero ? 'bg-slate-400' : 'bg-emerald-500'}`}
          style={{ left: `${toPct(low)}%`, width: `${toPct(high) - toPct(low)}%`, height: 8 }}
        />
        {point != null && (
          <div className="absolute top-3 w-px bg-slate-900" style={{ left: `${toPct(point)}%`, height: 16 }} />
        )}
        <div className="absolute top-9 text-[11px] text-slate-500 tabular-nums" style={{ left: `${toPct(low)}%`, transform: 'translateX(-50%)' }}>
          {(low * 100).toFixed(1)}%
        </div>
        <div className="absolute top-9 text-[11px] text-slate-500 tabular-nums" style={{ left: `${toPct(high)}%`, transform: 'translateX(-50%)' }}>
          {(high * 100).toFixed(1)}%
        </div>
        <div className="absolute top-0 text-[11px] text-slate-400" style={{ left: '50%', transform: 'translateX(-50%)' }}>0</div>
      </div>
      <div className="text-xs text-slate-600 mt-1">
        {crossesZero ? 'Interval crosses zero — effect not distinguishable from no change.' : 'Interval excludes zero — effect is directional.'}
      </div>
    </Panel>
  );
}
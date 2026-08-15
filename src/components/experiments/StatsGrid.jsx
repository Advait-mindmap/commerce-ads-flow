import React from 'react';
import Panel from '@/components/common/Panel';
import { pct } from '@/lib/format';

function Stat({ label, value, tone }) {
  return (
    <div className="border border-slate-200 rounded p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      <div className={`text-lg font-semibold tabular-nums mt-1 ${tone || 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

const p = (v) => (v == null ? '—' : v < 0.001 ? '<0.001' : v.toFixed(3));

export default function StatsGrid({ exp }) {
  return (
    <div className="space-y-4">
      <Panel title="Significance">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Fixed horizon" value={p(exp.p_value_fixed)} />
          <Stat label="Always valid (mSPRT)" value={p(exp.p_value_msprt)} tone={exp.significant ? 'text-emerald-700' : 'text-slate-900'} />
        </div>
        <p className="text-xs text-slate-500 mt-2">mSPRT is the decision criterion — it remains valid under repeated peeking.</p>
      </Panel>

      <Panel title="Validity & efficiency">
        <div className="grid grid-cols-3 gap-3">
          <Stat
            label="SRM check"
            value={exp.srm_flagged ? 'Fail' : 'Pass'}
            tone={exp.srm_flagged ? 'text-red-600' : 'text-emerald-700'}
          />
          <Stat label="CUPED variance reduction" value={pct(exp.cuped_vr, 1)} />
          <Stat label="Power achieved" value={pct(exp.power_achieved, 0)} />
        </div>
        <p className="text-xs text-slate-500 mt-2 tabular-nums">SRM p-value {p(exp.srm_p)}</p>
      </Panel>
    </div>
  );
}
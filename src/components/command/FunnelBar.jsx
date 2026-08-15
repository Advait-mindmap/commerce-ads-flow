import React from 'react';
import { useNavigate } from 'react-router-dom';
import Panel from '@/components/common/Panel';

export default function FunnelBar({ steps }) {
  const navigate = useNavigate();
  const max = Math.max(...steps.map((s) => s.count), 1);

  return (
    <Panel title="Funnel" bodyClassName="p-4">
      <div className="flex items-stretch gap-1">
        {steps.map((s, i) => (
          <React.Fragment key={s.label}>
            <button
              onClick={() => navigate(s.to)}
              className="flex-1 text-left group"
            >
              <div className="border border-slate-200 rounded bg-slate-50 group-hover:border-blue-700 transition-colors px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium truncate">{s.label}</div>
                <div className="text-lg font-semibold text-slate-900 tabular-nums">{s.count.toLocaleString('en-IN')}</div>
                <div className="h-1 mt-2 bg-slate-200 rounded-sm overflow-hidden">
                  <div className="h-full bg-blue-800 rounded-sm" style={{ width: `${Math.max(2, (s.count / max) * 100)}%` }} />
                </div>
              </div>
            </button>
            {i < steps.length - 1 && (
              <div className="flex items-end pb-3 w-10 shrink-0 justify-center">
                <span className="text-xs text-slate-500 tabular-nums">
                  {steps[i + 1].count && s.count ? `${((steps[i + 1].count / s.count) * 100).toFixed(1)}%` : '—'}
                </span>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </Panel>
  );
}
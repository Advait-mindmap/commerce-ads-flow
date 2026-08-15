import React from 'react';
import { Link } from 'react-router-dom';

const STATUS = {
  running: 'bg-blue-50 text-blue-800 border-blue-200',
  concluded: 'bg-slate-100 text-slate-700 border-slate-200',
  stopped_guardrail: 'bg-red-50 text-red-700 border-red-200',
  draft: 'bg-slate-50 text-slate-500 border-slate-200'
};

export default function ExperimentCard({ exp }) {
  const n = (exp.arms || []).reduce((a, x) => Math.max(a, x.n || 0), 0);
  const required = exp.required_n_per_arm || 0;
  const progress = required ? Math.min(100, (n / required) * 100) : 0;

  return (
    <Link to={`/experiments/${exp.id}`} className="block bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-300">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-semibold text-slate-900">{exp.name}</span>
        <span className={`text-[11px] border rounded px-1.5 py-0.5 whitespace-nowrap ${STATUS[exp.status] || STATUS.draft}`}>
          {(exp.status || '').replace(/_/g, ' ')}
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-1.5">{exp.hypothesis}</p>
      <div className="text-[11px] text-slate-500 mt-2">
        Primary metric <span className="text-slate-800">{(exp.primary_metric || '').replace(/_/g, ' ')}</span>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100">
        {exp.status === 'running' ? (
          <>
            <div className="bg-slate-100 rounded-sm overflow-hidden" style={{ height: 4 }}>
              <div className="h-full bg-blue-800" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-[11px] text-slate-600 mt-1.5 tabular-nums">
              {Math.round(progress)}% to required n of {required.toLocaleString('en-IN')} per arm
            </div>
          </>
        ) : (
          <div className="text-[13px] tabular-nums">
            <span className={exp.significant ? 'text-emerald-700 font-medium' : 'text-slate-700 font-medium'}>
              {exp.relative_lift != null ? `${exp.relative_lift > 0 ? '+' : ''}${(exp.relative_lift * 100).toFixed(1)}%` : '—'}
            </span>
            {exp.ci_low != null && (
              <span className="text-slate-500 ml-2">
                CI [{(exp.ci_low * 100).toFixed(1)}%, {(exp.ci_high * 100).toFixed(1)}%]
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
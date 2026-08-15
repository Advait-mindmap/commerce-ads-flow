import React from 'react';
import { Button } from '@/components/ui/button';

export default function OptimizationAction({ action, onDecide, busy, canDecide = true }) {
  const decided = action.status === 'approved' || action.status === 'rejected';
  return (
    <div className="border border-slate-200 bg-white rounded p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-wide border border-blue-200 bg-blue-50 text-blue-800 rounded px-1.5 py-0.5">
          {(action.action_type || '').replace(/_/g, ' ')}
        </span>
        <span className="text-[11px] text-slate-500 tabular-nums">confidence {Math.round((action.confidence || 0) * 100)}%</span>
      </div>

      <div className="text-[13px] text-slate-900 mt-2">{action.target}</div>
      <div className="text-[13px] text-slate-700 tabular-nums mt-1">
        <span className="text-slate-500">{action.current_value}</span>
        <span className="mx-2 text-slate-400">→</span>
        <span className="font-medium">{action.recommended_value}</span>
      </div>
      <p className="text-xs text-slate-600 mt-2">{action.rationale}</p>
      <p className="text-xs text-emerald-700 mt-1">{action.projected_impact}</p>

      <div className="flex items-center justify-end gap-1.5 mt-3">
        {decided ? (
          <span className={`text-[11px] capitalize ${action.status === 'approved' ? 'text-emerald-700' : 'text-slate-500'}`}>{action.status}</span>
        ) : canDecide ? (
          <>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => onDecide('rejected')}>Reject</Button>
            <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => onDecide('approved')}>Approve</Button>
          </>
        ) : (
          <span className="text-[11px] text-slate-500">Awaiting approval</span>
        )}
      </div>
    </div>
  );
}
import React from 'react';

const STYLES = {
  qualified: 'bg-blue-50 text-blue-800 border-blue-200',
  meeting_booked: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  callback_requested: 'bg-amber-50 text-amber-800 border-amber-200',
  escalated: 'bg-red-50 text-red-700 border-red-200',
  not_qualified: 'bg-slate-100 text-slate-600 border-slate-200',
  no_answer: 'bg-slate-50 text-slate-500 border-slate-200',
  opted_out: 'bg-slate-100 text-slate-600 border-slate-200'
};

export default function OutcomeBadge({ outcome }) {
  if (!outcome) return <span className="text-slate-300 text-[11px]">—</span>;
  return (
    <span className={`inline-block border rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${STYLES[outcome] || STYLES.not_qualified}`}>
      {outcome.replace(/_/g, ' ')}
    </span>
  );
}
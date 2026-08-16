import React from 'react';
import { Clock } from 'lucide-react';
import PtaBadge from '@/components/common/PtaBadge';

/**
 * A lead on the pipeline board.
 *
 * Deliberately lighter than an opportunity card: a lead has no package and no
 * value yet, so showing an empty money row would imply a deal that does not
 * exist. What matters at this stage is who they are, how strong the signal is,
 * and whether the SLA clock is running out.
 */
export default function LeadCard({ lead, onClick, dragging }) {
  const overdue = lead.sla_status === 'breached';
  const dueSoon = lead.sla_status === 'at_risk';

  return (
    <div
      onClick={onClick}
      className={`bg-white border rounded-lg p-3 cursor-pointer hover:border-slate-300 ${
        dragging ? 'border-blue-800' : overdue ? 'border-red-300' : 'border-slate-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] font-medium text-slate-900 truncate">{lead.seller_name}</div>
        {lead.pta_band && <PtaBadge band={lead.pta_band} score={lead.pta_score} />}
      </div>

      {lead.category && (
        <div className="text-[11px] text-slate-500 mt-0.5 truncate">{lead.category}</div>
      )}

      <div className="flex items-center justify-between mt-2 text-[11px]">
        <span className="text-slate-500 truncate">{lead.assigned_rep_name || 'Unassigned'}</span>
        {(overdue || dueSoon) && (
          <span className={`inline-flex items-center gap-1 ${overdue ? 'text-red-600' : 'text-amber-600'}`}>
            <Clock className="w-3 h-3" /> {overdue ? 'SLA breached' : 'SLA at risk'}
          </span>
        )}
      </div>
    </div>
  );
}

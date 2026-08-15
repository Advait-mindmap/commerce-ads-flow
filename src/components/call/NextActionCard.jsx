import React from 'react';
import { CalendarCheck, AlertTriangle, Mail } from 'lucide-react';
import Panel from '@/components/common/Panel';
import { Button } from '@/components/ui/button';
import { dateTime } from '@/lib/format';

export default function NextActionCard({ run, lead, onAssign }) {
  const escalated = run.escalation && run.escalation.triggered;
  const meeting = lead && lead.meeting_scheduled_at;

  return (
    <Panel title="Next action">
      {meeting ? (
        <div className="border border-emerald-200 bg-emerald-50 rounded p-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-emerald-800">
            <CalendarCheck className="w-4 h-4" /> Meeting booked
          </div>
          <div className="text-[13px] text-slate-800 mt-2 tabular-nums">{dateTime(meeting)}</div>
          <div className="text-xs text-slate-600 mt-0.5">Rep: {lead.meeting_rep || '—'}</div>
        </div>
      ) : escalated ? (
        <div className="border border-red-200 bg-red-50 rounded p-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-red-700">
            <AlertTriangle className="w-4 h-4" /> Escalated to human rep
          </div>
          <div className="text-xs text-slate-600 mt-2">
            Trigger: {(run.escalation.trigger_type || '').replace(/_/g, ' ')}
          </div>
          <p className="text-[13px] italic text-slate-700 mt-1.5">“{run.escalation.trigger_verbatim}”</p>
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-slate-600">{run.escalation.assigned_rep || 'Unassigned'}</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onAssign}>Assign</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[13px] text-slate-700">
          <Mail className="w-4 h-4 text-slate-400" /> Added to nurture sequence
        </div>
      )}
    </Panel>
  );
}
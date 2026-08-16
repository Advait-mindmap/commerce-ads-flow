import React from 'react';
import { CalendarCheck, AlertTriangle, Mail, Loader2, Plus } from 'lucide-react';
import Panel from '@/components/common/Panel';
import { Button } from '@/components/ui/button';
import AssigneePicker from '@/components/common/AssigneePicker';
import { dateTime } from '@/lib/format';

export default function NextActionCard({ run, lead, sequence, onAssign, onAddToSequence, busy }) {
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
          {/* A named rep, chosen from the team, rather than a button that only
              logged that someone had been assigned. */}
          <div className="flex items-center justify-between gap-2 mt-3">
            <span className="text-xs text-slate-600">{run.escalation.assigned_rep || 'Unassigned'}</span>
            <AssigneePicker
              currentName={run.escalation.assigned_rep}
              onAssign={onAssign}
              disabled={busy}
              label="Assign to rep"
            />
          </div>
        </div>
      ) : sequence ? (
        /* The real enrolment, read from the sequence record — where it is in
           the cadence and when the next message goes out. */
        <div className="border border-slate-200 bg-slate-50 rounded p-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
            <Mail className="w-4 h-4 text-slate-500" /> In nurture sequence
          </div>
          <div className="text-xs text-slate-600 mt-2">
            Step {sequence.step_number || 1} of {sequence.total_steps || 4}
            {sequence.channel ? ` · ${String(sequence.channel).replace(/_/g, ' ')}` : ''}
          </div>
          {sequence.next_send_at && (
            <div className="text-xs text-slate-600 mt-0.5 tabular-nums">
              Next message {dateTime(sequence.next_send_at)}
            </div>
          )}
        </div>
      ) : (
        /* Nothing has happened yet, so the card offers the action rather than
           announcing one that was never taken. */
        <div className="space-y-2">
          <p className="text-[13px] text-slate-600">
            No follow-up scheduled for this seller yet.
          </p>
          {onAddToSequence && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onAddToSequence} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
              Add to nurture sequence
            </Button>
          )}
        </div>
      )}
    </Panel>
  );
}

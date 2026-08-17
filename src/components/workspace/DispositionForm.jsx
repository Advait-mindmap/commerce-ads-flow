import React, { useState } from 'react';
import Panel from '@/components/common/Panel';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const OUTCOMES = ['connected_interested', 'connected_not_interested', 'meeting_booked', 'callback_requested', 'no_answer', 'wrong_number', 'opted_out'];
const OBJECTIONS = ['budget', 'timing', 'trust_roas', 'needs_approval', 'agency_managed', 'tried_before', 'not_priority'];
const NEXT_ACTIONS = ['book_meeting', 'send_proposal', 'schedule_callback', 'add_to_nurture', 'disqualify'];

export default function DispositionForm({ onLog, onNext, busy }) {
  const [outcome, setOutcome] = useState('');
  const [objections, setObjections] = useState([]);
  const [nextAction, setNextAction] = useState('');
  const [notes, setNotes] = useState('');

  const toggle = (o) => setObjections((s) => (s.includes(o) ? s.filter((x) => x !== o) : [...s, o]));

  const submit = async () => {
    await onLog({ outcome, objections, nextAction, notes });
    setOutcome(''); setObjections([]); setNextAction(''); setNotes('');
  };

  return (
    <Panel title="Disposition">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Outcome</label>
          <Select value={outcome} onValueChange={setOutcome}>
            <SelectTrigger className="h-9 text-xs mt-1"><SelectValue placeholder="Select outcome" /></SelectTrigger>
            <SelectContent>
              {OUTCOMES.map((o) => <SelectItem key={o} value={o} className="text-xs">{o.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Next action</label>
          <Select value={nextAction} onValueChange={setNextAction}>
            <SelectTrigger className="h-9 text-xs mt-1"><SelectValue placeholder="Select next action" /></SelectTrigger>
            <SelectContent>
              {NEXT_ACTIONS.map((o) => <SelectItem key={o} value={o} className="text-xs">{o.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-3">
        <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Objections raised</label>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {OBJECTIONS.map((o) => (
            <button
              key={o}
              onClick={() => toggle(o)}
              className={`text-[11px] border rounded px-2 py-1 ${objections.includes(o) ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              {o.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Notes</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1 text-xs" placeholder="What did the seller say?" />
      </div>

      <div className="flex items-center justify-end gap-2 mt-3">
        {onNext && (
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={onNext}>
            Next lead
          </Button>
        )}
        <Button size="sm" className="h-8 text-xs" disabled={!outcome || busy} onClick={submit}>
          Log interaction
        </Button>
      </div>
    </Panel>
  );
}
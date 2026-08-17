import React, { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import Panel from '@/components/common/Panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dateTime } from '@/lib/format';

/**
 * Recording an observed case against a running experiment.
 *
 * An experiment otherwise only moves as the funnel produces units, which is
 * right for a live test and useless when someone is running one deliberately.
 * A logged case is counted exactly like a derived unit, so the arms, the lift
 * and the p-values all move with it.
 */
export default function LogCasePanel({ exp, onLog, busy }) {
  const [unitRef, setUnitRef] = useState('');
  const [arm, setArm] = useState('');
  const [converted, setConverted] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const running = exp.status === 'running';
  const observations = exp.observations || [];

  const submit = async () => {
    setError('');
    if (converted === null) return setError('Say whether the case converted.');
    if (!unitRef.trim() && !arm) return setError('Give a unit reference, or choose an arm.');
    try {
      await onLog({ unit_ref: unitRef.trim() || undefined, arm: arm || undefined, converted, note: note.trim() || undefined });
      setUnitRef(''); setArm(''); setConverted(null); setNote('');
    } catch (err) {
      setError(err.message || 'Could not log the case');
    }
  };

  return (
    <Panel
      title="Log a case"
      action={observations.length
        ? <span className="text-[11px] text-slate-500 tabular-nums">{observations.length} logged</span>
        : null}
    >
      {!running ? (
        <p className="text-xs text-slate-500">
          This experiment is {(exp.status || '').replace(/_/g, ' ')}. Only a running experiment accumulates cases.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Unit reference</label>
              <Input
                value={unitRef}
                onChange={(e) => setUnitRef(e.target.value)}
                placeholder={`${exp.unit_type} id or seller name`}
                className="h-8 mt-1 text-xs"
              />
              {/* Naming the unit is the safer path: the arm is then computed the
                  same way the engine assigns everything else, so a case cannot
                  be filed into whichever arm would flatter the result. */}
              <p className="text-[11px] text-slate-500 mt-1">
                {unitRef.trim()
                  ? 'Arm will be assigned from this reference.'
                  : 'Leave blank only if you must choose the arm by hand.'}
              </p>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Arm</label>
              <div className="flex gap-1.5 mt-1">
                {['control', 'treatment'].map((a) => (
                  <button
                    key={a}
                    type="button"
                    disabled={Boolean(unitRef.trim())}
                    onClick={() => setArm(arm === a ? '' : a)}
                    className={`text-xs px-2.5 h-8 rounded border ${
                      arm === a ? 'border-blue-800 bg-blue-50 text-blue-900' : 'border-slate-200 text-slate-600'
                    } ${unitRef.trim() ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">
              Converted on {(exp.primary_metric || '').replace(/_/g, ' ')}?
            </label>
            <div className="flex gap-1.5 mt-1">
              {[['Yes', true], ['No', false]].map(([label, v]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setConverted(converted === v ? null : v)}
                  className={`text-xs px-3 h-8 rounded border ${
                    converted === v ? 'border-blue-800 bg-blue-50 text-blue-900' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Note</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" className="h-8 mt-1 text-xs" />
          </div>

          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

          <div className="flex justify-end mt-3">
            <Button size="sm" className="h-8 text-xs" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
              Log case
            </Button>
          </div>
        </>
      )}

      {observations.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-200">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-2">
            Cases logged by hand — counted in the arms above
          </div>
          <ol className="space-y-1.5">
            {observations.slice().reverse().slice(0, 6).map((o) => (
              <li key={o.id} className="flex items-center gap-2 text-[11px] text-slate-600">
                <span className={`border rounded px-1.5 py-0.5 ${
                  o.arm === 'treatment' ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}>{o.arm}</span>
                <span className={o.converted ? 'text-emerald-700' : 'text-slate-500'}>
                  {o.converted ? 'converted' : 'did not convert'}
                </span>
                {o.unit_ref && <span className="truncate">· {o.unit_ref}</span>}
                {o.arm_source === 'chosen' && <span className="text-amber-700">· arm chosen by hand</span>}
                <span className="ml-auto tabular-nums whitespace-nowrap">{dateTime(o.logged_at)}</span>
              </li>
            ))}
          </ol>
          {observations.length > 6 && (
            <p className="text-[11px] text-slate-500 mt-2">and {observations.length - 6} earlier</p>
          )}
        </div>
      )}
    </Panel>
  );
}

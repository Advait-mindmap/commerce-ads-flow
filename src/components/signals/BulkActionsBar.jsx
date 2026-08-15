import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// "Assign to me" rather than "Assign to rep": there is no rep picker, and the
// signed-in user is the only assignee this screen can resolve honestly.
export const BULK_ACTIONS = [
  { key: 'queue', label: 'Queue for AI SDR', cap: 'dial' },
  { key: 'sequence', label: 'Add to sequence' },
  { key: 'assign', label: 'Assign to me' }
];

export default function BulkActionsBar({ count, onClear, onAction, busy, canDial = true }) {
  if (!count) return null;
  const actions = BULK_ACTIONS.filter((a) => !a.cap || (a.cap === 'dial' && canDial));

  return (
    <div className="sticky bottom-0 z-10 flex items-center gap-3 bg-slate-900 text-white px-4 py-2.5">
      <span className="text-xs tabular-nums">{count} selected</span>
      <div className="flex items-center gap-2 ml-2">
        {actions.map((a) => (
          <Button
            key={a.key}
            size="sm"
            variant="secondary"
            disabled={busy}
            className="h-7 text-xs bg-white/10 text-white hover:bg-white/20 border-0 disabled:opacity-50"
            onClick={() => onAction(a.key)}
          >
            {a.label}
          </Button>
        ))}
      </div>
      <button onClick={onClear} className="ml-auto text-slate-300 hover:text-white"><X className="w-4 h-4" /></button>
    </div>
  );
}
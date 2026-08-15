import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function BulkActionsBar({ count, onClear, onAction }) {
  if (!count) return null;
  return (
    <div className="sticky bottom-0 z-10 flex items-center gap-3 bg-slate-900 text-white px-4 py-2.5">
      <span className="text-xs tabular-nums">{count} selected</span>
      <div className="flex items-center gap-2 ml-2">
        {['Queue for AI SDR', 'Add to sequence', 'Assign to rep'].map((a) => (
          <Button
            key={a}
            size="sm"
            variant="secondary"
            className="h-7 text-xs bg-white/10 text-white hover:bg-white/20 border-0"
            onClick={() => onAction(a)}
          >
            {a}
          </Button>
        ))}
      </div>
      <button onClick={onClear} className="ml-auto text-slate-300 hover:text-white"><X className="w-4 h-4" /></button>
    </div>
  );
}
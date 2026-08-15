import React from 'react';
import { Button } from '@/components/ui/button';

export default function MqlBulkBar({ count, onClear, onQueue, onSequence, onDisqualify, busy }) {
  if (!count) return null;
  return (
    <div className="sticky bottom-4 z-10 bg-white border border-slate-200 rounded-lg px-4 py-2.5 flex items-center gap-2 flex-wrap">
      <span className="text-[13px] text-slate-900 tabular-nums font-medium">{count} selected</span>
      <button onClick={onClear} className="text-xs text-slate-500 hover:underline">Clear</button>
      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={onQueue}>Queue for AI SDR</Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={onSequence}>Add to sequence</Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={onDisqualify}>Disqualify</Button>
      </div>
    </div>
  );
}
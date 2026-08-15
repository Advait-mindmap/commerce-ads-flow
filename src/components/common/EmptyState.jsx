import React from 'react';
import { Button } from '@/components/ui/button';

export default function EmptyState({ message, actionLabel, onAction, to }) {
  return (
    <div className="px-4 py-10 flex flex-col items-center gap-3">
      <p className="text-[13px] text-slate-500">{message}</p>
      {actionLabel && (
        to
          ? <Button size="sm" className="h-8 text-xs" asChild><a href={to}>{actionLabel}</a></Button>
          : <Button size="sm" className="h-8 text-xs" onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}
import React from 'react';

const GREY = '#F1F5F9';

export function TableSkeleton({ rows = 8, columns = 6 }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="h-9 border-b border-slate-200" style={{ backgroundColor: GREY }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 border-b border-slate-100 last:border-0" style={{ height: 40 }}>
          {Array.from({ length: columns }).map((__, j) => (
            <div key={j} className="rounded-sm flex-1" style={{ height: 10, backgroundColor: GREY }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ height = 120 }) {
  return <div className="border border-slate-200 rounded-lg" style={{ height, backgroundColor: GREY }} />;
}

export function CardGridSkeleton({ count = 6, height = 120, className = 'grid grid-cols-2 xl:grid-cols-3 gap-3' }) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => <CardSkeleton key={i} height={height} />)}
    </div>
  );
}

export function PanelSkeleton({ height = 260 }) {
  return <div className="border border-slate-200 rounded-lg" style={{ height, backgroundColor: GREY }} />;
}
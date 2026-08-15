import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Panel from '@/components/common/Panel';

export default function AttentionRequired({ items }) {
  return (
    <Panel title="Attention required" bodyClassName="p-0">
      {items.map((it) => (
        <Link
          key={it.label}
          to={it.to}
          className="flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50"
        >
          <span className="text-[13px] text-slate-700">{it.label}</span>
          <span className="flex items-center gap-2">
            <span
              className={`min-w-6 text-center border rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                it.count > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
            >
              {it.count}
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </span>
        </Link>
      ))}
    </Panel>
  );
}
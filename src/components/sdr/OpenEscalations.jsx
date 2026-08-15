import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Panel from '@/components/common/Panel';
import { dateTime } from '@/lib/format';

export default function OpenEscalations({ runs }) {
  return (
    <Panel title="Open escalations" bodyClassName="p-0">
      {runs.map((r) => (
        <Link
          key={r.id}
          to={`/sdr/calls/${r.id}`}
          className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50"
        >
          <span className="min-w-0">
            <span className="block text-[13px] text-slate-900 font-medium truncate">{r.seller_name}</span>
            <span className="block text-[11px] text-slate-500 truncate">
              {(r.escalation && r.escalation.trigger_type || '').replace(/_/g, ' ')} · {dateTime(r.started_at)}
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400 ml-auto shrink-0" />
        </Link>
      ))}
      {runs.length === 0 && <p className="px-4 py-6 text-xs text-slate-500">No open escalations.</p>}
    </Panel>
  );
}
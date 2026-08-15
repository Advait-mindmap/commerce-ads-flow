import React from 'react';
import { Check, X } from 'lucide-react';
import Panel from '@/components/common/Panel';

export default function ObjectionsCard({ objections }) {
  return (
    <Panel title="Objections">
      <div className="space-y-3">
        {(objections || []).map((o, i) => (
          <div key={i} className="border border-slate-200 rounded p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wide border border-slate-200 bg-slate-50 rounded px-1.5 py-0.5 text-slate-600">
                {(o.objection_type || '').replace(/_/g, ' ')}
              </span>
              {o.resolved
                ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700"><Check className="w-3.5 h-3.5" /> Resolved</span>
                : <span className="inline-flex items-center gap-1 text-[11px] text-red-600"><X className="w-3.5 h-3.5" /> Open</span>}
            </div>
            <p className="text-[13px] italic text-slate-700 mt-2">“{o.verbatim}”</p>
            <p className="text-xs text-slate-500 mt-1.5">{o.agent_response}</p>
          </div>
        ))}
        {(!objections || objections.length === 0) && <p className="text-xs text-slate-500">No objections raised.</p>}
      </div>
    </Panel>
  );
}
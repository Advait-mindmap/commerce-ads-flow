import React from 'react';
import PtaBadge from '@/components/common/PtaBadge';
import { inr } from '@/lib/format';

function slaLabel(ms) {
  if (ms == null) return { text: 'No SLA', color: 'text-slate-400' };
  if (ms <= 0) return { text: 'Breached', color: 'text-red-600' };
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const text = m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s).padStart(2, '0')}`;
  return { text, color: m < 5 ? 'text-red-600' : m < 30 ? 'text-amber-600' : 'text-slate-600' };
}

export default function QueueCard({ lead, selected, onSelect, now }) {
  const due = lead.sla_due_at ? new Date(lead.sla_due_at).getTime() - now : null;
  const sla = slaLabel(due);

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 border-b border-slate-100 hover:bg-slate-50 ${selected ? 'bg-blue-50 border-l-2 border-l-blue-800' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-slate-900 truncate">{lead.seller_name}</span>
        <span className={`text-xs tabular-nums shrink-0 ${sla.color}`}>{sla.text}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <span className="text-[11px] text-slate-500">{lead.category}</span>
        <PtaBadge band={lead.pta_band} score={lead.pta_score} />
        <span className="text-[10px] uppercase tracking-wide border border-slate-200 bg-slate-50 rounded px-1 py-0.5 text-slate-500">
          {(lead.source || '').replace(/_/g, ' ')}
        </span>
      </div>
      <p className="text-[11px] text-slate-500 mt-1.5 truncate">{(lead.pta_reasons || [])[0] || '—'}</p>
      <div className="text-[11px] text-slate-700 tabular-nums mt-1">{inr(lead.budget_target)} / mo target</div>
    </button>
  );
}
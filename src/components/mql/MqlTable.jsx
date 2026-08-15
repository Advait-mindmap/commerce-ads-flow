import React from 'react';
import { Link } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import PtaBadge from '@/components/common/PtaBadge';
import EmptyState from '@/components/common/EmptyState';

const SOURCE = 'text-[11px] border border-slate-200 bg-slate-50 text-slate-600 rounded px-1.5 py-0.5 whitespace-nowrap';

const SUPPRESSION = {
  none: 'text-slate-400',
  dnd: 'text-red-600',
  opted_out: 'text-red-600',
  frequency_cap: 'text-amber-600',
  recent_contact: 'text-amber-600'
};

const HEADERS = ['', 'Seller', 'Source', 'MQL trigger', 'Age', 'PTA', 'Sequence', 'Next action', 'Suppression', 'Actions'];

const ageDays = (at) => (at ? Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 86400000)) : null);

export default function MqlTable({ leads, sequences, selected, onToggle, onToggleAll, onQueue, onDisqualify }) {
  const seqFor = (lead) => sequences.find((s) => s.lead_id === lead.id && s.status === 'active');

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-3 py-2 w-8">
              <Checkbox checked={leads.length > 0 && leads.every((l) => selected.includes(l.id))} onCheckedChange={onToggleAll} />
            </th>
            {HEADERS.slice(1).map((h) => (
              <th key={h} className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => {
            const seq = seqFor(l);
            const age = ageDays(l.mql_at || l.created_date);
            return (
              <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2"><Checkbox checked={selected.includes(l.id)} onCheckedChange={() => onToggle(l.id)} /></td>
                <td className="px-3 py-2 text-[13px] font-medium text-slate-900 max-w-[170px] truncate">
                  {l.seller_id ? <Link to={`/sellers/${l.seller_id}`} className="hover:underline">{l.seller_name}</Link> : l.seller_name}
                </td>
                <td className="px-3 py-2"><span className={SOURCE}>{(l.source || '').replace(/_/g, ' ')}</span></td>
                <td className="px-3 py-2 text-xs text-slate-700 max-w-[240px]">{l.mql_trigger || '—'}</td>
                <td className={`px-3 py-2 text-[13px] tabular-nums ${age > 5 ? 'text-red-600' : 'text-slate-700'}`}>{age != null ? `${age}d` : '—'}</td>
                <td className="px-3 py-2"><PtaBadge band={l.pta_band} score={l.pta_score} /></td>
                <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                  {seq ? `${seq.sequence_type} · ${seq.step_number}/${seq.total_steps}` : '—'}
                </td>
                <td className="px-3 py-2 text-xs text-slate-700 whitespace-nowrap">
                  {l.agent_attempts > 0 ? `Retry AI SDR (${l.agent_attempts} attempts)` : 'Queue for AI SDR'}
                </td>
                <td className={`px-3 py-2 text-xs ${SUPPRESSION[l.suppression_status] || SUPPRESSION.none}`}>
                  {(l.suppression_status || 'none').replace(/_/g, ' ')}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <button onClick={() => onQueue([l.id])} className="text-xs text-blue-800 hover:underline">Queue</button>
                  <span className="text-slate-300 mx-1.5">·</span>
                  <button onClick={() => onDisqualify([l.id])} className="text-xs text-slate-500 hover:underline">Disqualify</button>
                </td>
              </tr>
            );
          })}
          {leads.length === 0 && (
            <tr><td colSpan={10} className="p-0">
              <EmptyState message="No marketing-qualified leads waiting here right now." actionLabel="Find signals" to="/signals" />
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
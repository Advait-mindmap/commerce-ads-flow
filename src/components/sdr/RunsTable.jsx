import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import OutcomeBadge from '@/components/common/OutcomeBadge';
import SentimentBar from '@/components/common/SentimentBar';
import { mmss, timeOnly, inrFull } from '@/lib/format';
import { useConfig } from '@/lib/ConfigContext';

const HEADERS = ['Time', 'Seller', 'Agent/Rep', 'Channel', 'Duration', 'Outcome', 'Sentiment', 'Script', 'Cost', ''];

export default function RunsTable({ runs }) {
  const [tick, setTick] = useState(0);
  const { usdToInr } = useConfig();

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {HEADERS.map((h, i) => (
              <th key={i} className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const live = r.status === 'in_progress';
            const escalated = r.outcome === 'escalated' || (r.escalation && r.escalation.triggered);
            const liveDuration = live && r.started_at
              ? Math.max(0, Math.round((Date.now() - new Date(r.started_at).getTime()) / 1000))
              : r.duration_sec;
            return (
              <tr key={r.id + tick * 0} className={`border-b border-slate-100 hover:bg-slate-50 ${escalated ? 'border-l-2 border-l-red-600' : ''}`}>
                <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums whitespace-nowrap">
                  {live && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse mr-1.5 align-middle" />}
                  {timeOnly(r.started_at)}
                </td>
                <td className="px-3 py-2 text-[13px] text-slate-900 font-medium max-w-[180px] truncate">{r.seller_name}</td>
                <td className="px-3 py-2 text-[13px] text-slate-600">
                  {r.escalation && r.escalation.assigned_rep ? r.escalation.assigned_rep : 'AI SDR'}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{(r.channel || '').replace(/_/g, ' ')}</td>
                <td className="px-3 py-2 text-[13px] text-slate-700 font-mono tabular-nums">{mmss(liveDuration)}</td>
                <td className="px-3 py-2">{live ? <span className="text-[11px] text-slate-500">in progress</span> : <OutcomeBadge outcome={r.outcome} />}</td>
                <td className="px-3 py-2"><SentimentBar value={r.overall_sentiment || 0} /></td>
                <td className="px-3 py-2 text-xs text-slate-600">{r.script_variant || '—'}</td>
                <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{inrFull(usdToInr(r.cost_usd))}</td>
                <td className="px-3 py-2">
                  <Link to={`/sdr/calls/${r.id}`} className="text-xs text-blue-800 hover:underline">View</Link>
                </td>
              </tr>
            );
          })}
          {runs.length === 0 && (
            <tr><td colSpan={10} className="px-4 py-10 text-center text-xs text-slate-500">No calls yet today.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
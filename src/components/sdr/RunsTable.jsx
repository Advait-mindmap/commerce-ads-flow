import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarCheck, FileText } from 'lucide-react';
import OutcomeBadge from '@/components/common/OutcomeBadge';
import SentimentBar from '@/components/common/SentimentBar';
import { mmss, timeOnly, inrFull, dateTime } from '@/lib/format';
import { useConfig } from '@/lib/ConfigContext';

const HEADERS = ['Time', 'Seller', 'Outcome', 'Duration', 'Transcript', 'Meeting', 'Agent/Rep', 'Channel', 'Sentiment', 'Script', 'Cost'];

export default function RunsTable({ runs, leadsById = {} }) {
  const [tick, setTick] = useState(0);
  const { usdToInr } = useConfig();
  const navigate = useNavigate();

  // A meeting lives on the lead, not the call, so it is resolved through the
  // lead the run belongs to.
  const meetingFor = (run) => {
    const lead = run.lead_id ? leadsById[run.lead_id] : null;
    if (!lead || lead.meeting_status !== 'booked') return null;
    return lead.meeting_scheduled_at || null;
  };

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
            // A queued call is placed but not yet answered; it is pending, not blank.
            const live = r.status === 'in_progress' || r.status === 'queued';
            const escalated = r.outcome === 'escalated' || (r.escalation && r.escalation.triggered);
            const liveDuration = live && r.started_at
              ? Math.max(0, Math.round((Date.now() - new Date(r.started_at).getTime()) / 1000))
              : r.duration_sec;
            return (
              <tr
                key={r.id + tick * 0}
                onClick={() => navigate(`/sdr/calls/${r.id}`)}
                className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${escalated ? 'border-l-2 border-l-red-600' : ''}`}
              >
                <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums whitespace-nowrap">
                  {live && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse mr-1.5 align-middle" />}
                  {timeOnly(r.started_at)}
                </td>
                {/* Opens everything known about this seller's outreach. */}
                <td className="px-3 py-2 text-[13px] font-medium max-w-[180px] truncate">
                  {r.seller_id ? (
                    <Link
                      to={`/sdr/sellers/${r.seller_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-slate-900 hover:text-blue-800 hover:underline"
                    >
                      {r.seller_name}
                    </Link>
                  ) : (
                    <span className="text-slate-900">{r.seller_name}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {live
                    ? <span className="text-[11px] text-slate-500">{r.status === 'queued' ? 'connecting…' : 'in progress'}</span>
                    : <OutcomeBadge outcome={r.outcome} />}
                </td>
                <td className="px-3 py-2 text-[13px] text-slate-700 font-mono tabular-nums">{mmss(liveDuration)}</td>
                {/* The reason to open a row is the conversation, so say whether
                    there is one and make it the visible action. */}
                <td className="px-3 py-2 whitespace-nowrap">
                  {(r.transcript || []).length > 0 ? (
                    <Link
                      to={`/sdr/calls/${r.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs text-blue-800 hover:underline"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {r.transcript.length} turns
                    </Link>
                  ) : (
                    <span className="text-[11px] text-slate-400">{live ? 'in progress' : 'none'}</span>
                  )}
                </td>
                {/* Meetings booked off this call, so the floor can see outcomes
                    without opening each record. */}
                <td className="px-3 py-2 text-[11px] whitespace-nowrap">
                  {meetingFor(r) ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CalendarCheck className="w-3.5 h-3.5" />
                      <span className="tabular-nums">{dateTime(meetingFor(r))}</span>
                    </span>
                  ) : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2 text-[13px] text-slate-600 whitespace-nowrap">
                  {r.escalation && r.escalation.assigned_rep ? r.escalation.assigned_rep : (r.agent_name || 'AI SDR')}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{(r.channel || '').replace(/_/g, ' ')}</td>
                <td className="px-3 py-2"><SentimentBar value={r.overall_sentiment || 0} /></td>
                <td className="px-3 py-2 text-xs text-slate-600">{r.script_variant || '—'}</td>
                <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{inrFull(usdToInr(r.cost_usd))}</td>
              </tr>
            );
          })}
          {runs.length === 0 && (
            <tr><td colSpan={11} className="px-4 py-10 text-center text-xs text-slate-500">No calls yet today.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
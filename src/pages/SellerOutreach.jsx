import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarCheck, Phone, ShieldAlert } from 'lucide-react';
import { api } from '@/api/client';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import Panel from '@/components/common/Panel';
import PtaBadge from '@/components/common/PtaBadge';
import OutcomeBadge from '@/components/common/OutcomeBadge';
import SentimentBar from '@/components/common/SentimentBar';
import { PanelSkeleton } from '@/components/common/Skeletons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { dateTime, inr, mmss, timeOnly } from '@/lib/format';
import { useAuth } from '@/lib/AuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { dialOne } from '@/lib/dialer';

/**
 * Everything the outreach floor knows about one seller, in one place: who was
 * called, what was said, what is scheduled, and what is blocking further
 * contact. Reached by clicking a row in the AI SDR console.
 */
export default function SellerOutreach() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const { hasCap } = useAuth();
  const { usdToInr } = useConfig();

  const load = async () => {
    const seller = await api.entities.Seller.get(id);
    const settled = await Promise.allSettled([
      api.entities.AgentRun.filter({ seller_id: id }, '-started_at', 200),
      api.entities.Lead.filter({ seller_id: id }),
      api.entities.Contact.filter({ seller_id: id }),
      api.entities.Interaction.filter({ seller_id: id }, '-started_at', 100),
      api.entities.Sequence.filter({ seller_id: id }),
      api.entities.Suppression.filter({ seller_id: id })
    ]);
    const [runs, leads, contacts, interactions, sequences, suppressions] =
      settled.map((s) => (s.status === 'fulfilled' ? s.value : []));
    setData({ seller, runs, leads, contacts, interactions, sequences, suppressions });
  };

  useEffect(() => { load(); }, [id]);

  if (!data) {
    return (
      <div className="p-6 space-y-4">
        <PanelSkeleton height={96} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <PanelSkeleton height={320} />
          <div className="lg:col-span-2"><PanelSkeleton height={320} /></div>
        </div>
      </div>
    );
  }

  const { seller, runs, leads, contacts, interactions, sequences, suppressions } = data;
  const primary = contacts.find((c) => c.is_primary) || contacts[0] || null;
  const lead = leads[0] || null;

  const now = Date.now();
  const activeSuppression = suppressions.find((s) => !s.expires_at || new Date(s.expires_at).getTime() > now);

  // Meetings the console should surface for this person.
  const meetings = leads
    .filter((l) => l.meeting_status && l.meeting_status !== 'none')
    .map((l) => ({
      at: l.meeting_scheduled_at,
      rep: l.meeting_rep,
      bookedBy: l.meeting_booked_by,
      status: l.meeting_status,
      leadId: l.id
    }))
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

  const connected = runs.filter((r) => (r.duration_sec || 0) > 15).length;
  const totalCost = usdToInr(runs.reduce((a, r) => a + (r.cost_usd || 0), 0));

  const callNow = async () => {
    if (!lead) {
      toast({ title: 'No lead yet', description: 'Create a lead from Seller 360 before dialling.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const result = await dialOne(lead.id);
    setBusy(false);
    if (result.status === 'blocked') {
      toast({ title: 'Blocked by the suppression gate', description: result.reason, variant: 'destructive' });
      return;
    }
    if (result.status === 'failed') {
      toast({ title: 'Call failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Call placed', description: seller.display_name });
    load();
  };

  return (
    <div className="p-6 space-y-4">
      <Breadcrumbs parent="AI SDR Console" parentTo="/sdr" current={seller.display_name} />

      {/* Who this is, and the commercial context the agent opens with. */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap gap-4 items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold text-slate-900">{seller.display_name}</h1>
            <PtaBadge band={seller.pta_band} score={seller.pta_score} />
            <span className="text-[11px] border border-slate-200 bg-slate-50 rounded px-1.5 py-0.5 text-slate-600 capitalize">{seller.status}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            {seller.category} · {seller.city}, {seller.state} · {Math.round((seller.tenure_days || 0) / 30)} months tenure
          </div>
          <div className="text-xs text-slate-600 mt-1 tabular-nums">
            {primary ? `${primary.full_name} · ${primary.role} · ${primary.phone}` : (seller.contact_phone || 'No contact on file')}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-xs text-slate-600 tabular-nums">
            Budget {inr(seller.budget_low)}–{inr(seller.budget_stretch)} · GMV {inr(seller.gmv_30d)}
          </div>
          <div className="flex gap-1.5">
            <Link to={`/sellers/${seller.id}`} className="text-xs text-blue-800 hover:underline self-center mr-2">Open Seller 360</Link>
            {hasCap('dial') && (
              <Button size="sm" className="h-8 text-xs" onClick={callNow} disabled={busy || Boolean(activeSuppression)}>
                <Phone className="w-3.5 h-3.5 mr-1.5" /> Call now
              </Button>
            )}
          </div>
        </div>
      </div>

      {activeSuppression && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Further contact is blocked — <span className="font-medium">{String(activeSuppression.reason).replace(/_/g, ' ')}</span>.
            {activeSuppression.notes ? ` ${activeSuppression.notes}` : ''}
            {activeSuppression.expires_at ? ` Expires ${dateTime(activeSuppression.expires_at)}.` : ' This suppression is permanent.'}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ['Attempts', runs.length],
          ['Connected', connected],
          ['Meetings', meetings.length],
          ['Sequences', sequences.filter((s) => s.status === 'active').length],
          ['Call cost', totalCost ? `₹${Math.round(totalCost)}` : '₹0']
        ].map(([label, value]) => (
          <div key={label} className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</div>
            <div className="text-lg font-semibold text-slate-900 tabular-nums mt-0.5">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="space-y-4">
          <Panel title="Why we call">
            <ul className="space-y-2">
              {(seller.pta_reasons || []).map((r, i) => (
                <li key={i} className="flex gap-2 text-[13px] text-slate-700">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-blue-800 shrink-0" />
                  <span>{r}</span>
                </li>
              ))}
              {!(seller.pta_reasons || []).length && <li className="text-xs text-slate-500">No signals recorded.</li>}
            </ul>
          </Panel>

          <Panel title="Meetings scheduled">
            {meetings.length ? (
              <div className="space-y-2">
                {meetings.map((m, i) => (
                  <div key={i} className="border border-emerald-200 bg-emerald-50 rounded p-2.5">
                    <div className="flex items-center gap-1.5 text-[13px] font-medium text-emerald-800">
                      <CalendarCheck className="w-3.5 h-3.5" /> {m.at ? dateTime(m.at) : 'Time to be confirmed'}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      {m.rep ? `With ${m.rep}` : 'Rep unassigned'} · booked by {m.bookedBy === 'agent' ? 'AI SDR' : 'a human rep'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No meeting booked with this seller yet.</p>
            )}
          </Panel>

          <Panel title="Sequences">
            {sequences.length ? (
              <div className="space-y-2">
                {sequences.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="text-slate-800">{s.sequence_type} · {s.channel}</span>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      step {s.step_number}/{s.total_steps} · {s.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-slate-500">Not enrolled in any sequence.</p>}
          </Panel>
        </div>

        {/* Every attempt, newest first, with the transcript inline. */}
        <div className="lg:col-span-2">
          <Panel title={`Outreach attempts (${runs.length})`} bodyClassName="p-0">
            {runs.length === 0 && <p className="p-4 text-xs text-slate-500">No calls have been placed to this seller yet.</p>}
            {runs.map((r) => (
              <div key={r.id} className="border-b border-slate-100 last:border-0 px-4 py-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-slate-900 tabular-nums">{dateTime(r.started_at)}</span>
                    {r.is_manual_dial && (
                      <span className="text-[10px] uppercase tracking-wide border border-slate-200 bg-slate-50 rounded px-1 py-0.5 text-slate-500">manual</span>
                    )}
                    {['queued', 'in_progress'].includes(r.status)
                      ? <span className="text-[11px] text-slate-500">{r.status.replace('_', ' ')}</span>
                      : <OutcomeBadge outcome={r.outcome} />}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 tabular-nums">
                    <span>{mmss(r.duration_sec)}</span>
                    <span>{r.script_variant || '—'}</span>
                    <SentimentBar value={r.overall_sentiment || 0} />
                    <Link to={`/sdr/calls/${r.id}`} className="text-blue-800 hover:underline">Open</Link>
                  </div>
                </div>

                {(r.transcript || []).length > 0 && (
                  <div className="mt-2 rounded border border-slate-200 bg-slate-50 divide-y divide-slate-200 max-h-52 overflow-y-auto">
                    {r.transcript.map((t, i) => (
                      <div key={i} className="px-2.5 py-1.5">
                        <span className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mr-2">
                          {t.role === 'user' ? 'Seller' : 'Agent'}
                        </span>
                        <span className="text-[13px] text-slate-800">{t.content}</span>
                      </div>
                    ))}
                  </div>
                )}

                {(r.objections || []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {r.objections.map((o, i) => (
                      <span key={i} className="text-[11px] border border-slate-200 bg-white rounded px-1.5 py-0.5 text-slate-600">
                        {(o.objection_type || o).toString().replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </Panel>
        </div>
      </div>

      <Panel title="All interactions" bodyClassName="p-0">
        {interactions.length === 0 && <p className="p-4 text-xs text-slate-500">No interactions logged.</p>}
        {interactions.map((i) => (
          <div key={i.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0">
            <span className="text-[11px] uppercase tracking-wide text-slate-500 w-24 shrink-0">{(i.channel || '').replace(/_/g, ' ')}</span>
            <span className="text-[13px] text-slate-800 flex-1 min-w-0 truncate">{i.summary}</span>
            <span className="text-[11px] text-slate-500 shrink-0">{i.actor_name}</span>
            <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{timeOnly(i.started_at)}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

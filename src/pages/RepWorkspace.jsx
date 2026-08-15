import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import LeadQueue from '@/components/workspace/LeadQueue';
import OpenWith from '@/components/workspace/OpenWith';
import LeadSnapshot from '@/components/workspace/LeadSnapshot';
import DispositionForm from '@/components/workspace/DispositionForm';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { dialOne } from '@/lib/dialer';
import { useAuth } from '@/lib/AuthContext';

const OPEN_STAGES = ['mql', 'sql', 'opportunity'];
const SLA_RANK = { breached: 0, at_risk: 1, on_track: 2, met: 3 };

export default function RepWorkspace() {
  const [leads, setLeads] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [tab, setTab] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [callNotice, setCallNotice] = useState(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasCap } = useAuth();
  const canDial = hasCap('dial');

  useEffect(() => {
    Promise.all([
      base44.entities.Lead.list(null, 500),
      base44.entities.Seller.list(null, 500),
      base44.entities.AdPackage.list(),
      base44.entities.Interaction.list('-started_at', 500)
    ]).then(([l, s, p, i]) => { setLeads(l); setSellers(s); setPackages(p); setInteractions(i); });
  }, []);

  const queue = useMemo(() => {
    if (!leads) return [];
    let rows = leads.filter((l) => OPEN_STAGES.includes(l.stage));
    if (tab === 'a') rows = rows.filter((l) => l.pta_band === 'A');
    if (tab === 'sla') rows = rows.filter((l) => l.sla_status === 'breached' || l.sla_status === 'at_risk');
    if (tab === 'callback') rows = rows.filter((l) => l.agent_disposition === 'callback_requested' || l.meeting_status === 'rescheduled');
    return rows.sort((a, b) => {
      const r = (SLA_RANK[a.sla_status] ?? 4) - (SLA_RANK[b.sla_status] ?? 4);
      if (r) return r;
      return (b.pta_score || 0) - (a.pta_score || 0);
    });
  }, [leads, tab]);

  const selected = queue.find((l) => l.id === selectedId) || queue[0] || null;
  const seller = selected ? sellers.find((s) => s.id === selected.seller_id) : null;

  const pkg = useMemo(() => {
    if (!selected) return null;
    const budget = selected.budget_target || 0;
    const eligible = packages.filter((p) => budget >= (p.min_budget || 0) && budget <= (p.max_budget || Infinity));
    return (eligible.length ? eligible : packages).slice().sort((a, b) => (b.historical_close_rate || 0) - (a.historical_close_rate || 0))[0] || null;
  }, [selected, packages]);

  const lastInteraction = selected ? interactions.find((i) => i.lead_id === selected.id || i.seller_id === selected.seller_id) : null;

  if (!leads) return <div className="p-6 text-sm text-slate-500">Loading workspace…</div>;

  const logAndNext = async ({ outcome, objections, nextAction, notes }) => {
    if (!selected) return;
    setBusy(true);
    await base44.entities.Interaction.create({
      seller_id: selected.seller_id,
      seller_name: selected.seller_name,
      lead_id: selected.id,
      channel: 'voice_out',
      actor_type: 'human_rep',
      actor_name: selected.assigned_rep_name || 'Rep',
      direction: 'outbound',
      outcome,
      disposition: nextAction,
      summary: notes || outcome.replace(/_/g, ' '),
      objections,
      started_at: new Date().toISOString()
    });
    const patch = { agent_disposition: outcome, sla_status: 'met', last_agent_contact_at: new Date().toISOString() };
    if (nextAction === 'disqualify') patch.stage = 'disqualified';
    if (nextAction === 'add_to_nurture') patch.stage = 'nurture';
    if (nextAction === 'book_meeting') { patch.meeting_status = 'booked'; patch.meeting_booked_by = 'human'; }
    await base44.entities.Lead.update(selected.id, patch);

    const remaining = queue.filter((l) => l.id !== selected.id);
    setLeads((ls) => ls.map((l) => (l.id === selected.id ? { ...l, ...patch } : l)));
    setSelectedId(remaining[0] ? remaining[0].id : null);
    setBusy(false);
    toast({ title: 'Logged', description: `${selected.seller_name} · ${outcome.replace(/_/g, ' ')}` });
  };

  const handleCallNow = async () => {
    if (!selected) return;
    const result = await dialOne(selected.id);

    if (result.status === 'blocked') {
      setCallNotice({ kind: 'blocked', message: result.reason || 'Suppressed by policy' });
      return;
    }

    if (result.status === 'failed' || !result.agent_run_id) {
      setCallNotice({ kind: 'failed', message: result.error || 'Call failed' });
      toast({ title: 'Call failed', description: result.error || 'Unknown error', variant: 'destructive' });
      return;
    }

    setCallNotice(null);
    toast({ title: 'Call connected', description: `${selected.seller_name}` });
    navigate(`/sdr/calls/${result.agent_run_id}`);
  };

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-[35%_1fr] gap-4 items-start">
      <LeadQueue leads={queue} selectedId={selected && selected.id} onSelect={(l) => setSelectedId(l.id)} tab={tab} setTab={setTab} />

      {selected ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-base font-semibold text-slate-900">{selected.seller_name}</h1>
            <div className="flex items-center gap-2">
              {seller && <Link to={`/sellers/${seller.id}`} className="text-xs text-blue-800 hover:underline">Open Seller 360</Link>}
              {canDial && <Button size="sm" className="h-8 text-xs" onClick={handleCallNow}>Call now</Button>}
            </div>
          </div>
          {callNotice && callNotice.kind === 'blocked' && (
            <Alert className="border-amber-200 bg-amber-50 text-amber-900">
              <AlertDescription>{callNotice.message}</AlertDescription>
            </Alert>
          )}
          <OpenWith line={selected.suggested_opening_line} />
          <LeadSnapshot seller={seller} pkg={pkg} lastInteraction={lastInteraction} />
          <DispositionForm onLog={logAndNext} busy={busy} />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500">Queue is clear — nothing to work right now.</div>
      )}
    </div>
  );
}
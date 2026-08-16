import React, { useEffect, useMemo, useState } from 'react';
import { Phone } from 'lucide-react';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import SdrStatStrip from '@/components/sdr/SdrStatStrip';
import RunsTable from '@/components/sdr/RunsTable';
import QueueDepthCard from '@/components/sdr/QueueDepthCard';
import OutcomeDonut from '@/components/sdr/OutcomeDonut';
import TopObjections from '@/components/sdr/TopObjections';
import OpenEscalations from '@/components/sdr/OpenEscalations';
import BatchDialModal from '@/components/sdr/BatchDialModal';
import StartDialModal from '@/components/sdr/StartDialModal';
import { inrFull } from '@/lib/format';
import { dialSequentially } from '@/lib/dialer';
import { useAuth } from '@/lib/AuthContext';
import { useConfig } from '@/lib/ConfigContext';

const DAY = 86400000;

export default function SdrConsole() {
  const [runs, setRuns] = useState(null);
  const [leads, setLeads] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [dialOpen, setDialOpen] = useState(false);
  const { toast } = useToast();
  const { hasCap } = useAuth();
  const { usdToInr } = useConfig();
  const canDial = hasCap('dial');

  useEffect(() => {
    Promise.allSettled([
      api.entities.AgentRun.list('-started_at', 500),
      api.entities.Lead.list(null, 500)
    ]).then((settled) => {
      const [r, l] = settled.map((s) => (s.status === 'fulfilled' ? s.value : []));
      setRuns(r);
      setLeads(l);
    });
  }, []);

  const view = useMemo(() => {
    if (!runs) return null;
    const now = Date.now();
    const today = runs.filter((r) => r.started_at && now - new Date(r.started_at).getTime() < DAY);
    const week = runs.filter((r) => r.started_at && now - new Date(r.started_at).getTime() < 7 * DAY);

    const booked = today.filter((r) => r.outcome === 'meeting_booked').length;
    const costInr = usdToInr(today.reduce((a, r) => a + (r.cost_usd || 0), 0));

    // The live script is whichever variant the floor is actually dialling most
    // today, not a constant pinned in the source.
    const variantCounts = {};
    today.forEach((r) => { if (r.script_variant) variantCounts[r.script_variant] = (variantCounts[r.script_variant] || 0) + 1; });
    const variantsByUse = Object.entries(variantCounts).sort((a, b) => b[1] - a[1]);
    const allVariants = Array.from(new Set(runs.map((r) => r.script_variant).filter(Boolean)));

    // Projected next dial comes from the observed cadence between today's calls
    // rather than a fixed offset. With fewer than two calls there is no cadence
    // to measure, so it reports nothing instead of inventing a time.
    const starts = today.map((r) => new Date(r.started_at).getTime()).sort((a, b) => a - b);
    let nextDialAt = null;
    if (starts.length >= 2) {
      const gaps = starts.slice(1).map((t, i) => t - starts[i]).sort((a, b) => a - b);
      const medianGap = gaps[Math.floor(gaps.length / 2)];
      nextDialAt = new Date(starts[starts.length - 1] + medianGap);
    }

    const outcomeCounts = {};
    week.forEach((r) => { if (r.outcome) outcomeCounts[r.outcome] = (outcomeCounts[r.outcome] || 0) + 1; });

    const objCounts = {};
    week.forEach((r) => (r.objections || []).forEach((o) => {
      if (o.objection_type) objCounts[o.objection_type] = (objCounts[o.objection_type] || 0) + 1;
    }));

    const queueLeads = leads.filter((l) => ['mql', 'sql'].includes(l.stage) && (l.agent_attempts || 0) < 4);

    return {
      today,
      stats: {
        dials: today.length,
        connects: today.filter((r) => (r.duration_sec || 0) > 15).length,
        qualified: today.filter((r) => r.outcome === 'qualified' || r.outcome === 'meeting_booked').length,
        booked,
        escalated: today.filter((r) => r.outcome === 'escalated' || (r.escalation && r.escalation.triggered)).length,
        costPerMeeting: booked ? inrFull(costInr / booked) : '—'
      },
      depth: {
        A: queueLeads.filter((l) => l.pta_band === 'A').length,
        B: queueLeads.filter((l) => l.pta_band === 'B').length,
        C: queueLeads.filter((l) => l.pta_band === 'C').length
      },
      outcomes: Object.entries(outcomeCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      objections: Object.entries(objCounts).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count).slice(0, 6),
      escalations: runs.filter((r) => r.escalation && r.escalation.triggered && r.escalation.status === 'open').slice(0, 5),
      liveVariant: variantsByUse.length ? variantsByUse[0][0] : null,
      variantOptions: allVariants,
      nextDialAt
    };
  }, [runs, leads, usdToInr]);

  if (!view) return <div className="p-6 text-sm text-slate-500">Loading SDR console…</div>;

  // Meetings live on leads; the runs table resolves them through this map.
  const leadsById = Object.fromEntries(leads.map((l) => [l.id, l]));

  const nextDial = view.nextDialAt
    ? view.nextDialAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '—';

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-semibold text-slate-900">AI SDR Console</h1>
        {view.liveVariant && (
          <span className="text-[11px] uppercase tracking-wide text-slate-500 border border-slate-200 bg-white rounded px-2 py-1">
            Live script · {view.liveVariant}
          </span>
        )}
        {canDial ? (
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs bg-white" onClick={() => setDialOpen(true)}>
              <Phone className="w-3.5 h-3.5 mr-1.5" /> Start dial
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={() => setModalOpen(true)}>Start batch dial</Button>
          </div>
        ) : (
          <span className="ml-auto text-[11px] text-slate-500">Your role has view-only access to the calling floor</span>
        )}
      </div>

      <SdrStatStrip stats={view.stats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2"><RunsTable runs={view.today.length ? view.today : runs.slice(0, 40)} leadsById={leadsById} /></div>
        <div className="space-y-4">
          <QueueDepthCard depth={view.depth} nextDialAt={nextDial} />
          <OutcomeDonut data={view.outcomes} />
          <TopObjections items={view.objections} />
          <OpenEscalations runs={view.escalations} />
        </div>
      </div>

      <StartDialModal
        open={dialOpen}
        onOpenChange={setDialOpen}
        onPlaced={async (data) => {
          toast({ title: 'Call placed', description: `${data.phone} · ${data.provider === 'live' ? 'live call' : 'simulated'}` });
          setRuns(await api.entities.AgentRun.list('-started_at', 500));
        }}
      />

      <BatchDialModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        liveVariant={view.liveVariant}
        variantOptions={view.variantOptions}
        onDial={async ({ band, maxDials, variant }, onProgress) => {
          const rows = leads.filter((lead) => lead.pta_band === band && (lead.stage === 'mql' || lead.stage === 'sql'));
          const selected = rows.slice(0, maxDials || rows.length);
          const summary = await dialSequentially(selected, onProgress, { script_variant: variant });
          toast({ title: 'Batch dial complete', description: `${summary.text} · ${variant}` });
          // Reflect the new calls without a reload.
          setRuns(await api.entities.AgentRun.list('-started_at', 500));
          return summary;
        }}
      />
    </div>
  );
}
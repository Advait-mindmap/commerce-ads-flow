import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import SdrStatStrip from '@/components/sdr/SdrStatStrip';
import RunsTable from '@/components/sdr/RunsTable';
import QueueDepthCard from '@/components/sdr/QueueDepthCard';
import OutcomeDonut from '@/components/sdr/OutcomeDonut';
import TopObjections from '@/components/sdr/TopObjections';
import OpenEscalations from '@/components/sdr/OpenEscalations';
import BatchDialModal from '@/components/sdr/BatchDialModal';
import { inrFull } from '@/lib/format';
import { dialSequentially } from '@/lib/dialer';

const DAY = 86400000;
const LIVE_VARIANT = 'v3_signal_open';

export default function SdrConsole() {
  const [runs, setRuns] = useState(null);
  const [leads, setLeads] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      base44.entities.AgentRun.list('-started_at', 500),
      base44.entities.Lead.list(null, 500)
    ]).then(([r, l]) => { setRuns(r); setLeads(l); });
  }, []);

  const view = useMemo(() => {
    if (!runs) return null;
    const now = Date.now();
    const today = runs.filter((r) => r.started_at && now - new Date(r.started_at).getTime() < DAY);
    const week = runs.filter((r) => r.started_at && now - new Date(r.started_at).getTime() < 7 * DAY);

    const booked = today.filter((r) => r.outcome === 'meeting_booked').length;
    const costInr = today.reduce((a, r) => a + (r.cost_usd || 0), 0) * 83;

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
      escalations: runs.filter((r) => r.escalation && r.escalation.triggered && r.escalation.status === 'open').slice(0, 5)
    };
  }, [runs, leads]);

  if (!view) return <div className="p-6 text-sm text-slate-500">Loading SDR console…</div>;

  const nextDial = new Date(Date.now() + 4 * 60000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-semibold text-slate-900">AI SDR Console</h1>
        <span className="text-[11px] uppercase tracking-wide text-slate-500 border border-slate-200 bg-white rounded px-2 py-1">
          Live script · {LIVE_VARIANT}
        </span>
        <Button size="sm" className="ml-auto h-8 text-xs" onClick={() => setModalOpen(true)}>Start batch dial</Button>
      </div>

      <SdrStatStrip stats={view.stats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2"><RunsTable runs={view.today.length ? view.today : runs.slice(0, 40)} /></div>
        <div className="space-y-4">
          <QueueDepthCard depth={view.depth} nextDialAt={nextDial} />
          <OutcomeDonut data={view.outcomes} />
          <TopObjections items={view.objections} />
          <OpenEscalations runs={view.escalations} />
        </div>
      </div>

      <BatchDialModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        liveVariant={LIVE_VARIANT}
        onDial={async ({ band, maxDials, variant }, onProgress) => {
          const rows = leads.filter((lead) => lead.pta_band === band && (lead.stage === 'mql' || lead.stage === 'sql'));
          const selected = rows.slice(0, maxDials || rows.length);
          const summary = await dialSequentially(selected, onProgress);
          toast({ title: 'Batch dial complete', description: `${summary.text} · ${variant}` });
          return summary;
        }}
      />
    </div>
  );
}
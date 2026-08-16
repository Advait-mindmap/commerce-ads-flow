import React, { useEffect, useState } from 'react';
import { LayoutGrid, Table as TableIcon } from 'lucide-react';
import { api } from '@/api/client';
import { useToast } from '@/components/ui/use-toast';
import PipelineBoard from '@/components/pipeline/PipelineBoard';
import PipelineTable from '@/components/pipeline/PipelineTable';
import OpportunityDrawer from '@/components/pipeline/OpportunityDrawer';

export default function Pipeline() {
  const [opps, setOpps] = useState(null);
  const [leads, setLeads] = useState([]);
  const [packages, setPackages] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [view, setView] = useState('board');
  const [open, setOpen] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      api.entities.Opportunity.list('-created_date', 500),
      api.entities.AdPackage.list(),
      api.entities.Interaction.list('-started_at', 500),
      // Leads occupy the early columns; only those not yet converted.
      api.entities.Lead.list('-mql_at', 500)
    ]).then(([o, p, i, l]) => {
      setOpps(o);
      setPackages(p);
      setInteractions(i);
      setLeads((l || []).filter((x) => ['nurture', 'mql', 'sql'].includes(x.stage)));
    });
  }, []);

  if (!opps) return <div className="p-6 text-sm text-slate-500">Loading pipeline…</div>;

  const move = async (id, stage, reason) => {
    // A deal cannot go back to being a lead; say so rather than silently
    // dropping the card back where it came from.
    if (reason === 'no-downgrade') {
      return toast({
        title: 'Cannot move a deal back to a lead',
        description: 'The opportunity already holds a package and a value. Mark it lost instead.',
        variant: 'destructive'
      });
    }
    setOpps((rows) => rows.map((o) => (o.id === id ? { ...o, stage, days_in_stage: 0 } : o)));
    try {
      await api.entities.Opportunity.update(id, { stage, days_in_stage: 0 });
      const opp = opps.find((o) => o.id === id);
      toast({ title: 'Stage updated', description: `${opp ? opp.seller_name : 'Opportunity'} → ${stage}` });
    } catch (err) {
      setOpps(await api.entities.Opportunity.list('-created_date', 500));
      toast({ title: 'Could not move', description: err.message, variant: 'destructive' });
    }
  };

  /** Moves a lead between lead stages. */
  const moveLead = async (id, stage) => {
    const lead = leads.find((l) => l.id === id);
    setLeads((rows) => rows.map((l) => (l.id === id ? { ...l, stage } : l)));
    try {
      const patch = { stage };
      // Reaching SQL is a milestone the funnel reports on, so stamp it.
      if (stage === 'sql' && !lead?.sql_at) patch.sql_at = new Date().toISOString();
      await api.entities.Lead.update(id, patch);
      toast({ title: 'Lead moved', description: `${lead ? lead.seller_name : 'Lead'} → ${stage.toUpperCase()}` });
    } catch (err) {
      setLeads((rows) => rows.map((l) => (l.id === id ? { ...l, stage: lead?.stage } : l)));
      toast({ title: 'Could not move lead', description: err.message, variant: 'destructive' });
    }
  };

  /**
   * Converts a lead into an opportunity. This creates a deal record rather
   * than relabelling the lead, because everything downstream — value,
   * package, close probability — hangs off the opportunity.
   */
  const convert = async (id, stage) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    try {
      const pkg = packages[0] || null;
      const monthly = lead.budget_band_stated_value || pkg?.monthly_budget || 50000;
      const created = await api.entities.Opportunity.create({
        seller_id: lead.seller_id,
        seller_name: lead.seller_name,
        lead_id: lead.id,
        stage,
        package_name: pkg?.name || 'To be scoped',
        package_id: pkg?.id || null,
        monthly_budget: monthly,
        total_value: monthly * 3,
        close_probability: stage === 'proposed' ? 0.3 : 0.5,
        days_in_stage: 0,
        owner_name: lead.assigned_rep_name || null,
        created_from: 'pipeline_drag'
      });
      await api.entities.Lead.update(lead.id, { stage: 'opportunity', converted_at: new Date().toISOString() });

      setLeads((rows) => rows.filter((l) => l.id !== id));
      setOpps((rows) => [created, ...rows]);
      toast({ title: 'Converted to opportunity', description: `${lead.seller_name} → ${stage}` });
    } catch (err) {
      toast({ title: 'Could not convert', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-slate-900">Pipeline</h1>
        <div className="ml-auto flex border border-slate-200 rounded-lg overflow-hidden bg-white">
          {[{ k: 'board', I: LayoutGrid }, { k: 'table', I: TableIcon }].map(({ k, I }) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className={`px-3 py-1.5 text-xs flex items-center gap-1.5 ${view === k ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <I className="w-3.5 h-3.5" /> {k === 'board' ? 'Board' : 'Table'}
            </button>
          ))}
        </div>
      </div>

      {view === 'board'
        ? (
          <PipelineBoard
            opportunities={opps}
            leads={leads}
            onOpen={setOpen}
            onMove={move}
            onMoveLead={moveLead}
            onConvert={convert}
          />
        )
        : <PipelineTable opportunities={opps} onOpen={setOpen} />}

      <OpportunityDrawer opp={open} packages={packages} interactions={interactions} onOpenChange={(v) => !v && setOpen(null)} />
    </div>
  );
}
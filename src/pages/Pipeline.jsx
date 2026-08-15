import React, { useEffect, useState } from 'react';
import { LayoutGrid, Table as TableIcon } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import PipelineBoard from '@/components/pipeline/PipelineBoard';
import PipelineTable from '@/components/pipeline/PipelineTable';
import OpportunityDrawer from '@/components/pipeline/OpportunityDrawer';

export default function Pipeline() {
  const [opps, setOpps] = useState(null);
  const [packages, setPackages] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [view, setView] = useState('board');
  const [open, setOpen] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      base44.entities.Opportunity.list('-created_date', 500),
      base44.entities.AdPackage.list(),
      base44.entities.Interaction.list('-started_at', 500)
    ]).then(([o, p, i]) => { setOpps(o); setPackages(p); setInteractions(i); });
  }, []);

  if (!opps) return <div className="p-6 text-sm text-slate-500">Loading pipeline…</div>;

  const move = async (id, stage) => {
    setOpps((rows) => rows.map((o) => (o.id === id ? { ...o, stage, days_in_stage: 0 } : o)));
    await base44.entities.Opportunity.update(id, { stage, days_in_stage: 0 });
    const opp = opps.find((o) => o.id === id);
    toast({ title: 'Stage updated', description: `${opp ? opp.seller_name : 'Opportunity'} → ${stage}` });
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
        ? <PipelineBoard opportunities={opps} onOpen={setOpen} onMove={move} />
        : <PipelineTable opportunities={opps} onOpen={setOpen} />}

      <OpportunityDrawer opp={open} packages={packages} interactions={interactions} onOpenChange={(v) => !v && setOpen(null)} />
    </div>
  );
}
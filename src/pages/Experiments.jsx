import React, { useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import ExperimentCard from '@/components/experiments/ExperimentCard';
import NewExperimentDialog from '@/components/experiments/NewExperimentDialog';
import { CardGridSkeleton } from '@/components/common/Skeletons';
import EmptyState from '@/components/common/EmptyState';
import { useAuth } from '@/lib/AuthContext';
import { dateTime } from '@/lib/format';

const ORDER = ['acquisition', 'qualification', 'conversion', 'retention', 'expansion'];

export default function Experiments() {
  const [experiments, setExperiments] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const { toast } = useToast();
  const { hasCap, role } = useAuth();

  // Creating and concluding experiments is an approval-grade action.
  const canManage = hasCap('approve_optimization') || role === 'admin';

  const load = () => api.entities.Experiment.list('-started_at', 200).then(setExperiments);
  useEffect(() => { load(); }, []);

  const reanalyse = async () => {
    setAnalysing(true);
    try {
      const res = await api.functions.invoke('analyseExperiments');
      const data = res?.data || res;
      await load();
      toast({ title: 'Re-analysed', description: `${data.analysed} running experiment(s) recomputed from current records.` });
    } catch (err) {
      toast({ title: 'Analysis failed', description: err.message, variant: 'destructive' });
    } finally {
      setAnalysing(false);
    }
  };

  if (!experiments) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-base font-semibold text-slate-900">Experiments</h1>
        <CardGridSkeleton count={6} height={190} className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3" />
      </div>
    );
  }

  const stages = Array.from(new Set(experiments.map((e) => e.funnel_stage || 'other')))
    .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));

  const lastAnalysed = experiments.map((e) => e.analysed_at).filter(Boolean).sort().pop();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-base font-semibold text-slate-900">Experiments</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Arms and statistics are recomputed from live records
            {lastAnalysed ? ` · last analysed ${dateTime(lastAnalysed)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs bg-white" onClick={reanalyse} disabled={analysing}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${analysing ? 'animate-spin' : ''}`} />
            Re-analyse
          </Button>
          {canManage && (
            <Button size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> New experiment
            </Button>
          )}
        </div>
      </div>

      {stages.map((stage) => (
        <section key={stage}>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{String(stage).replace(/_/g, ' ')}</h2>
            <span className="text-[11px] text-slate-400 tabular-nums">
              {experiments.filter((e) => (e.funnel_stage || 'other') === stage).length}
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {experiments.filter((e) => (e.funnel_stage || 'other') === stage).map((e) => <ExperimentCard key={e.id} exp={e} />)}
          </div>
        </section>
      ))}

      {experiments.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-lg">
          <EmptyState
            message={canManage
              ? 'No experiments yet — create one to start measuring a change against a control.'
              : 'No experiments have been defined yet.'}
            actionLabel="Open models"
            to="/models"
          />
        </div>
      )}

      <NewExperimentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(created) => {
          load();
          toast({ title: 'Experiment created', description: `${created.name} is running and accruing units.` });
        }}
      />
    </div>
  );
}

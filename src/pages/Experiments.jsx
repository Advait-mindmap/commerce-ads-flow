import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import ExperimentCard from '@/components/experiments/ExperimentCard';
import { CardGridSkeleton } from '@/components/common/Skeletons';
import EmptyState from '@/components/common/EmptyState';

const ORDER = ['acquisition', 'qualification', 'conversion', 'retention', 'expansion'];

export default function Experiments() {
  const [experiments, setExperiments] = useState(null);

  useEffect(() => { base44.entities.Experiment.list('-started_at', 200).then(setExperiments); }, []);

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

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-base font-semibold text-slate-900">Experiments</h1>
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
          <EmptyState message="No experiments have been defined yet." actionLabel="Open models" to="/models" />
        </div>
      )}
    </div>
  );
}
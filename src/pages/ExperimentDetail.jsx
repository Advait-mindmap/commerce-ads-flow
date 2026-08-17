import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/api/client';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import { PanelSkeleton } from '@/components/common/Skeletons';
import ArmTable from '@/components/experiments/ArmTable';
import LiftRangeBar from '@/components/experiments/LiftRangeBar';
import StatsGrid from '@/components/experiments/StatsGrid';
import GuardrailsTable from '@/components/experiments/GuardrailsTable';
import DecisionLog from '@/components/experiments/DecisionLog';
import LogCasePanel from '@/components/experiments/LogCasePanel';
import { useToast } from '@/components/ui/use-toast';
import { dateOnly } from '@/lib/format';

export default function ExperimentDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [logging, setLogging] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const exp = await api.entities.Experiment.get(id);
      const logs = await api.entities.AuditLog.filter({ entity_type: 'Experiment', entity_id: id }, '-timestamp', 50);
      setData({ exp, logs });
    })();
  }, [id]);

  if (!data) {
    return (
      <div className="p-6 space-y-4">
        <PanelSkeleton height={72} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <PanelSkeleton height={320} />
          <PanelSkeleton height={320} />
        </div>
        <PanelSkeleton height={200} />
      </div>
    );
  }
  const { exp, logs } = data;

  // Rendered from the experiment's own guardrail rows and stop date rather than
  // a banner hardcoded to one experiment key.
  const breached = (exp.guardrails || []).filter((g) => g.breach);

  return (
    <div className="p-6 space-y-4">
      <Breadcrumbs parent="Experiments" parentTo="/experiments" current={exp.name} />

      {exp.status === 'stopped_guardrail' && (
        <div className="rounded-lg px-4 py-3 text-[13px] text-red-800" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
          Auto-stopped{exp.ended_at ? ` ${dateOnly(exp.ended_at)}` : ''}
          {breached.length > 0 && (
            <> — guardrail breach on {breached.map((g) => `${(g.metric || '').replace(/_/g, ' ')} (${g.control} → ${g.treatment}, p=${g.p_value})`).join('; ')}</>
          )}
          {breached.length === 0 && ' on a guardrail metric'}
        </div>
      )}

      <div>
        <h1 className="text-base font-semibold text-slate-900">{exp.name}</h1>
        <p className="text-xs text-slate-500 mt-1">{exp.hypothesis}</p>
        <div className="text-[11px] text-slate-500 mt-1.5 tabular-nums">
          {exp.experiment_key} · {(exp.status || '').replace(/_/g, ' ')} · {exp.unit_type} unit · primary metric {(exp.primary_metric || '').replace(/_/g, ' ')} · required n {(exp.required_n_per_arm || 0).toLocaleString('en-IN')} per arm
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="space-y-4">
          <ArmTable arms={exp.arms} />
          <LiftRangeBar low={exp.ci_low} high={exp.ci_high} point={exp.relative_lift} />
        </div>
        <StatsGrid exp={exp} />
      </div>

      {/* Logging a case re-runs the analysis, so the arms and the lift above
          move with it rather than needing a separate refresh. */}
      <LogCasePanel
        exp={exp}
        busy={logging}
        onLog={async (payload) => {
          setLogging(true);
          try {
            const res = await api.functions.invoke('logExperimentObservation', { experiment_id: exp.id, ...payload });
            const body = res?.data || res;
            if (body?.error) throw new Error(body.error);
            setData((d) => ({ ...d, exp: body.experiment }));
            toast({
              title: 'Case logged',
              description: `${body.observation.arm} · ${body.observation.converted ? 'converted' : 'did not convert'} · ${body.logged_cases} logged in total`
            });
          } finally {
            setLogging(false);
          }
        }}
      />

      <GuardrailsTable guardrails={exp.guardrails} />
      <DecisionLog exp={exp} logs={logs} />
    </div>
  );
}
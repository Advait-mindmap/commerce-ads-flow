import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import { PanelSkeleton } from '@/components/common/Skeletons';
import { logAudit } from '@/lib/audit';
import CallMetaCard from '@/components/call/CallMetaCard';
import WhyWeCalled from '@/components/call/WhyWeCalled';
import TranscriptViewer from '@/components/call/TranscriptViewer';
import QualificationCard from '@/components/call/QualificationCard';
import ObjectionsCard from '@/components/call/ObjectionsCard';
import CallAnalyticsCard from '@/components/call/CallAnalyticsCard';
import NextActionCard from '@/components/call/NextActionCard';

export default function CallDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [run, setRun] = useState(null);
  const [seller, setSeller] = useState(null);
  const [contact, setContact] = useState(null);
  const [lead, setLead] = useState(null);
  const [busy, setBusy] = useState(false);

  const [visibleCount, setVisibleCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [now, setNow] = useState(Date.now());
  const timerRef = useRef(null);

  const load = async () => {
    const r = await base44.entities.AgentRun.get(id);
    setRun(r);
    setVisibleCount((r.transcript || []).length);
    if (r.seller_id) setSeller(await base44.entities.Seller.get(r.seller_id).catch(() => null));
    if (r.lead_id) setLead(await base44.entities.Lead.get(r.lead_id).catch(() => null));
    if (r.seller_id) {
      const cs = await base44.entities.Contact.filter({ seller_id: r.seller_id });
      setContact(cs.find((c) => c.is_primary) || cs[0] || null);
    }
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (!run || !['queued', 'in_progress'].includes(run.status)) return undefined;
    const idTimer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(idTimer);
  }, [run, run?.status]);

  useEffect(() => {
    if (!run || !['queued', 'in_progress'].includes(run.status)) return undefined;
    const started = new Date(run.started_at || Date.now()).getTime();
    const deadline = started + 10 * 60 * 1000;
    const poller = setInterval(async () => {
      const fresh = await base44.entities.AgentRun.get(id).catch(() => null);
      if (!fresh) return;
      setRun(fresh);
      const nextStatus = fresh.status || fresh.outcome || 'unknown';
      if (!['queued', 'in_progress'].includes(nextStatus) || Date.now() >= deadline) {
        clearInterval(poller);
      }
    }, 5000);
    return () => clearInterval(poller);
  }, [id, run?.status]);

  const turns = (run && run.transcript) || [];
  const liveDurationSec = run && ['queued', 'in_progress'].includes(run.status) && run.started_at
    ? Math.max(0, Math.round((now - new Date(run.started_at).getTime()) / 1000))
    : (run && run.duration_sec) || 0;

  useEffect(() => {
    clearInterval(timerRef.current);
    if (!playing) return;
    timerRef.current = setInterval(() => {
      setVisibleCount((c) => {
        if (c >= turns.length) { setPlaying(false); return c; }
        return c + 1;
      });
    }, 1400 / speed);
    return () => clearInterval(timerRef.current);
  }, [playing, speed, turns.length]);

  if (!run) {
    return (
      <div className="p-6 grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        <PanelSkeleton height={280} />
        <div className="lg:col-span-2"><PanelSkeleton height={520} /></div>
        <PanelSkeleton height={420} />
      </div>
    );
  }

  const togglePlay = () => {
    if (!playing) setVisibleCount(visibleCount >= turns.length ? 0 : visibleCount);
    setPlaying(!playing);
  };

  const pullLatest = async () => {
    setBusy(true);
    toast({ title: 'Pulling latest transcript…' });
    const res = await base44.functions.invoke('bolnaFetchTranscript', { agent_run_id: run.id }).catch((e) => ({ data: { error: e.message } }));
    const data = res && res.data ? res.data : res;
    setBusy(false);
    if (data && data.error) return toast({ title: 'Could not pull transcript', description: data.error, variant: 'destructive' });
    await load();
    toast({ title: 'Transcript updated', description: `${(data.transcript || []).length} turns retrieved.` });
  };

  const extract = async () => {
    setBusy(true);
    toast({ title: 'Extracting qualification…' });
    const res = await base44.functions.invoke('extractQualification', { agent_run_id: run.id }).catch((e) => ({ data: { error: e.message } }));
    const data = res && res.data ? res.data : res;
    setBusy(false);
    if (data && data.error) return toast({ title: 'Extraction failed', description: data.error, variant: 'destructive' });
    await load();
    await logAudit({
      action: 'qualification_extracted',
      entity_type: 'AgentRun',
      entity_id: run.id,
      entity_name: run.seller_name,
      summary: data.qualified ? 'AI extraction marked the lead qualified' : 'AI extraction marked the lead not qualified'
    });
    toast({ title: 'Qualification extracted', description: data.qualified ? 'Lead qualified.' : 'Lead not qualified.' });
  };

  const saveField = async (key, value) => {
    const before = (run.qualification || {})[key];
    const qualification = { ...(run.qualification || {}), [key]: value };
    setRun({ ...run, qualification });
    await base44.entities.AgentRun.update(run.id, { qualification });
    await logAudit({
      action: 'qualification_field_edited',
      entity_type: 'AgentRun',
      entity_id: run.id,
      entity_name: run.seller_name,
      summary: `Rep edited ${key.replace(/_/g, ' ')}`,
      before_value: before,
      after_value: value
    });
    toast({ title: 'Qualification saved', description: key.replace(/_/g, ' ') });
  };

  const reveal = playing || visibleCount < turns.length ? (turns.length ? visibleCount / turns.length : 1) : null;

  return (
    <div className="p-6 space-y-4">
      <Breadcrumbs parent="AI SDR Console" parentTo="/sdr" current={`${run.seller_name || 'Call'} · ${(run.outcome || run.status || '').replace(/_/g, ' ')}`} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        <div className="space-y-4">
          <CallMetaCard run={{ ...run, duration_sec: liveDurationSec }} seller={seller} contact={contact} />
          <WhyWeCalled reasons={(seller && seller.pta_reasons) || (lead && lead.pta_reasons)} />
        </div>

        <div className="lg:col-span-2">
          <TranscriptViewer
            turns={turns}
            guardrails={run.guardrail_events}
            visibleCount={visibleCount}
            playing={playing}
            speed={speed}
            busy={busy}
            onTogglePlay={togglePlay}
            onSpeedToggle={() => setSpeed((s) => (s === 1 ? 2 : 1))}
            onSkipEnd={() => { setPlaying(false); setVisibleCount(turns.length); }}
            onFetchLatest={pullLatest}
            onExtract={extract}
          />
        </div>

        <div className="space-y-4">
          <QualificationCard qualification={run.qualification} reveal={reveal} onFieldSave={saveField} />
          <ObjectionsCard objections={run.objections} />
          <CallAnalyticsCard run={run} />
          <NextActionCard
            run={run}
            lead={lead}
            onAssign={async () => {
              await logAudit({
                action: 'escalation_assigned',
                entity_type: 'AgentRun',
                entity_id: run.id,
                entity_name: run.seller_name,
                summary: `Escalation assigned to ${(run.escalation && run.escalation.assigned_rep) || 'next available rep'}`
              });
              toast({ title: 'Escalation assigned', description: (run.escalation && run.escalation.assigned_rep) || 'Next available rep' });
            }}
          />
        </div>
      </div>
    </div>
  );
}
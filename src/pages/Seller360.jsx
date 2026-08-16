import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/api/client';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import { logAudit } from '@/lib/audit';
import { PanelSkeleton } from '@/components/common/Skeletons';
import SellerHeader from '@/components/seller/SellerHeader';
import OverviewTab from '@/components/seller/OverviewTab';
import TrafficTab from '@/components/seller/TrafficTab';
import AdHistoryTab from '@/components/seller/AdHistoryTab';
import InteractionsTab from '@/components/seller/InteractionsTab';
import SignalsTab from '@/components/seller/SignalsTab';
import ExperimentsTab from '@/components/seller/ExperimentsTab';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { dialOne } from '@/lib/dialer';
import { useAuth } from '@/lib/AuthContext';

const TABS = [
  ['overview', 'Overview'],
  ['traffic', 'Traffic & Catalog'],
  ['ads', 'Ad History'],
  ['interactions', 'Interactions'],
  ['signals', 'Signals'],
  ['experiments', 'Experiments']
];

export default function Seller360() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasCap, user } = useAuth();
  const [data, setData] = useState(null);
  const [callNotice, setCallNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const seller = await api.entities.Seller.get(id);
      // Roles reach this screen with different grants (SDR and Compliance cannot
      // read Experiments or ModelVersions), so a denied slice degrades to an
      // empty tab instead of hanging the whole profile on its skeleton.
      const settled = await Promise.allSettled([
        api.entities.Campaign.filter({ seller_id: id }),
        api.entities.Interaction.filter({ seller_id: id }, '-started_at', 100),
        api.entities.Lead.filter({ seller_id: id }),
        api.entities.Experiment.list(),
        api.entities.ModelVersion.filter({ model_key: 'pta' }),
        api.entities.Seller.filter({ category: seller.category }, null, 200)
      ]);
      const [campaigns, interactions, leads, experiments, models, peers] =
        settled.map((s) => (s.status === 'fulfilled' ? s.value : []));
      const sovs = peers.map((p) => p.category_sov || 0).sort((a, b) => a - b);
      setData({
        seller,
        campaigns,
        interactions,
        leads,
        experiments,
        model: models.find((m) => m.status === 'champion') || models[0] || null,
        medianSov: sovs.length ? sovs[Math.floor(sovs.length / 2)] : null
      });
    })();
  }, [id]);

  if (!data) {
    return (
      <div className="p-6 space-y-4">
        <PanelSkeleton height={104} />
        <PanelSkeleton height={36} />
        <PanelSkeleton height={320} />
      </div>
    );
  }

  const { seller, campaigns, interactions, leads, experiments, model, medianSov } = data;
  const assignments = (leads.find((l) => l.experiment_assignments) || {}).experiment_assignments;

  /**
   * Every action on this screen hangs off a Lead. A seller with none yet needs
   * a real one created first — the previous synthetic `${seller.id}-call` id
   * does not exist server-side, so the dial 404'd against it.
   */
  const ensureLead = async () => {
    const existing = (leads || []).find((l) => l.seller_id === seller.id);
    if (existing) return existing;

    const created = await api.entities.Lead.create({
      seller_id: seller.id,
      seller_name: seller.display_name,
      category: seller.category,
      source: 'manual_seller_360',
      mql_trigger: `Rep initiated contact from Seller 360 — PTA band ${seller.pta_band}`,
      mql_at: new Date().toISOString(),
      stage: 'mql',
      pta_band: seller.pta_band,
      pta_score: seller.pta_score,
      pta_reasons: seller.pta_reasons,
      budget_target: seller.budget_target,
      contact_phone: seller.contact_phone,
      suppression_status: 'none',
      agent_attempts: 0,
      sla_status: 'on_track'
    });
    setData((d) => ({ ...d, leads: [...(d.leads || []), created] }));
    return created;
  };

  const handleCallNow = async () => {
    const lead = await ensureLead();
    const result = await dialOne(lead.id);

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
    toast({ title: 'Call connected', description: `Lead ${result.lead_id}` });
    navigate(`/sdr/calls/${result.agent_run_id}`);
  };

  return (
    <div className="p-6 space-y-4">
      <Breadcrumbs parent="Sellers" parentTo="/sellers" current={seller.display_name} />
      <SellerHeader
        seller={seller}
        busy={busy}
        onAction={async (action, member) => {
          setBusy(true);
          try {
            const lead = await ensureLead();

            if (action === 'sequence') {
              await api.entities.Sequence.create({
                seller_id: seller.id,
                seller_name: seller.display_name,
                lead_id: lead.id,
                sequence_type: 'nurture',
                channel: 'whatsapp',
                step_number: 1,
                total_steps: 4,
                status: 'active',
                next_send_at: new Date(Date.now() + 86400000).toISOString()
              });
              await logAudit({
                action: 'lead_added_to_sequence',
                entity_type: 'Seller',
                entity_id: seller.id,
                entity_name: seller.display_name,
                summary: 'Enrolled in a 4-step WhatsApp nurture sequence from Seller 360'
              });
              toast({ title: 'Added to sequence', description: `${seller.display_name} · 4-step WhatsApp nurture` });
            }

            if (action === 'assign') {
              // Any team member can own this, not only the signed-in user.
              const assignee = member || { name: user?.full_name || user?.email, id: user?.id };
              const repName = assignee.name;
              await api.entities.Lead.update(lead.id, { assigned_rep_name: repName, assigned_rep_id: assignee.id });
              await logAudit({
                action: 'lead_assigned',
                entity_type: 'Seller',
                entity_id: seller.id,
                entity_name: seller.display_name,
                summary: `Assigned to ${repName} from Seller 360`,
                before_value: lead.assigned_rep_name,
                after_value: repName
              });
              toast({ title: 'Assigned', description: `${seller.display_name} → ${repName}` });
            }
          } catch (err) {
            toast({ title: 'Action failed', description: err.message, variant: 'destructive' });
          } finally {
            setBusy(false);
          }
        }}
        onCallNow={handleCallNow}
        callNotice={callNotice}
        canDial={hasCap('dial')}
        assignedTo={(data.leads || []).find((l) => l.assigned_rep_name)?.assigned_rep_name || null}
      />
      {callNotice && callNotice.kind === 'blocked' && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <AlertDescription>{callNotice.message}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="bg-white border border-slate-200 h-9">
          {TABS.map(([k, label]) => (
            <TabsTrigger key={k} value={k} className="text-xs data-[state=active]:bg-slate-100">{label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-4"><OverviewTab seller={seller} model={model} /></TabsContent>
        <TabsContent value="traffic" className="mt-4"><TrafficTab seller={seller} categoryMedianSov={medianSov} /></TabsContent>
        <TabsContent value="ads" className="mt-4"><AdHistoryTab campaigns={campaigns} seller={seller} /></TabsContent>
        <TabsContent value="interactions" className="mt-4"><InteractionsTab interactions={interactions} /></TabsContent>
        <TabsContent value="signals" className="mt-4"><SignalsTab signals={seller.signals} /></TabsContent>
        <TabsContent value="experiments" className="mt-4"><ExperimentsTab assignments={assignments} experiments={experiments} /></TabsContent>
      </Tabs>
    </div>
  );
}
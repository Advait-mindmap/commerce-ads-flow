import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
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
  const { hasCap } = useAuth();
  const [data, setData] = useState(null);
  const [callNotice, setCallNotice] = useState(null);

  useEffect(() => {
    (async () => {
      const seller = await base44.entities.Seller.get(id);
      // Roles reach this screen with different grants (SDR and Compliance cannot
      // read Experiments or ModelVersions), so a denied slice degrades to an
      // empty tab instead of hanging the whole profile on its skeleton.
      const settled = await Promise.allSettled([
        base44.entities.Campaign.filter({ seller_id: id }),
        base44.entities.Interaction.filter({ seller_id: id }, '-started_at', 100),
        base44.entities.Lead.filter({ seller_id: id }),
        base44.entities.Experiment.list(),
        base44.entities.ModelVersion.filter({ model_key: 'pta' }),
        base44.entities.Seller.filter({ category: seller.category }, null, 200)
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

  const handleCallNow = async () => {
    const matches = (leads || []).filter((lead) => lead.seller_id === seller.id);
    const lead = matches[0] || { id: `${seller.id}-call`, seller_id: seller.id, seller_name: seller.display_name };
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
        onAction={async (msg) => {
          await logAudit({
            action: msg.toLowerCase().replace(/\s+/g, '_'),
            entity_type: 'Seller',
            entity_id: seller.id,
            entity_name: seller.display_name,
            summary: `${msg} from Seller 360`
          });
          toast({ title: msg, description: seller.display_name });
        }}
        onCallNow={handleCallNow}
        callNotice={callNotice}
        canDial={hasCap('dial')}
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
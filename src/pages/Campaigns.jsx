import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@/api/client';
import { useToast } from '@/components/ui/use-toast';
import FilterChips from '@/components/campaigns/FilterChips';
import CampaignTable from '@/components/campaigns/CampaignTable';
import ExportCsvButton from '@/components/common/ExportCsvButton';
import { TableSkeleton } from '@/components/common/Skeletons';
import { logAudit } from '@/lib/audit';
import { useAuth } from '@/lib/AuthContext';

const CSV_COLUMNS = [
  { key: 'seller_name', label: 'Seller' },
  { key: 'campaign_type', label: 'Type' },
  { key: 'status', label: 'Status' },
  { key: 'monthly_budget', label: 'Monthly budget' },
  { key: 'spend_30d', label: 'Spend 30d' },
  { key: 'roas_30d', label: 'ROAS 30d' },
  { key: 'conversions_30d', label: 'Conversions 30d' },
  { key: 'revenue_30d', label: 'Revenue 30d' },
  { key: 'budget_utilization', label: 'Budget utilisation' },
  { key: 'churn_band', label: 'Churn band' }
];

const isPending = (a) => !a.status || a.status === 'pending' || a.status === 'proposed';

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState(null);
  const [filters, setFilters] = useState({ status: [], bands: [], pendingOnly: false });
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const { hasCap } = useAuth();
  const canDecide = hasCap('approve_optimization');

  useEffect(() => {
    api.entities.Campaign.list('-spend_30d', 500).then(setCampaigns);
  }, []);

  const rows = useMemo(() => {
    if (!campaigns) return [];
    return campaigns.filter((c) => {
      if (filters.status.length && !filters.status.includes(c.status)) return false;
      if (filters.bands.length && !filters.bands.includes(c.churn_band)) return false;
      if (filters.pendingOnly && !(c.optimization_actions || []).some(isPending)) return false;
      return true;
    });
  }, [campaigns, filters]);

  if (!campaigns) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-base font-semibold text-slate-900">Campaigns</h1>
        <TableSkeleton rows={10} columns={11} />
      </div>
    );
  }

  const decide = async (campaign, index, status) => {
    setBusy(true);
    const actions = (campaign.optimization_actions || []).map((a, i) => (i === index ? { ...a, status } : a));
    const action = actions[index];
    await api.entities.Campaign.update(campaign.id, { optimization_actions: actions });
    await logAudit({
      action: `optimization_action_${status}`,
      entity_type: 'Campaign',
      entity_id: campaign.id,
      entity_name: campaign.seller_name,
      summary: `${(action.action_type || '').replace(/_/g, ' ')} on ${action.target}`,
      before_value: action.current_value,
      after_value: status === 'approved' ? action.recommended_value : action.current_value
    });
    setCampaigns((cs) => cs.map((c) => (c.id === campaign.id ? { ...c, optimization_actions: actions } : c)));
    setBusy(false);
    toast({ title: status === 'approved' ? 'Recommendation approved' : 'Recommendation rejected', description: `${campaign.seller_name} · ${action.target}` });
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold text-slate-900">Campaigns</h1>
        <ExportCsvButton filename="campaigns" columns={CSV_COLUMNS} rows={rows} />
      </div>
      <FilterChips filters={filters} setFilters={setFilters} shown={rows.length} total={campaigns.length} />
      <CampaignTable campaigns={rows} onDecide={decide} busy={busy} canDecide={canDecide} />
    </div>
  );
}
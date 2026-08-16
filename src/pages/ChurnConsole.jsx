import React, { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useToast } from '@/components/ui/use-toast';
import KpiTile from '@/components/command/KpiTile';
import ChurnTable from '@/components/churn/ChurnTable';
import ExportCsvButton from '@/components/common/ExportCsvButton';
import { CardGridSkeleton, TableSkeleton } from '@/components/common/Skeletons';
import { logAudit } from '@/lib/audit';
import { inr } from '@/lib/format';

const CSV_COLUMNS = [
  { key: 'seller_name', label: 'Seller' },
  { key: 'campaign_type', label: 'Type' },
  { key: 'monthly_budget', label: 'Monthly budget' },
  { key: 'roas_30d', label: 'ROAS 30d' },
  { key: 'roas_vs_promised', label: 'ROAS vs promised' },
  { key: 'budget_utilization', label: 'Budget utilisation' },
  { key: 'days_since_rep_contact', label: 'Days since rep contact' },
  { key: 'churn_p30', label: 'Churn P30' },
  { key: 'churn_band', label: 'Churn band' }
];

const WEEK = 7 * 86400000;

export default function ChurnConsole() {
  const [campaigns, setCampaigns] = useState(null);
  const [interventions, setInterventions] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      api.entities.Campaign.list(null, 500),
      api.entities.Interaction.list('-started_at', 500)
    ]).then(([c, i]) => {
      setCampaigns(c);
      const since = Date.now() - WEEK;
      setInterventions(i.filter((x) => x.started_at && new Date(x.started_at).getTime() > since && x.actor_type === 'human_rep').length);
    });
  }, []);

  if (!campaigns) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-base font-semibold text-slate-900">Churn Console</h1>
        <CardGridSkeleton count={4} height={84} className="grid grid-cols-2 xl:grid-cols-4 gap-3" />
        <TableSkeleton rows={10} columns={10} />
      </div>
    );
  }

  const red = campaigns.filter((c) => c.churn_band === 'RED');
  const amber = campaigns.filter((c) => c.churn_band === 'AMBER');
  const atRisk = [...red, ...amber].reduce((a, c) => a + (c.monthly_budget || 0), 0);
  const rows = campaigns.slice().sort((a, b) => (b.churn_p30 || 0) - (a.churn_p30 || 0));

  const assign = async (c, member) => {
    try {
      /*
       * Write the owner onto the campaign, and record the check-in the card
       * recommends. Previously this only wrote an audit line, so the
       * intervention had no owner and nothing to do — the button reported work
       * that did not exist.
       */
      const dueAt = new Date(Date.now() + 48 * 3600000).toISOString();
      await api.entities.Campaign.update(c.id, {
        assigned_rep_name: member.name,
        assigned_rep_id: member.id,
        intervention_status: 'assigned',
        intervention_due_at: dueAt
      });

      await api.entities.Interaction.create({
        seller_id: c.seller_id,
        seller_name: c.seller_name,
        campaign_id: c.id,
        channel: 'task',
        actor_type: 'human',
        actor_name: member.name,
        direction: 'internal',
        outcome: 'scheduled',
        disposition: 'retention_check_in',
        summary: `Retention check-in due within 48 hours — ${c.churn_band} band, ROAS ${c.roas ?? '—'}`,
        started_at: new Date().toISOString(),
        due_at: dueAt
      });

      await logAudit({
        action: 'churn_intervention_assigned',
        entity_type: 'Campaign',
        entity_id: c.id,
        entity_name: c.seller_name,
        summary: `Intervention assigned to ${member.name} for ${c.churn_band} band campaign, due in 48 hours`
      });

      setCampaigns((list) => list.map((x) => (
        x.id === c.id ? { ...x, assigned_rep_name: member.name, assigned_rep_id: member.id, intervention_status: 'assigned' } : x
      )));
      setInterventions((n) => n + 1);
      toast({ title: `Assigned to ${member.name}`, description: `${c.seller_name} · check-in due in 48 hours` });
    } catch (err) {
      toast({ title: 'Could not assign', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold text-slate-900">Churn Console</h1>
        <ExportCsvButton filename="churn-risk" columns={CSV_COLUMNS} rows={rows} />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiTile label="RED campaigns" value={red.length} subtext="churn P30 critical" danger={red.length > 0} />
        <KpiTile label="AMBER campaigns" value={amber.length} subtext="watchlist" />
        <KpiTile label="Revenue at risk" value={inr(atRisk)} subtext="monthly budget, RED + AMBER" />
        <KpiTile label="Interventions this week" value={interventions} subtext="rep-led touches" />
      </div>

      <ChurnTable campaigns={rows} onAssign={assign} />
    </div>
  );
}
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import KpiTile from '@/components/command/KpiTile';
import FunnelBar from '@/components/command/FunnelBar';
import PipelineByStage from '@/components/command/PipelineByStage';
import SdrToday from '@/components/command/SdrToday';
import TopSignals from '@/components/command/TopSignals';
import AttentionRequired from '@/components/command/AttentionRequired';
import DateRangeSelector from '@/components/command/DateRangeSelector';
import { CardGridSkeleton, PanelSkeleton } from '@/components/common/Skeletons';
import { inr } from '@/lib/format';

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
const DAY = 86400000;

export default function CommandCenter() {
  const [data, setData] = useState(null);
  const [range, setRange] = useState({ preset: 30, from: '', to: '' });

  useEffect(() => {
    (async () => {
      // allSettled, not all: a role without read access to one slice should see
      // that slice empty, not leave the whole dashboard stuck on skeletons.
      const settled = await Promise.allSettled([
        base44.entities.Seller.list(null, 500),
        base44.entities.Lead.list(null, 500),
        base44.entities.Opportunity.list(null, 500),
        base44.entities.Campaign.list(null, 500),
        base44.entities.AgentRun.list('-started_at', 500)
      ]);
      const [sellers, leads, opportunities, campaigns, runs] = settled.map((s) => (s.status === 'fulfilled' ? s.value : []));
      setData({ sellers, leads, opportunities, campaigns, runs });
    })();
  }, []);

  if (!data) {
    return (
      <div className="p-6 space-y-4">
        <CardGridSkeleton count={6} height={84} className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3" />
        <PanelSkeleton height={96} />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3"><PanelSkeleton height={260} /></div>
          <div className="lg:col-span-2"><PanelSkeleton height={260} /></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PanelSkeleton height={240} />
          <PanelSkeleton height={240} />
        </div>
      </div>
    );
  }

  const { sellers, leads, opportunities, campaigns, runs } = data;
  const now = Date.now();

  const windowFrom = range.preset === 'custom'
    ? (range.from ? new Date(range.from).getTime() : 0)
    : now - range.preset * DAY;
  const windowTo = range.preset === 'custom' && range.to ? new Date(range.to).getTime() + DAY : now;
  const inWindow = (iso) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= windowFrom && t <= windowTo;
  };
  const rangeLabel = range.preset === 'custom' ? 'selected range' : `last ${range.preset} days`;

  const advertising = sellers.filter((s) => s.ever_advertised).length;
  const penetration = sellers.length ? Math.round((advertising / sellers.length) * 100) : 0;

  const openOpps = opportunities.filter((o) => ['proposed', 'negotiating', 'verbal'].includes(o.stage));
  const pipelineValue = openOpps.reduce((a, o) => a + (o.total_value || 0), 0);

  const liveCampaigns = campaigns.filter((c) => c.status === 'live');
  const adRevenue = liveCampaigns.reduce((a, c) => a + (c.spend_30d || 0), 0);
  const momSlope = liveCampaigns.reduce((a, c) => a + (c.roas_trend_slope || 0), 0);
  const mom = liveCampaigns.length ? (momSlope / liveCampaigns.length) * 100 : 0;

  const meetings = leads.filter((l) => l.meeting_status && l.meeting_status !== 'none' && inWindow(l.meeting_scheduled_at || l.mql_at));
  const meetingsByAi = meetings.filter((l) => l.meeting_booked_by === 'agent').length;

  const slaBreaches = leads.filter((l) => l.sla_status === 'breached').length;

  const funnelSteps = [
    { label: 'Sellers', count: sellers.length, to: '/sellers' },
    { label: 'MQL', count: leads.filter((l) => inWindow(l.mql_at)).length, to: '/mql' },
    { label: 'SQL', count: leads.filter((l) => inWindow(l.sql_at)).length, to: '/sdr' },
    { label: 'Opportunity', count: opportunities.length, to: '/pipeline' },
    { label: 'Won', count: opportunities.filter((o) => o.stage === 'won').length, to: '/pipeline' },
    { label: 'Retained', count: liveCampaigns.filter((c) => c.churn_band === 'GREEN' || c.churn_band === 'YELLOW').length, to: '/campaigns' }
  ];

  const todayRuns = runs.filter((r) => inWindow(r.started_at));
  const sdrStats = {
    dials: todayRuns.length,
    connects: todayRuns.filter((r) => (r.duration_sec || 0) > 15).length,
    qualified: todayRuns.filter((r) => r.outcome === 'qualified' || r.outcome === 'meeting_booked').length,
    booked: todayRuns.filter((r) => r.outcome === 'meeting_booked').length,
    escalated: todayRuns.filter((r) => r.outcome === 'escalated' || (r.escalation && r.escalation.triggered)).length,
    costInr: todayRuns.reduce((a, r) => a + (r.cost_usd || 0), 0) * 83
  };

  const weeklyBooked = Array.from({ length: 7 }, (_, i) => {
    const from = now - (6 - i + 1) * DAY;
    const to = now - (6 - i) * DAY;
    return runs.filter((r) => {
      if (r.outcome !== 'meeting_booked' || !r.started_at) return false;
      const t = new Date(r.started_at).getTime();
      return t >= from && t < to;
    }).length;
  });

  const signalRows = sellers
    .map((s) => {
      const best = (s.signals || [])
        .slice()
        .sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0))[0];
      return best ? { ...s, signalLabel: best.label || best.signal_type, rank: SEVERITY_RANK[best.severity] || 0 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.rank - a.rank || (b.pta_score || 0) - (a.pta_score || 0))
    .slice(0, 8);

  const attention = [
    { label: 'SLA breaches', count: slaBreaches, to: '/mql' },
    { label: 'Open escalations', count: runs.filter((r) => r.escalation && r.escalation.triggered && r.escalation.status === 'open').length, to: '/sdr' },
    { label: 'RED churn campaigns', count: campaigns.filter((c) => c.churn_band === 'RED').length, to: '/churn' },
    {
      label: 'Contracts expiring in 30 days',
      count: opportunities.filter((o) => {
        const d = o.contract_end_date || o.renewal_date;
        if (!d) return false;
        const diff = new Date(d).getTime() - now;
        return diff > 0 && diff < 30 * DAY;
      }).length,
      to: '/pipeline'
    }
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-base font-semibold text-slate-900">Command Center</h1>
        <DateRangeSelector range={range} setRange={setRange} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiTile label="Total Sellers" value={sellers.length.toLocaleString('en-IN')} subtext="on platform" />
        <KpiTile label="Advertising" value={advertising.toLocaleString('en-IN')} subtext={`${penetration}% penetration`} trend={1} />
        <KpiTile label="Pipeline Value" value={inr(pipelineValue)} subtext={`${openOpps.length} open opportunities`} />
        <KpiTile label="Ad Revenue MTD" value={inr(adRevenue)} subtext={`${mom >= 0 ? '+' : ''}${mom.toFixed(1)}% MoM`} trend={mom} />
        <KpiTile label="Meetings Booked" value={meetings.length} subtext={`${meetingsByAi} by AI SDR · ${rangeLabel}`} />
        <KpiTile label="SLA Breaches" value={slaBreaches} subtext="open leads" danger={slaBreaches > 5} />
      </div>

      <FunnelBar steps={funnelSteps} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3"><PipelineByStage opportunities={opportunities} /></div>
        <div className="lg:col-span-2"><SdrToday stats={sdrStats} weeklyBooked={weeklyBooked} /></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopSignals rows={signalRows} />
        <AttentionRequired items={attention} />
      </div>
    </div>
  );
}
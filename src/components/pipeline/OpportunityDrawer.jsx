import React from 'react';
import { Link } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import Panel from '@/components/common/Panel';
import RoasRangeBar from '@/components/pipeline/RoasRangeBar';
import RankedPackages, { rankPackages } from '@/components/pipeline/RankedPackages';
import ProposalTimeline from '@/components/pipeline/ProposalTimeline';
import { inr, inrFull, pct, dateTime } from '@/lib/format';

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
      <span className="text-[13px] text-slate-900 tabular-nums text-right">{value}</span>
    </div>
  );
}

export default function OpportunityDrawer({ opp, packages, interactions, onOpenChange }) {
  if (!opp) return null;
  const ranked = rankPackages(packages, opp);
  const history = interactions.filter((i) => i.seller_id === opp.seller_id).slice(0, 8);

  return (
    <Sheet open={!!opp} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
        <SheetHeader className="px-5 py-4 border-b border-slate-200">
          <SheetTitle className="text-base">{opp.seller_name}</SheetTitle>
          <div className="text-[11px] text-slate-500">{opp.category} · {opp.package_name}</div>
        </SheetHeader>

        <div className="p-4 space-y-4">
          <Panel title="Opportunity">
            <Row label="Stage" value={<span className="capitalize">{opp.stage}</span>} />
            <Row label="Monthly budget" value={inrFull(opp.monthly_budget)} />
            <Row label="Contract" value={`${opp.contract_months || 0} months · ${inr(opp.total_value)}`} />
            <Row label="Close probability" value={pct(opp.close_probability)} />
            <Row label="Expected close" value={opp.expected_close_date || '—'} />
            <Row label="Owner" value={opp.owner_rep_name} />
            <Row label="Days in stage" value={opp.days_in_stage || 0} />
            {opp.lost_reason && <Row label="Lost reason" value={opp.lost_reason.replace(/_/g, ' ')} />}
            <div className="pt-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1.5">Projected ROAS</div>
              <RoasRangeBar low={opp.projected_roas_low} high={opp.projected_roas_high} />
            </div>
          </Panel>

          <Panel title="Package recommender">
            <RankedPackages packages={ranked} selectedCode={opp.package_code} />
          </Panel>

          <Panel title="Proposal status">
            <ProposalTimeline opp={opp} />
          </Panel>

          <Panel title="Interaction history">
            <div className="space-y-3">
              {history.map((i) => (
                <div key={i.id} className="border-b border-slate-100 pb-2 last:border-0">
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="uppercase tracking-wide">{(i.channel || '').replace(/_/g, ' ')}</span>
                    <span>·</span><span>{i.actor_name}</span>
                    <span>·</span><span className="tabular-nums">{dateTime(i.started_at)}</span>
                  </div>
                  <p className="text-[13px] text-slate-800 mt-1">{i.summary}</p>
                  {i.agent_run_id && (
                    <Link to={`/sdr/calls/${i.agent_run_id}`} className="text-[11px] text-blue-800 hover:underline">View call</Link>
                  )}
                </div>
              ))}
              {history.length === 0 && <p className="text-xs text-slate-500">No interactions logged.</p>}
            </div>
          </Panel>
        </div>
      </SheetContent>
    </Sheet>
  );
}
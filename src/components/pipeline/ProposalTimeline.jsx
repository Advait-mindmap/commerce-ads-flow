import React from 'react';
import { Check } from 'lucide-react';
import { dateTime } from '@/lib/format';

const ORDER = ['draft', 'sent', 'viewed', 'signed'];

export default function ProposalTimeline({ opp }) {
  const idx = ORDER.indexOf(opp.proposal_status);
  const stamps = {
    draft: opp.proposal_sent_at || opp.created_date,
    sent: opp.proposal_sent_at,
    viewed: opp.proposal_viewed_at,
    signed: opp.stage === 'won' ? opp.contract_start_date : null
  };

  return (
    <div className="space-y-0">
      {ORDER.map((step, i) => {
        const done = idx >= i && idx !== -1;
        return (
          <div key={step} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${done ? 'bg-blue-800 border-blue-800' : 'bg-white border-slate-300'}`}>
                {done && <Check className="w-3 h-3 text-white" />}
              </span>
              {i < ORDER.length - 1 && <span className={`w-px flex-1 min-h-[22px] ${idx > i ? 'bg-blue-800' : 'bg-slate-200'}`} />}
            </div>
            <div className="pb-3">
              <div className={`text-[13px] capitalize ${done ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>{step}</div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                {done ? dateTime(stamps[step]) : 'pending'}
                {step === 'viewed' && done && opp.proposal_view_count ? ` · ${opp.proposal_view_count} views` : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
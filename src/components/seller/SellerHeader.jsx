import React from 'react';
import { Button } from '@/components/ui/button';
import PtaBadge from '@/components/common/PtaBadge';
import { inr } from '@/lib/format';
import { Alert, AlertDescription } from '@/components/ui/alert';
import AssigneePicker from '@/components/common/AssigneePicker';

const STATUS = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  dormant: 'bg-amber-50 text-amber-700 border-amber-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
  churned: 'bg-slate-100 text-slate-600 border-slate-200'
};

export default function SellerHeader({ seller, onAction, onCallNow, callNotice, canDial = true, busy = false, assignedTo = null }) {
  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap gap-4 items-start justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold text-slate-900">{seller.display_name}</h1>
            <span className="text-[11px] border border-slate-200 bg-slate-50 rounded px-1.5 py-0.5 text-slate-600 capitalize">{seller.tier}</span>
            <span className={`text-[11px] border rounded px-1.5 py-0.5 capitalize ${STATUS[seller.status] || STATUS.churned}`}>{seller.status}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            {seller.category} · {(seller.seller_type || '').replace(/_/g, ' ')} · {seller.city}, {seller.state} · {Math.round((seller.tenure_days || 0) / 30)} months tenure
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <PtaBadge band={seller.pta_band} score={seller.pta_score} />
            <span className="text-xs text-slate-600 tabular-nums">
              Budget {inr(seller.budget_low)}–{inr(seller.budget_stretch)} (target {inr(seller.budget_target)})
            </span>
          </div>
          {/* "Queue AI SDR" was dropped: with the suppression gate in front of
              every dial it did exactly what "Call now" does, as a second button
              implying a different behaviour. */}
          <div className="flex gap-1.5 flex-wrap justify-end">
            {canDial && <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={onCallNow}>Call now</Button>}
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={() => onAction('sequence')}>Add to sequence</Button>
            <AssigneePicker
              currentName={assignedTo}
              disabled={busy}
              onAssign={(member) => onAction('assign', member)}
            />
          </div>
        </div>
      </div>

      {callNotice && callNotice.kind === 'blocked' && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <AlertDescription>{callNotice.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
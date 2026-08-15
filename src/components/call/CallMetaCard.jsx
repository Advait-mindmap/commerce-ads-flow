import React from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import Panel from '@/components/common/Panel';
import PtaBadge from '@/components/common/PtaBadge';
import OutcomeBadge from '@/components/common/OutcomeBadge';
import { mmss, inrFull, dateTime } from '@/lib/format';

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium shrink-0">{label}</span>
      <span className="text-[13px] text-slate-900 text-right tabular-nums">{children}</span>
    </div>
  );
}

export default function CallMetaCard({ run, seller, contact }) {
  return (
    <Panel title="Call">
      <div className="pb-3 mb-1 border-b border-slate-200">
        <div className="text-[15px] font-semibold text-slate-900">{run.seller_name}</div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[11px] text-slate-500">{seller ? seller.category : run.seller_name}</span>
          {seller && (
            <span className="text-[11px] border border-slate-200 bg-slate-50 rounded px-1.5 py-0.5 text-slate-600 capitalize">
              {seller.tier}
            </span>
          )}
          {seller && <PtaBadge band={seller.pta_band} score={seller.pta_score} />}
        </div>
      </div>
      <Row label="Contact">{contact ? `${contact.full_name} · ${contact.role}` : '—'}</Row>
      <Row label="Phone">{run.contact_phone || (contact && contact.phone) || '—'}</Row>
      <Row label="Agent">AI SDR (Meera)</Row>
      <Row label="Script">{run.script_variant || '—'}</Row>
      <Row label="Language">{run.language || '—'}</Row>
      <Row label="Duration">{mmss(run.duration_sec)}</Row>
      <Row label="Cost">{inrFull((run.cost_usd || 0) * 83)}</Row>
      <Row label="Timestamp">{dateTime(run.started_at)}</Row>
      <Row label="Outcome"><OutcomeBadge outcome={run.outcome} /></Row>
      <Row label="Signature">
        {run.signature_verified ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 text-xs"><ShieldCheck className="w-3.5 h-3.5" /> Verified</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-amber-700 text-xs"><ShieldAlert className="w-3.5 h-3.5" /> Unverified</span>
        )}
      </Row>
    </Panel>
  );
}
import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import Panel from '@/components/common/Panel';
import { Input } from '@/components/ui/input';

function VerifyTag() {
  return (
    <span className="text-[10px] uppercase tracking-wide border rounded px-1 py-0.5 text-amber-800" style={{ backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }}>
      Verify
    </span>
  );
}

function Field({ label, needsVerify, editable, value, onSave, children }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium shrink-0 pt-0.5">{label}</span>
      <div className="flex items-center gap-2 text-right">
        {needsVerify && <VerifyTag />}
        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { setEditing(false); onSave(draft); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { setEditing(false); onSave(draft); } }}
            className="h-7 w-40 text-xs"
          />
        ) : (
          <span
            className={`text-[13px] text-slate-900 ${editable ? 'cursor-text hover:underline decoration-dotted' : ''}`}
            onClick={() => editable && setEditing(true)}
          >
            {children}
          </span>
        )}
      </div>
    </div>
  );
}

export default function QualificationCard({ qualification, reveal, onFieldSave }) {
  const q = qualification || {};
  const verify = q.fields_needing_verification || [];
  const needs = (k) => verify.includes(k);

  const fields = [
    {
      key: 'is_decision_maker',
      label: 'Decision maker',
      node: q.is_decision_maker
        ? <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="w-4 h-4" /> Yes</span>
        : <span className="inline-flex items-center gap-1 text-red-600"><X className="w-4 h-4" /> No{q.decision_maker_name ? ` · ${q.decision_maker_name}` : ''}</span>
    },
    {
      key: 'currently_advertising',
      label: 'Currently advertising',
      node: (q.currently_advertising || []).length ? (
        <span className="flex flex-wrap gap-1 justify-end">
          {q.currently_advertising.map((c) => (
            <span key={c} className="text-[11px] border border-slate-200 bg-slate-50 rounded px-1.5 py-0.5 text-slate-600">{c}</span>
          ))}
        </span>
      ) : 'None'
    },
    { key: 'budget_band_stated', label: 'Budget stated', node: q.budget_band_stated || '—', editable: true, value: q.budget_band_stated },
    { key: 'timeline', label: 'Timeline', node: (q.timeline || '—').replace(/_/g, ' '), editable: true, value: q.timeline },
    {
      key: 'pain_confirmed',
      label: 'Pain confirmed',
      node: q.pain_confirmed
        ? <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="w-4 h-4" /> Yes</span>
        : <span className="inline-flex items-center gap-1 text-slate-500"><X className="w-4 h-4" /> No</span>
    },
    {
      key: 'qualified',
      label: 'Verdict',
      node: (
        <span className={`inline-block border rounded px-1.5 py-0.5 text-[11px] font-medium ${
          q.qualified ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'
        }`}>
          {q.qualified ? 'Qualified' : 'Not qualified'}
        </span>
      )
    },
    { key: 'confidence', label: 'Confidence', node: q.confidence != null ? `${Math.round(q.confidence * 100)}%` : '—' }
  ];

  const count = reveal == null ? fields.length : Math.ceil(reveal * fields.length);

  return (
    <Panel
      title="Qualification"
      /* Says what produced this verdict. A rep second-guessing a record should
         not have to wonder whether it was read or pattern-matched. */
      action={q.read_by ? (
        <span
          className="text-[10px] uppercase tracking-wide text-slate-500 border border-slate-200 rounded px-1.5 py-0.5"
          title={q.read_by === 'claude'
            ? 'Transcript read by Claude'
            : 'Keyword fallback — the transcript was not read by a model'}
        >
          {q.read_by === 'claude' ? 'AI read' : 'keyword fallback'}
        </span>
      ) : null}
    >
      {fields.slice(0, count).map((f) => (
        <Field
          key={f.key}
          label={f.label}
          needsVerify={needs(f.key)}
          editable={f.editable}
          value={f.value}
          onSave={(v) => onFieldSave(f.key, v)}
        >
          {f.node}
        </Field>
      ))}
      {count < fields.length && <p className="text-[11px] text-slate-400 pt-2">Filling in as the call plays…</p>}
      {/* Why the verdict landed where it did, in the reader's own words. */}
      {(q.rationale || q.pain_description) && count === fields.length && (
        <p className="text-xs text-slate-600 mt-2 pt-2 border-t border-slate-200">
          {q.rationale || q.pain_description}
        </p>
      )}
    </Panel>
  );
}
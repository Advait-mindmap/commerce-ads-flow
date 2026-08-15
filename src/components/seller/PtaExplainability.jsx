import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Panel from '@/components/common/Panel';

export default function PtaExplainability({ seller, model }) {
  const [open, setOpen] = useState(false);
  const contributions = seller.pta_contributions || [];
  const maxC = Math.max(...contributions.map((c) => Math.abs(c.contribution)), 0.01);
  const reasons = seller.pta_reasons || [];
  const importances = ((model && model.feature_importances) || []).slice(0, 10);
  const maxI = Math.max(...importances.map((f) => f.importance), 0.01);

  return (
    <Panel title="Propensity to advertise — explainability">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-slate-900 tabular-nums">
          {Math.round((seller.pta_score || 0) * ((seller.pta_score || 0) <= 1 ? 100 : 1))}
        </span>
        <span className="text-xs text-slate-500">band {seller.pta_band}</span>
      </div>

      <ul className="mt-3 space-y-2.5">
        {reasons.map((r, i) => {
          const c = contributions[i] || contributions.find((x) => r.toLowerCase().includes((x.feature || '').split('_')[0]));
          const w = c ? (Math.abs(c.contribution) / maxC) * 100 : 20;
          return (
            <li key={i}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-slate-800">{r}</span>
                {c && <span className="text-[11px] text-slate-500 tabular-nums shrink-0">{c.contribution > 0 ? '+' : ''}{(c.contribution * 100).toFixed(1)}</span>}
              </div>
              <div className="bg-slate-100 rounded-sm mt-1 overflow-hidden" style={{ height: 4 }}>
                <div className={`h-full ${c && c.contribution < 0 ? 'bg-red-500' : 'bg-blue-800'}`} style={{ width: `${w}%` }} />
              </div>
            </li>
          );
        })}
        {reasons.length === 0 && <li className="text-xs text-slate-500">No reasons recorded for this score.</li>}
      </ul>

      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-xs text-blue-800 mt-3 hover:underline">
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} /> How this is calculated
      </button>

      {open && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="text-[11px] text-slate-500 mb-2">
            Champion model {model ? `${model.model_key} ${model.version}` : '—'}
            {model ? ` · AUC ${(model.auc || 0).toFixed(3)} · calibration error ${(model.calibration_error || 0).toFixed(3)}` : ''}
          </div>
          <ul className="space-y-1.5">
            {importances.map((f) => (
              <li key={f.feature} className="flex items-center gap-2">
                <span className="text-[11px] text-slate-600 w-44 shrink-0 truncate">{f.feature.replace(/_/g, ' ')}</span>
                <span className="flex-1 bg-slate-100 rounded-sm overflow-hidden" style={{ height: 4 }}>
                  <span className="block h-full bg-slate-400" style={{ width: `${(f.importance / maxI) * 100}%` }} />
                </span>
                <span className="text-[11px] text-slate-500 tabular-nums w-10 text-right">{(f.importance * 100).toFixed(1)}</span>
              </li>
            ))}
            {importances.length === 0 && <li className="text-xs text-slate-500">No champion model registered.</li>}
          </ul>
        </div>
      )}
    </Panel>
  );
}
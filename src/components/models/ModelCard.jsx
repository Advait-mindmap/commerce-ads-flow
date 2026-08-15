import React from 'react';
import { Link } from 'react-router-dom';

const DRIFT = {
  stable: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  watch: 'bg-amber-50 text-amber-700 border-amber-200',
  drifted: 'bg-red-50 text-red-700 border-red-200'
};

const NAMES = {
  pta: 'Propensity to Advertise',
  budget_capacity: 'Budget Capacity',
  churn_survival: 'Churn Survival',
  elasticity: 'Spend Elasticity'
};

export default function ModelCard({ model }) {
  return (
    <Link to={`/models/${model.model_key}`} className="block bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-300">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold text-slate-900">{NAMES[model.model_key] || model.model_key}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Champion {model.version}</div>
        </div>
        <span className={`text-[11px] border rounded px-1.5 py-0.5 ${DRIFT[model.drift_status] || DRIFT.stable}`}>
          {model.drift_status || 'stable'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-100">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">AUC</div>
          <div className="text-base font-semibold text-slate-900 tabular-nums">{(model.auc || 0).toFixed(3)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Calib. error</div>
          <div className="text-base font-semibold text-slate-900 tabular-nums">{(model.calibration_error || 0).toFixed(3)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Trained</div>
          <div className="text-[13px] text-slate-700 tabular-nums mt-1">
            {model.trained_at ? new Date(model.trained_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
          </div>
        </div>
      </div>
    </Link>
  );
}
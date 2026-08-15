import React from 'react';
import Panel from '@/components/common/Panel';
import { dateTime } from '@/lib/format';

const STATUS = {
  champion: 'bg-blue-50 text-blue-800 border-blue-200',
  challenger: 'bg-amber-50 text-amber-700 border-amber-200',
  retired: 'bg-slate-100 text-slate-500 border-slate-200'
};

export default function VersionHistory({ versions, championAuc }) {
  return (
    <Panel title="Version history" bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Version', 'Status', 'AUC', 'vs Champion', 'Avg precision', 'Calib. error', 'Rows', 'Trained'].map((h) => (
                <th key={h} className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => {
              const delta = (v.auc || 0) - (championAuc || 0);
              return (
                <tr key={v.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 text-[13px] font-medium text-slate-900">{v.version}</td>
                  <td className="px-3 py-2"><span className={`text-[11px] border rounded px-1.5 py-0.5 ${STATUS[v.status] || STATUS.retired}`}>{v.status}</span></td>
                  <td className="px-3 py-2 text-[13px] text-slate-900 tabular-nums">{(v.auc || 0).toFixed(3)}</td>
                  <td className={`px-3 py-2 text-[13px] tabular-nums ${delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                    {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(3)}`}
                  </td>
                  <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{(v.average_precision || 0).toFixed(3)}</td>
                  <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{(v.calibration_error || 0).toFixed(3)}</td>
                  <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{(v.training_rows || 0).toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2 text-[11px] text-slate-500 tabular-nums whitespace-nowrap">{v.trained_at ? dateTime(v.trained_at) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
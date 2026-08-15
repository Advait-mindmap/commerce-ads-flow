import React from 'react';
import ExportCsvButton from '@/components/common/ExportCsvButton';
import EmptyState from '@/components/common/EmptyState';
import { dateTime } from '@/lib/format';

const CSV_COLUMNS = [
  { key: 'seller_name', label: 'Seller' },
  { key: 'reason', label: 'Reason' },
  { key: 'channel', label: 'Channel' },
  { key: 'created_at', label: 'Created' },
  { key: 'expires_at', label: 'Expires' }
];

const REASON = {
  dnd_registry: 'bg-red-50 text-red-700 border-red-200',
  opted_out: 'bg-red-50 text-red-700 border-red-200',
  frequency_cap: 'bg-amber-50 text-amber-700 border-amber-200',
  recent_contact: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  disqualified_recent: 'bg-slate-100 text-slate-600 border-slate-200',
  experiment_holdout: 'bg-blue-50 text-blue-800 border-blue-200',
  account_suspended: 'bg-slate-100 text-slate-600 border-slate-200'
};

export default function SuppressionsTab({ suppressions }) {
  const counts = suppressions.reduce((acc, s) => {
    acc[s.reason] = (acc[s.reason] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap gap-x-6 gap-y-3">
        {Object.entries(counts).map(([reason, count]) => (
          <div key={reason}>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">{reason.replace(/_/g, ' ')}</div>
            <div className="text-lg font-semibold text-slate-900 tabular-nums">{count}</div>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Active total</div>
            <div className="text-lg font-semibold text-slate-900 tabular-nums">{suppressions.length}</div>
          </div>
          <ExportCsvButton filename="suppressions" columns={CSV_COLUMNS} rows={suppressions} />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Seller', 'Reason', 'Channel', 'Created', 'Expires'].map((h) => (
                <th key={h} className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {suppressions.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 text-[13px] font-medium text-slate-900 max-w-[220px] truncate">{s.seller_name}</td>
                <td className="px-3 py-2">
                  <span className={`text-[11px] border rounded px-1.5 py-0.5 ${REASON[s.reason] || REASON.disqualified_recent}`}>{(s.reason || '').replace(/_/g, ' ')}</span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-600 capitalize">{s.channel}</td>
                <td className="px-3 py-2 text-[11px] text-slate-500 tabular-nums whitespace-nowrap">{s.created_at ? dateTime(s.created_at) : '—'}</td>
                <td className="px-3 py-2 text-[11px] text-slate-500 tabular-nums whitespace-nowrap">{s.expires_at ? dateTime(s.expires_at) : 'Permanent'}</td>
              </tr>
            ))}
            {suppressions.length === 0 && (
              <tr><td colSpan={5} className="p-0">
                <EmptyState message="No active suppressions — every contact is currently reachable." actionLabel="Review MQL inbox" to="/mql" />
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
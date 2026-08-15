import React from 'react';
import { useNavigate } from 'react-router-dom';
import PtaBadge from '@/components/common/PtaBadge';
import EmptyState from '@/components/common/EmptyState';
import { inr } from '@/lib/format';

const HEADERS = ['Seller', 'Category', 'Tier', 'Type', 'City', 'Tenure', 'GMV 30d', 'Status', 'PTA', 'Ever advertised'];

const STATUS = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  dormant: 'bg-amber-50 text-amber-700 border-amber-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
  churned: 'bg-slate-100 text-slate-600 border-slate-200'
};

export default function SellerTable({ sellers }) {
  const navigate = useNavigate();
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {HEADERS.map((h) => <th key={h} className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 font-medium whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {sellers.map((s) => (
            <tr key={s.id} onClick={() => navigate(`/sellers/${s.id}`)} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
              <td className="px-3 py-2 text-[13px] font-medium text-slate-900 max-w-[200px] truncate">{s.display_name}</td>
              <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{s.category}</td>
              <td className="px-3 py-2 text-xs text-slate-600 capitalize">{s.tier}</td>
              <td className="px-3 py-2 text-xs text-slate-600">{(s.seller_type || '').replace(/_/g, ' ')}</td>
              <td className="px-3 py-2 text-xs text-slate-600">{s.city}</td>
              <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{s.tenure_days || 0}d</td>
              <td className="px-3 py-2 text-[13px] text-slate-900 tabular-nums">{inr(s.gmv_30d)}</td>
              <td className="px-3 py-2">
                <span className={`text-[11px] border rounded px-1.5 py-0.5 capitalize ${STATUS[s.status] || STATUS.churned}`}>{s.status}</span>
              </td>
              <td className="px-3 py-2"><PtaBadge band={s.pta_band} score={s.pta_score} /></td>
              <td className="px-3 py-2 text-xs text-slate-600">{s.ever_advertised ? 'Yes' : 'No'}</td>
            </tr>
          ))}
          {sellers.length === 0 && (
            <tr><td colSpan={HEADERS.length} className="p-0">
              <EmptyState message="No sellers match the current search and filters." actionLabel="View all signals" to="/signals" />
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
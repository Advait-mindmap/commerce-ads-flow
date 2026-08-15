import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import PtaBadge from '@/components/common/PtaBadge';
import Sparkline from '@/components/common/Sparkline';
import { inr } from '@/lib/format';

const COLUMNS = [
  { key: 'display_name', label: 'Seller', sortable: false },
  { key: 'pta_score', label: 'PTA', sortable: true },
  { key: 'organic_impr_decline', label: 'Organic Decline', sortable: true },
  { key: 'traffic', label: 'Traffic', sortable: false },
  { key: 'gmv_30d', label: 'GMV 30d', sortable: true },
  { key: 'sku_count', label: 'SKUs', sortable: true },
  { key: 'position_loss_90d', label: 'Position Δ90d', sortable: true },
  { key: 'category_sov', label: 'SoV %', sortable: true },
  { key: 'signal_count', label: 'Signals', sortable: true },
  { key: 'budget_target', label: 'Budget Range', sortable: true },
  { key: 'actions', label: '', sortable: false }
];

export default function SignalTable({ rows, sort, setSort, selected, toggleRow, toggleAll }) {
  const navigate = useNavigate();
  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  const onSort = (key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="w-9 px-3 py-2"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
            {COLUMNS.map((c) => (
              <th key={c.key} className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 font-medium whitespace-nowrap">
                {c.sortable ? (
                  <button onClick={() => onSort(c.key)} className="inline-flex items-center gap-1 hover:text-slate-800">
                    {c.label}
                    {sort.key === c.key && (sort.dir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
                  </button>
                ) : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const decline = Math.round((s.organic_impr_decline || 0) * 100);
            const organic = (s.traffic_series || []).map((t) => t.organic);
            return (
              <tr
                key={s.id}
                onClick={() => navigate(`/sellers/${s.id}`)}
                className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
              >
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.includes(s.id)} onCheckedChange={() => toggleRow(s.id)} />
                </td>
                <td className="px-3 py-2">
                  <div className="text-[13px] text-slate-900 font-medium">{s.display_name}</div>
                  <div className="text-[11px] text-slate-500">{s.category}</div>
                </td>
                <td className="px-3 py-2"><PtaBadge band={s.pta_band} score={s.pta_score} /></td>
                <td className={`px-3 py-2 text-[13px] tabular-nums ${decline > 25 ? 'text-red-600 font-medium' : 'text-slate-700'}`}>
                  {decline}%
                </td>
                <td className="px-3 py-2"><Sparkline values={organic} /></td>
                <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{inr(s.gmv_30d)}</td>
                <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums whitespace-nowrap">
                  {s.sku_count || 0}
                  {s.sku_added_30d > 0 && <span className="text-emerald-600 ml-1">+{s.sku_added_30d}</span>}
                </td>
                <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">
                  {s.position_loss_90d ? `−${(s.position_loss_90d).toFixed(1)}` : '—'}
                </td>
                <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums">{((s.category_sov || 0) * 100).toFixed(1)}%</td>
                <td className="px-3 py-2">
                  <span className="inline-block border border-slate-200 bg-slate-50 rounded px-1.5 py-0.5 text-[11px] text-slate-600 tabular-nums">
                    {(s.signals || []).length}
                  </span>
                </td>
                <td className="px-3 py-2 text-[13px] text-slate-700 tabular-nums whitespace-nowrap">
                  {inr(s.budget_low)}–{inr(s.budget_stretch)}
                </td>
                <td className="px-3 py-2"><ChevronRight className="w-4 h-4 text-slate-400" /></td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={12} className="px-4 py-10 text-center text-xs text-slate-500">No sellers match these filters.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
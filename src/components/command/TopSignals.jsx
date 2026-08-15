import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Panel from '@/components/common/Panel';
import PtaBadge from '@/components/common/PtaBadge';

export default function TopSignals({ rows }) {
  const navigate = useNavigate();
  return (
    <Panel title="Top signals this week" bodyClassName="p-0">
      <table className="w-full text-left">
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => navigate('/signals')}
              className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer"
            >
              <td className="px-4 py-2.5">
                <div className="text-[13px] text-slate-900 font-medium truncate max-w-[160px]">{r.display_name}</div>
                <div className="text-[11px] text-slate-500">{r.category}</div>
              </td>
              <td className="px-2 py-2.5 text-xs text-slate-600">{r.signalLabel}</td>
              <td className="px-2 py-2.5"><PtaBadge band={r.pta_band} score={r.pta_score} /></td>
              <td className="px-4 py-2.5 w-8"><ChevronRight className="w-4 h-4 text-slate-400" /></td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td className="px-4 py-6 text-xs text-slate-500">No new signals this week.</td></tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}
import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ExportCsvButton from '@/components/common/ExportCsvButton';
import { dateTime } from '@/lib/format';

const CSV_COLUMNS = [
  { key: 'timestamp', label: 'Timestamp' },
  { key: 'actor_type', label: 'Actor type' },
  { key: 'actor_name', label: 'Actor' },
  { key: 'action', label: 'Action' },
  { key: 'entity_type', label: 'Entity type' },
  { key: 'entity_name', label: 'Entity' },
  { key: 'summary', label: 'Summary' },
  { key: 'before_value', label: 'Before' },
  { key: 'after_value', label: 'After' }
];

const ACTOR = {
  agent: 'bg-blue-50 text-blue-800 border-blue-200',
  human_rep: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  system: 'bg-slate-100 text-slate-600 border-slate-200',
  admin: 'bg-amber-50 text-amber-700 border-amber-200'
};

function Picker({ label, value, onChange, options }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[160px] text-xs bg-white"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all" className="text-xs">All {label.toLowerCase()}</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o} className="text-xs">{o.replace(/_/g, ' ')}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export default function AuditLogTab({ logs }) {
  const [f, setF] = useState({ actor_type: 'all', action: 'all', entity_type: 'all', from: '', to: '' });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const uniq = (key) => Array.from(new Set(logs.map((l) => l[key]).filter(Boolean))).sort();

  const rows = useMemo(() => logs.filter((l) => {
    if (f.actor_type !== 'all' && l.actor_type !== f.actor_type) return false;
    if (f.action !== 'all' && l.action !== f.action) return false;
    if (f.entity_type !== 'all' && l.entity_type !== f.entity_type) return false;
    const t = l.timestamp ? new Date(l.timestamp).getTime() : 0;
    if (f.from && t < new Date(f.from).getTime()) return false;
    if (f.to && t > new Date(f.to).getTime() + 86400000) return false;
    return true;
  }), [logs, f]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-2">
        <Picker label="Actor types" value={f.actor_type} onChange={set('actor_type')} options={uniq('actor_type')} />
        <Picker label="Actions" value={f.action} onChange={set('action')} options={uniq('action')} />
        <Picker label="Entity types" value={f.entity_type} onChange={set('entity_type')} options={uniq('entity_type')} />
        <Input type="date" value={f.from} onChange={(e) => set('from')(e.target.value)} className="h-8 w-[140px] text-xs" />
        <Input type="date" value={f.to} onChange={(e) => set('to')(e.target.value)} className="h-8 w-[140px] text-xs" />
        <span className="ml-auto text-[11px] text-slate-500 tabular-nums">{rows.length} of {logs.length} entries</span>
        <ExportCsvButton filename="audit-log" columns={CSV_COLUMNS} rows={rows} />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Timestamp', 'Actor', 'Action', 'Entity', 'Summary', 'Before → After'].map((h) => (
                <th key={h} className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 text-[11px] text-slate-500 tabular-nums whitespace-nowrap">{l.timestamp ? dateTime(l.timestamp) : '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`text-[11px] border rounded px-1.5 py-0.5 ${ACTOR[l.actor_type] || ACTOR.system}`}>{(l.actor_type || '').replace(/_/g, ' ')}</span>
                  <span className="text-xs text-slate-700 ml-1.5">{l.actor_name}</span>
                </td>
                <td className="px-3 py-2 text-[13px] text-slate-900">{(l.action || '').replace(/_/g, ' ')}</td>
                <td className="px-3 py-2 text-xs text-slate-600 max-w-[180px] truncate">{l.entity_type} · {l.entity_name}</td>
                <td className="px-3 py-2 text-xs text-slate-700 max-w-[260px]">{l.summary}</td>
                <td className="px-3 py-2 text-[11px] text-slate-600 tabular-nums whitespace-nowrap">
                  {l.before_value || l.after_value ? <>{l.before_value || '—'} <span className="text-slate-400">→</span> {l.after_value || '—'}</> : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-slate-500">No entries match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
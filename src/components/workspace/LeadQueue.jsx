import React, { useEffect, useState } from 'react';
import QueueCard from '@/components/workspace/QueueCard';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'a', label: 'A-band' },
  { key: 'sla', label: 'SLA at risk' },
  { key: 'callback', label: 'Callbacks' }
];

export default function LeadQueue({ leads, selectedId, onSelect, tab, setTab }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-white border border-slate-200 rounded-lg flex flex-col overflow-hidden">
      <div className="flex border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-2 py-2.5 text-[11px] font-medium ${tab === t.key ? 'text-blue-800 border-b-2 border-blue-800' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="overflow-y-auto max-h-[calc(100vh-190px)]">
        {leads.map((l) => (
          <QueueCard key={l.id} lead={l} now={now} selected={l.id === selectedId} onSelect={() => onSelect(l)} />
        ))}
        {leads.length === 0 && <p className="p-6 text-center text-xs text-slate-500">Queue is clear.</p>}
      </div>
    </div>
  );
}
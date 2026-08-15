import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import SignalFilters from '@/components/signals/SignalFilters';
import SignalTable from '@/components/signals/SignalTable';
import BulkActionsBar from '@/components/signals/BulkActionsBar';
import { dialSequentially } from '@/lib/dialer';

const DEFAULTS = {
  bands: [],
  category: 'all',
  decline: [0, 80],
  gmvBand: 'all',
  neverAdvertised: false,
  tenure: [0, 60],
  search: ''
};

const GMV_RANGES = {
  lt1l: [0, 100000],
  '1to5l': [100000, 500000],
  '5to20l': [500000, 2000000],
  gt20l: [2000000, Infinity]
};

export default function SignalExplorer() {
  const [sellers, setSellers] = useState(null);
  const [filters, setFilters] = useState(DEFAULTS);
  const [sort, setSort] = useState({ key: 'pta_score', dir: 'desc' });
  const [selected, setSelected] = useState([]);
  const { toast } = useToast();

  useEffect(() => {
    base44.entities.Seller.list(null, 500).then(setSellers);
  }, []);

  const active = useMemo(() => JSON.stringify(filters) !== JSON.stringify(DEFAULTS), [filters]);

  const rows = useMemo(() => {
    if (!sellers) return [];
    const gmvRange = GMV_RANGES[filters.gmvBand];
    const q = filters.search.trim().toLowerCase();

    const filtered = sellers.filter((s) => {
      if (filters.bands.length && !filters.bands.includes(s.pta_band)) return false;
      if (filters.category !== 'all' && s.category !== filters.category) return false;
      const dec = (s.organic_impr_decline || 0) * 100;
      if (dec < filters.decline[0] || dec > filters.decline[1]) return false;
      if (gmvRange && ((s.gmv_30d || 0) < gmvRange[0] || (s.gmv_30d || 0) >= gmvRange[1])) return false;
      if (filters.neverAdvertised && s.ever_advertised) return false;
      const months = (s.tenure_days || 0) / 30;
      if (months < filters.tenure[0] || months > filters.tenure[1]) return false;
      if (q && !(s.display_name || '').toLowerCase().includes(q)) return false;
      return true;
    });

    const val = (s) => (sort.key === 'signal_count' ? (s.signals || []).length : Number(s[sort.key]) || 0);
    return filtered.sort((a, b) => (sort.dir === 'desc' ? val(b) - val(a) : val(a) - val(b)));
  }, [sellers, filters, sort]);

  const toggleRow = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSelected((s) => (rows.every((r) => s.includes(r.id)) ? [] : rows.map((r) => r.id)));

  if (!sellers) return <div className="p-6 text-sm text-slate-500">Loading sellers…</div>;

  return (
    <div className="flex flex-col min-h-full">
      <SignalFilters
        filters={filters}
        setFilters={setFilters}
        shown={rows.length}
        total={sellers.length}
        active={active}
        onClear={() => setFilters(DEFAULTS)}
      />
      <div className="flex-1 bg-white">
        <SignalTable
          rows={rows}
          sort={sort}
          setSort={setSort}
          selected={selected}
          toggleRow={toggleRow}
          toggleAll={toggleAll}
        />
      </div>
      <BulkActionsBar
        count={selected.length}
        onClear={() => setSelected([])}
        onAction={async (action) => {
          if (action !== 'Queue for AI SDR') {
            toast({ title: action, description: `${selected.length} sellers queued.` });
            setSelected([]);
            return;
          }

          const queuedLeads = [];
          for (const sellerId of selected) {
            const seller = sellers.find((s) => s.id === sellerId);
            if (!seller) continue;
            let lead = (await base44.entities.Lead.filter({ seller_id: sellerId }))[0] || null;
            if (!lead) {
              lead = await base44.entities.Lead.create({
                seller_id: seller.id,
                seller_name: seller.display_name,
                contact_phone: seller.contact_phone || seller.phone || '',
                stage: 'mql',
                pta_band: seller.pta_band || 'C',
                pta_score: seller.pta_score || 0,
                assigned_rep_name: seller.assigned_rep_name || 'Unassigned',
                supplier_id: seller.id
              });
            }
            queuedLeads.push(lead);
          }

          const result = await dialSequentially(queuedLeads, () => {});
          toast({
            title: 'AI SDR queued',
            description: `${result.dialled.length} dialled · ${result.blocked.length} blocked · ${result.failed.length} failed`
          });
          setSelected([]);
        }}
      />
    </div>
  );
}
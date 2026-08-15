import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import SignalFilters from '@/components/signals/SignalFilters';
import SignalTable from '@/components/signals/SignalTable';
import BulkActionsBar from '@/components/signals/BulkActionsBar';
import { dialSequentially } from '@/lib/dialer';
import { logAudit } from '@/lib/audit';
import { useAuth } from '@/lib/AuthContext';

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
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const { user, hasCap } = useAuth();

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
        busy={busy}
        canDial={hasCap('dial')}
        onClear={() => setSelected([])}
        onAction={async (action) => {
          setBusy(true);
          try {
            // Each bulk action needs a Lead to hang off, so resolve or create
            // one per selected seller first.
            const leads = [];
            for (const sellerId of selected) {
              const seller = sellers.find((s) => s.id === sellerId);
              if (!seller) continue;
              let lead = (await base44.entities.Lead.filter({ seller_id: sellerId }))[0] || null;
              if (!lead) {
                lead = await base44.entities.Lead.create({
                  seller_id: seller.id,
                  seller_name: seller.display_name,
                  category: seller.category,
                  source: 'signal_explorer',
                  mql_trigger: `Selected from Signal Explorer — ${Math.round((seller.organic_impr_decline || 0) * 100)}% organic decline`,
                  mql_at: new Date().toISOString(),
                  stage: 'mql',
                  pta_band: seller.pta_band || 'C',
                  pta_score: seller.pta_score || 0,
                  pta_reasons: seller.pta_reasons || [],
                  budget_target: seller.budget_target || 0,
                  contact_phone: seller.contact_phone || '',
                  suppression_status: 'none',
                  agent_attempts: 0,
                  sla_status: 'on_track'
                });
              }
              leads.push(lead);
            }

            if (action === 'queue') {
              const result = await dialSequentially(leads, () => {});
              toast({
                title: 'AI SDR dialling',
                description: `${result.dialled.length} dialled · ${result.blocked.length} blocked · ${result.failed.length} failed`
              });
            }

            if (action === 'sequence') {
              await Promise.all(leads.map((lead) => base44.entities.Sequence.create({
                seller_id: lead.seller_id,
                seller_name: lead.seller_name,
                lead_id: lead.id,
                sequence_type: 'nurture',
                channel: 'whatsapp',
                step_number: 1,
                total_steps: 4,
                status: 'active',
                next_send_at: new Date(Date.now() + 86400000).toISOString()
              })));
              await Promise.all(leads.map((lead) => logAudit({
                action: 'lead_added_to_sequence',
                entity_type: 'Lead',
                entity_id: lead.id,
                entity_name: lead.seller_name,
                summary: 'Enrolled in a 4-step WhatsApp nurture sequence from Signal Explorer'
              })));
              toast({ title: 'Added to sequence', description: `${leads.length} lead(s) enrolled in a 4-step WhatsApp nurture.` });
            }

            if (action === 'assign') {
              const repName = user?.full_name || user?.email;
              await base44.entities.Lead.bulkUpdate(leads.map((lead) => ({
                id: lead.id,
                assigned_rep_name: repName,
                assigned_rep_id: user?.id
              })));
              await Promise.all(leads.map((lead) => logAudit({
                action: 'lead_assigned',
                entity_type: 'Lead',
                entity_id: lead.id,
                entity_name: lead.seller_name,
                summary: `Assigned to ${repName} from Signal Explorer`,
                after_value: repName
              })));
              toast({ title: 'Assigned', description: `${leads.length} lead(s) now assigned to ${repName}.` });
            }

            setSelected([]);
          } catch (err) {
            toast({ title: 'Bulk action failed', description: err.message, variant: 'destructive' });
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
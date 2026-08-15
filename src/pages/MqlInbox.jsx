import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Switch } from '@/components/ui/switch';
import MqlTable from '@/components/mql/MqlTable';
import MqlBulkBar from '@/components/mql/MqlBulkBar';
import ExportCsvButton from '@/components/common/ExportCsvButton';
import { TableSkeleton } from '@/components/common/Skeletons';
import { logAudit } from '@/lib/audit';

const CSV_COLUMNS = [
  { key: 'seller_name', label: 'Seller' },
  { key: 'source', label: 'Source' },
  { key: 'mql_trigger', label: 'MQL trigger' },
  { key: 'mql_at', label: 'MQL at' },
  { key: 'pta_band', label: 'PTA band' },
  { key: 'pta_score', label: 'PTA score' },
  { key: 'suppression_status', label: 'Suppression' },
  { key: 'assigned_rep_name', label: 'Assigned rep' },
  { key: 'sla_status', label: 'SLA status' }
];

export default function MqlInbox() {
  const [leads, setLeads] = useState(null);
  const [sequences, setSequences] = useState([]);
  const [selected, setSelected] = useState([]);
  const [groupBySource, setGroupBySource] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      base44.entities.Lead.filter({ stage: 'mql' }, '-mql_at', 300),
      base44.entities.Sequence.list('-last_sent_at', 500)
    ]).then(([l, s]) => { setLeads(l); setSequences(s); });
  }, []);

  const groups = useMemo(() => {
    if (!leads) return [];
    if (!groupBySource) return [['All MQLs', leads]];
    const map = {};
    leads.forEach((l) => { (map[l.source || 'unknown'] ||= []).push(l); });
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [leads, groupBySource]);

  if (!leads) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-base font-semibold text-slate-900">MQL Inbox</h1>
        <TableSkeleton rows={10} columns={9} />
      </div>
    );
  }

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = (rows) => setSelected((s) => (rows.every((r) => s.includes(r.id)) ? s.filter((x) => !rows.some((r) => r.id === x)) : Array.from(new Set([...s, ...rows.map((r) => r.id)]))));

  const applyLocal = (ids, patch) => setLeads((ls) => ls.map((l) => (ids.includes(l.id) ? { ...l, ...patch } : l)));

  const queue = async (ids) => {
    setBusy(true);
    toast({ title: `Queueing ${ids.length} lead(s)…` });
    const now = new Date().toISOString();
    await Promise.all(ids.map((id) => {
      const lead = leads.find((l) => l.id === id);
      return base44.entities.AgentRun.create({
        agent_key: 'sdr_qualification',
        lead_id: id,
        seller_id: lead.seller_id,
        seller_name: lead.seller_name,
        contact_phone: lead.contact_phone,
        channel: 'voice_out',
        status: 'queued',
        started_at: now
      });
    }));
    await Promise.all(ids.map((id) => logAudit({
      action: 'lead_queued_for_ai_sdr',
      entity_type: 'Lead',
      entity_id: id,
      entity_name: (leads.find((l) => l.id === id) || {}).seller_name,
      summary: 'Queued an AI SDR qualification call from the MQL inbox'
    })));
    applyLocal(ids, { last_agent_contact_at: now });
    setSelected([]);
    setBusy(false);
    toast({ title: `${ids.length} lead(s) queued for AI SDR` });
  };

  const addToSequence = async (ids) => {
    setBusy(true);
    toast({ title: `Adding ${ids.length} lead(s) to a sequence…` });
    await Promise.all(ids.map((id) => {
      const lead = leads.find((l) => l.id === id);
      return base44.entities.Sequence.create({
        seller_id: lead.seller_id,
        seller_name: lead.seller_name,
        lead_id: id,
        sequence_type: 'nurture',
        channel: 'whatsapp',
        step_number: 1,
        total_steps: 4,
        status: 'active',
        next_send_at: new Date(Date.now() + 86400000).toISOString()
      });
    }));
    await Promise.all(ids.map((id) => logAudit({
      action: 'lead_added_to_sequence',
      entity_type: 'Lead',
      entity_id: id,
      entity_name: (leads.find((l) => l.id === id) || {}).seller_name,
      summary: 'Enrolled in a 4-step WhatsApp nurture sequence'
    })));
    const fresh = await base44.entities.Sequence.list('-last_sent_at', 500);
    setSequences(fresh);
    setSelected([]);
    setBusy(false);
    toast({ title: `${ids.length} lead(s) added to nurture sequence` });
  };

  const disqualify = async (ids) => {
    setBusy(true);
    toast({ title: `Disqualifying ${ids.length} lead(s)…` });
    await base44.entities.Lead.bulkUpdate(ids.map((id) => ({ id, stage: 'disqualified', disqualify_reason: 'Manually disqualified from MQL inbox' })));
    await Promise.all(ids.map((id) => logAudit({
      action: 'lead_disqualified',
      entity_type: 'Lead',
      entity_id: id,
      entity_name: (leads.find((l) => l.id === id) || {}).seller_name,
      summary: 'Manually disqualified from MQL inbox',
      before_value: 'mql',
      after_value: 'disqualified'
    })));
    setLeads((ls) => ls.filter((l) => !ids.includes(l.id)));
    setSelected((s) => s.filter((x) => !ids.includes(x)));
    setBusy(false);
    toast({ title: `${ids.length} lead(s) disqualified` });
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-base font-semibold text-slate-900">MQL Inbox</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <Switch checked={groupBySource} onCheckedChange={setGroupBySource} />
            Group by source
          </label>
          <ExportCsvButton filename="mql-inbox" columns={CSV_COLUMNS} rows={leads} />
        </div>
      </div>

      {groups.map(([label, rows]) => (
        <section key={label} className="space-y-2">
          {groupBySource && (
            <div className="flex items-center gap-2">
              <h2 className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label.replace(/_/g, ' ')}</h2>
              <span className="text-[11px] text-slate-400 tabular-nums">{rows.length}</span>
            </div>
          )}
          <MqlTable
            leads={rows}
            sequences={sequences}
            selected={selected}
            onToggle={toggle}
            onToggleAll={() => toggleAll(rows)}
            onQueue={queue}
            onDisqualify={disqualify}
          />
        </section>
      ))}

      <MqlBulkBar
        count={selected.length}
        busy={busy}
        onClear={() => setSelected([])}
        onQueue={() => queue(selected)}
        onSequence={() => addToSequence(selected)}
        onDisqualify={() => disqualify(selected)}
      />
    </div>
  );
}
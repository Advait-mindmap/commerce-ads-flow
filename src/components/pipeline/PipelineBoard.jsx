import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import PipelineCard from '@/components/pipeline/PipelineCard';
import LeadCard from '@/components/pipeline/LeadCard';
import { inr } from '@/lib/format';

/*
 * One board for the whole journey. Leads occupy the early columns and
 * opportunities the later ones, because a lead has no package or value yet and
 * an opportunity always does — they are different records, not one record with
 * a longer stage list.
 *
 * Droppable and draggable ids carry their kind ("lead:mql", "opp:proposed") so
 * a drop knows what it is holding and which side of the board it landed on.
 */
export const LEAD_STAGES = [
  { key: 'nurture', label: 'Nurture' },
  { key: 'mql', label: 'MQL' },
  { key: 'sql', label: 'SQL' }
];

export const OPP_STAGES = [
  { key: 'proposed', label: 'Proposed' },
  { key: 'negotiating', label: 'Negotiating' },
  { key: 'verbal', label: 'Verbal' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' }
];

// Kept for callers that still import the old name.
export const STAGES = OPP_STAGES;

export default function PipelineBoard({
  opportunities,
  leads = [],
  onOpen,
  onOpenLead,
  onMove,
  onMoveLead,
  onConvert
}) {
  const handleDragEnd = (res) => {
    if (!res.destination || res.destination.droppableId === res.source.droppableId) return;

    const [kind, id] = res.draggableId.split(':');
    const [destKind, destStage] = res.destination.droppableId.split(':');

    if (kind === 'lead') {
      // Into another lead column: a plain stage change.
      if (destKind === 'lead') return onMoveLead(id, destStage);
      // Into the deal side: the lead becomes an opportunity, which is a real
      // conversion rather than a relabelling.
      return onConvert(id, destStage);
    }

    // An opportunity cannot go back to being a lead — the deal record already
    // exists, and un-creating it would lose the package and value on it.
    if (destKind === 'lead') return onMove(null, null, 'no-downgrade');
    return onMove(id, destStage);
  };

  const column = (stage, kind, rows, subtitle, body) => (
    <div key={`${kind}:${stage.key}`} className="bg-slate-50 border border-slate-200 rounded-lg">
      <div className="px-3 py-2.5 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-slate-900">{stage.label}</span>
          <span className="text-[11px] text-slate-500 tabular-nums">{rows.length}</span>
        </div>
        <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">{subtitle}</div>
      </div>
      <Droppable droppableId={`${kind}:${stage.key}`}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`p-2 space-y-2 min-h-[120px] ${snapshot.isDraggingOver ? 'bg-blue-50' : ''}`}
          >
            {body(rows)}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="space-y-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1.5">
            Leads · drag right to open a deal
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
            {LEAD_STAGES.map((stage) => {
              const rows = leads.filter((l) => l.stage === stage.key);
              return column(
                stage,
                'lead',
                rows,
                rows.length ? `${rows.filter((l) => l.sla_status === 'breached').length} past SLA` : '—',
                (list) => list.map((l, i) => (
                  <Draggable key={l.id} draggableId={`lead:${l.id}`} index={i}>
                    {(dp, ds) => (
                      <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps}>
                        <LeadCard lead={l} dragging={ds.isDragging} onClick={() => onOpenLead && onOpenLead(l)} />
                      </div>
                    )}
                  </Draggable>
                ))
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1.5">
            Opportunities
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3 items-start">
            {OPP_STAGES.map((stage) => {
              const rows = opportunities.filter((o) => o.stage === stage.key);
              const total = rows.reduce((a, o) => a + (o.total_value || 0), 0);
              return column(
                stage,
                'opp',
                rows,
                inr(total),
                (list) => list.map((o, i) => (
                  <Draggable key={o.id} draggableId={`opp:${o.id}`} index={i}>
                    {(dp, ds) => (
                      <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps}>
                        <PipelineCard opp={o} dragging={ds.isDragging} onClick={() => onOpen(o)} />
                      </div>
                    )}
                  </Draggable>
                ))
              );
            })}
          </div>
        </div>
      </div>
    </DragDropContext>
  );
}

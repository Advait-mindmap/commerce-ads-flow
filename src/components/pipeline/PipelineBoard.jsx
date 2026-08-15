import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import PipelineCard from '@/components/pipeline/PipelineCard';
import { inr } from '@/lib/format';

export const STAGES = [
  { key: 'proposed', label: 'Proposed' },
  { key: 'negotiating', label: 'Negotiating' },
  { key: 'verbal', label: 'Verbal' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' }
];

export default function PipelineBoard({ opportunities, onOpen, onMove }) {
  return (
    <DragDropContext
      onDragEnd={(res) => {
        if (!res.destination || res.destination.droppableId === res.source.droppableId) return;
        onMove(res.draggableId, res.destination.droppableId);
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3 items-start">
        {STAGES.map((stage) => {
          const rows = opportunities.filter((o) => o.stage === stage.key);
          const total = rows.reduce((a, o) => a + (o.total_value || 0), 0);
          return (
            <div key={stage.key} className="bg-slate-50 border border-slate-200 rounded-lg">
              <div className="px-3 py-2.5 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-slate-900">{stage.label}</span>
                  <span className="text-[11px] text-slate-500 tabular-nums">{rows.length}</span>
                </div>
                <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">{inr(total)}</div>
              </div>
              <Droppable droppableId={stage.key}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`p-2 space-y-2 min-h-[120px] ${snapshot.isDraggingOver ? 'bg-blue-50' : ''}`}
                  >
                    {rows.map((o, i) => (
                      <Draggable key={o.id} draggableId={o.id} index={i}>
                        {(dp, ds) => (
                          <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps}>
                            <PipelineCard opp={o} dragging={ds.isDragging} onClick={() => onOpen(o)} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
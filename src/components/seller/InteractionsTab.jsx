import React from 'react';
import { Link } from 'react-router-dom';
import Panel from '@/components/common/Panel';
import SentimentBar from '@/components/common/SentimentBar';
import { dateTime, mmss } from '@/lib/format';

export default function InteractionsTab({ interactions }) {
  return (
    <Panel title="Interaction timeline">
      <div className="space-y-0">
        {interactions.map((i, idx) => (
          <div key={i.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="w-2 h-2 rounded-full bg-blue-800 mt-1.5" />
              {idx < interactions.length - 1 && <span className="w-px flex-1 bg-slate-200" />}
            </div>
            <div className="pb-4 flex-1">
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                <span className="uppercase tracking-wide border border-slate-200 bg-slate-50 rounded px-1.5 py-0.5">{(i.channel || '').replace(/_/g, ' ')}</span>
                <span>{i.actor_name} ({(i.actor_type || '').replace(/_/g, ' ')})</span>
                <span>·</span>
                <span className="tabular-nums">{dateTime(i.started_at)}</span>
                {i.duration_sec ? <span className="tabular-nums">{mmss(i.duration_sec)}</span> : null}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[13px] text-slate-900">{(i.outcome || '').replace(/_/g, ' ')}</span>
                <SentimentBar value={i.sentiment_score} />
              </div>
              <p className="text-[13px] text-slate-700 mt-1">{i.summary}</p>
              {i.agent_run_id && <Link to={`/sdr/calls/${i.agent_run_id}`} className="text-[11px] text-blue-800 hover:underline">View call detail</Link>}
            </div>
          </div>
        ))}
        {interactions.length === 0 && <p className="text-xs text-slate-500">No interactions recorded.</p>}
      </div>
    </Panel>
  );
}
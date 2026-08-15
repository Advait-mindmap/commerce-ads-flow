import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { transcriptToText, stripFences } from '../../shared/bolna.ts';

const SYSTEM_PROMPT =
  "You extract structured data from Indian B2B ad-sales call transcripts. Transcripts may be English, Hindi, Hinglish, or Devanagari. Extract accurately across any language mix. Number rules: '2 lakh' or 'do lakh' = 200000, '50 hazaar' = 50000, 'pachas hazaar' = 50000. Return ONLY valid JSON, no markdown, no backticks, no preamble.";

const ESCALATION_TYPES = ['pricing_question', 'roas_guarantee_request', 'contract_terms'];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { agent_run_id } = body;
    if (!agent_run_id) return Response.json({ error: 'agent_run_id is required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const run = await svc.entities.AgentRun.get(agent_run_id);
    if (!run) return Response.json({ error: 'AgentRun not found' }, { status: 404 });

    const text = transcriptToText(run.transcript);
    if (!text) return Response.json({ error: 'AgentRun has no transcript to extract from' }, { status: 400 });

    const userPrompt = `${SYSTEM_PROMPT}

Transcript:
${text}

Return exactly this JSON shape:
{
  "is_decision_maker": boolean or null,
  "decision_maker_name": string or null,
  "currently_advertising": [platform names],
  "budget_band_stated": string or null,
  "timeline": "immediate" | "this_month" | "next_quarter" | "exploring" | "none",
  "pain_confirmed": boolean,
  "pain_description": string or null,
  "qualified": boolean,
  "confidence": number between 0 and 1,
  "objections": [{ "objection_type": string, "verbatim": string, "agent_response": string, "resolved": boolean }],
  "guardrail_events": [{ "type": string, "trigger_verbatim": string, "action": string }],
  "overall_sentiment": number between -1 and 1,
  "talk_ratio": number,
  "summary": string (2 sentences max),
  "meeting_booked": boolean,
  "meeting_datetime": ISO string or null
}
objection_type must be one of: no_budget, already_advertising, tried_before_failed, not_decision_maker, too_busy, need_approval, price_too_high, dont_trust_roi
guardrail_events type must be one of: pricing_question, roas_guarantee_request, contract_terms, competitor_comparison`;

    const raw = await svc.integrations.Core.InvokeLLM({ prompt: userPrompt });

    let extracted;
    try {
      extracted = typeof raw === 'string' ? JSON.parse(stripFences(raw)) : raw;
    } catch (_e) {
      const cleaned = stripFences(String(raw));
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end === -1) return Response.json({ error: 'LLM returned unparseable output', raw }, { status: 502 });
      extracted = JSON.parse(cleaned.slice(start, end + 1));
    }

    const confidence = typeof extracted.confidence === 'number' ? extracted.confidence : 0;
    const fieldsNeedingVerification = [];
    if (confidence < 0.6) {
      ['is_decision_maker', 'budget_band_stated', 'timeline', 'pain_confirmed', 'qualified'].forEach((f) => {
        if (extracted[f] === null || extracted[f] === undefined || confidence < 0.6) fieldsNeedingVerification.push(f);
      });
    }

    const guardrails = Array.isArray(extracted.guardrail_events) ? extracted.guardrail_events : [];
    const breach = guardrails.find((g) => ESCALATION_TYPES.includes(g.type));

    let escalation = { triggered: false };
    let status = run.status;
    if (breach) {
      const reps = await svc.entities.Rep.filter({ status: 'available' });
      const pool = reps.length ? reps : await svc.entities.Rep.list(null, 10);
      const assigned = pool.sort((a, b) => (a.current_load || 0) - (b.current_load || 0))[0];
      escalation = {
        triggered: true,
        trigger_type: breach.type,
        trigger_verbatim: breach.trigger_verbatim || '',
        assigned_rep: assigned ? assigned.name : null,
        status: 'open'
      };
      status = 'escalated';
    }

    await svc.entities.AgentRun.update(run.id, {
      status,
      outcome: extracted.meeting_booked ? 'meeting_booked' : breach ? 'escalated' : extracted.qualified ? 'qualified' : 'not_qualified',
      transcript_summary: extracted.summary || null,
      overall_sentiment: typeof extracted.overall_sentiment === 'number' ? extracted.overall_sentiment : null,
      talk_ratio: typeof extracted.talk_ratio === 'number' ? extracted.talk_ratio : null,
      qualification: {
        is_decision_maker: extracted.is_decision_maker,
        decision_maker_name: extracted.decision_maker_name,
        currently_advertising: extracted.currently_advertising || [],
        budget_band_stated: extracted.budget_band_stated,
        timeline: extracted.timeline,
        pain_confirmed: !!extracted.pain_confirmed,
        pain_description: extracted.pain_description,
        qualified: !!extracted.qualified,
        confidence,
        fields_needing_verification: fieldsNeedingVerification
      },
      objections: Array.isArray(extracted.objections) ? extracted.objections : [],
      guardrail_events: guardrails,
      escalation
    });

    if (extracted.meeting_booked && run.lead_id) {
      await svc.entities.Lead.update(run.lead_id, {
        meeting_scheduled_at: extracted.meeting_datetime || new Date().toISOString(),
        meeting_status: 'booked',
        meeting_booked_by: 'agent',
        stage: 'sql',
        sql_at: new Date().toISOString()
      });
    }

    return Response.json({ ...extracted, fields_needing_verification: fieldsNeedingVerification, escalation });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
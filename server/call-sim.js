/**
 * AI SDR call generation and qualification extraction.
 *
 * No Bolna credentials are wired up (BOLNA_API_KEY is unset), so calls are
 * simulated locally rather than placed over the wire. Everything downstream of
 * the call — the suppression gate, the AgentRun lifecycle, transcript
 * rendering, extraction, guardrails and escalation — is real and runs against
 * the database, so the screens behave exactly as they would with a live
 * provider. Swapping in the real dialer means replacing placeCall() only.
 */

import { makeRng } from './rng.js';
import { inrShort } from './format.js';

export const SCRIPT_VARIANTS = ['v3_signal_open', 'v2_benefit_open', 'v1_control'];

const LANGUAGES = ['en-IN', 'hi-IN', 'en-IN', 'mr-IN', 'en-IN'];

/** Opening line cites the seller's own numbers — the core pitch in SPEC.md. */
function opener(seller, variant) {
  const decline = Math.round((seller.organic_impr_decline || 0) * 100);
  const positions = Math.round(seller.position_loss_90d || 0);
  if (variant === 'v1_control') {
    return `Hello, this is Meera calling from the marketplace seller growth team. Is this a good time to talk about advertising options for ${seller.display_name}?`;
  }
  if (variant === 'v2_benefit_open') {
    return `Hi, this is Meera from the marketplace seller growth team. I work with ${seller.category.toLowerCase()} sellers on getting their listings back in front of buyers. Do you have two minutes?`;
  }
  return `Hi, this is Meera from the marketplace seller growth team. I was looking at ${seller.display_name}'s account — your organic impressions are down about ${decline} percent this month and your average search position has slipped ${positions} places in the last quarter. Is that showing up in your orders?`;
}

const SCENARIOS = [
  ['meeting_booked', 22],
  ['qualified_no_meeting', 12],
  ['callback', 12],
  ['pricing_escalation', 10],
  ['not_interested', 17],
  ['no_answer', 19],
  ['gatekeeper', 8]
];

function turn(role, content, at, sentiment) {
  return { role, content, timestamp_sec: at, sentiment: Number(sentiment.toFixed(2)) };
}

/**
 * Produces the full AgentRun payload for one call.
 * `seller` and `lead` are the seeded records; `rng` keeps it reproducible.
 */
export function buildCall({ seller, lead, rng, startedAt, scriptVariant, forceScenario }) {
  const r = rng || makeRng(`call-${seller.id}`);
  const variant = scriptVariant || r.pick(SCRIPT_VARIANTS);
  const scenario = forceScenario || r.weighted(SCENARIOS);
  const decline = Math.round((seller.organic_impr_decline || 0) * 100);
  const language = r.pick(LANGUAGES);
  const budgetTarget = seller.budget_target || 0;

  if (scenario === 'no_answer') {
    const duration = r.int(4, 14);
    return {
      scenario,
      script_variant: variant,
      language,
      status: 'completed',
      outcome: 'no_answer',
      duration_sec: duration,
      cost_usd: Number((duration * 0.0016).toFixed(4)),
      transcript: [],
      objections: [],
      guardrail_events: [],
      qualification: null,
      overall_sentiment: 0,
      talk_ratio: 1,
      signature_verified: true,
      escalation: null,
      started_at: startedAt
    };
  }

  const turns = [];
  let at = 0;
  const step = (min, max) => { at += r.int(min, max); return at; };

  turns.push(turn('assistant', opener(seller, variant), 0, 0.1));

  if (scenario === 'gatekeeper') {
    turns.push(turn('user', 'Sir is not available right now. I only handle the packing side, I cannot talk about this.', step(6, 10), -0.05));
    turns.push(turn('assistant', 'Understood, no problem at all. When would be a good time to reach the person who handles the online listings?', step(4, 7), 0.15));
    turns.push(turn('user', 'Try after seven in the evening, my brother handles all of that.', step(5, 9), 0.05));
    turns.push(turn('assistant', 'Perfect, I will call back after seven. Thank you for your time.', step(3, 6), 0.3));
    const duration = at + r.int(2, 6);
    return {
      scenario,
      script_variant: variant,
      language,
      status: 'completed',
      outcome: 'callback_requested',
      duration_sec: duration,
      cost_usd: Number((duration * 0.0016).toFixed(4)),
      transcript: turns,
      objections: [],
      guardrail_events: [],
      qualification: null,
      overall_sentiment: 0.1,
      talk_ratio: 0.48,
      signature_verified: true,
      escalation: null,
      started_at: startedAt
    };
  }

  // Pain discovery — the seller confirms or denies the traffic drop.
  const painConfirmed = scenario !== 'not_interested' ? r.bool(0.88) : r.bool(0.35);
  if (painConfirmed) {
    turns.push(turn('user', `Yes, actually the orders have dropped quite a lot in the last two months. Earlier we were doing good numbers, now the same listings are not showing up. I was wondering what changed.`, step(7, 12), -0.3));
    turns.push(turn('assistant', `That matches what I am seeing. Your catalog has grown — ${seller.sku_added_30d || 0} new SKUs in the last month — but the category has got more competitive, so the free visibility is spreading thinner. Are you running any paid promotion at the moment, on the marketplace or outside?`, step(6, 10), 0.05));
  } else {
    turns.push(turn('user', 'Not really, business is more or less the same. We are managing.', step(6, 10), -0.05));
    turns.push(turn('assistant', `Got it. The reason I called is your organic impressions are down about ${decline} percent — that usually shows up in orders a few weeks later. Are you advertising anywhere currently?`, step(5, 9), 0.05));
  }

  // Current ad platforms.
  const advertising = r.weighted([
    [[], 45],
    [['Google Ads'], 20],
    [['Meta Ads'], 18],
    [['Google Ads', 'Meta Ads'], 10],
    [['Marketplace Ads'], 7]
  ]);
  if (advertising.length) {
    turns.push(turn('user', `We tried ${advertising.join(' and ')} for some time. Honestly the results were not great, we spent money but conversions did not come. That is why we stopped.`, step(7, 12), -0.2));
    turns.push(turn('assistant', 'That is a common experience with off-platform ads for marketplace sellers — the buyer intent is much lower there. On-platform placement puts you in front of people already searching for your category. Who takes the decision on marketing spend at your end?', step(6, 10), 0.15));
  } else {
    turns.push(turn('user', 'No, we have never done any advertising. We were always getting orders on our own.', step(6, 10), 0.0));
    turns.push(turn('assistant', 'That is exactly why the drop is being felt now. Before we go further — are you the person who decides on marketing spend, or is there someone else involved?', step(5, 9), 0.15));
  }

  // Decision maker.
  const isDecisionMaker = r.bool(0.72);
  if (isDecisionMaker) {
    turns.push(turn('user', 'Yes, I handle everything for the online business myself.', step(4, 8), 0.2));
  } else {
    turns.push(turn('user', 'My brother handles the final decision on spending, but I manage the listings day to day.', step(5, 9), 0.05));
  }

  const objections = [];
  const guardrails = [];
  let escalation = null;

  if (scenario === 'pricing_escalation') {
    // A direct price question. The agent must deflect — never quote a number.
    turns.push(turn('user', 'Okay but just tell me straight, what is the cost? How much per month will this come to, and what return can you guarantee me?', step(6, 10), -0.15));
    guardrails.push({
      type: 'pricing_question',
      at_sec: at,
      action: 'agent deflected to specialist, escalation logged',
      verbatim: 'what is the cost? How much per month will this come to'
    });
    guardrails.push({
      type: 'roas_guarantee_request',
      at_sec: at,
      action: 'agent declined to guarantee a return',
      verbatim: 'what return can you guarantee me'
    });
    turns.push(turn('assistant', 'I am not the right person to quote pricing, and I would not want to promise a return I cannot stand behind — that depends on your category and your listings. What I can do is set up twenty minutes with a specialist who will walk you through the actual numbers for your account.', step(6, 10), 0.0));
    turns.push(turn('user', 'Fine, but I do not want a long sales pitch. Twenty minutes maximum.', step(5, 9), -0.05));
    objections.push({
      objection_type: 'price_sensitivity',
      verbatim: 'just tell me straight, what is the cost?',
      agent_response: 'Deflected to the specialist call rather than quoting a number.',
      resolved: true
    });
    escalation = {
      triggered: true,
      trigger_type: 'pricing_question',
      trigger_verbatim: 'what is the cost? How much per month will this come to',
      status: 'open',
      assigned_rep: null,
      raised_at: new Date(new Date(startedAt).getTime() + at * 1000).toISOString()
    };
  }

  if (scenario === 'not_interested') {
    turns.push(turn('user', 'See, I am not interested in advertising right now. We have tried this before and it did not work. Please do not call me again about this.', step(6, 11), -0.55));
    turns.push(turn('assistant', 'I completely understand, and I am sorry to have taken your time. I will remove you from this outreach list. If things change you can always reach us through the seller dashboard.', step(4, 8), -0.1));
    objections.push({
      objection_type: 'tried_before_failed',
      verbatim: 'We have tried this before and it did not work',
      agent_response: 'Acknowledged and closed the call without pushing.',
      resolved: false
    });
  }

  // Budget and timeline for the paths that continue.
  let budgetStated = null;
  let timeline = null;
  if (['meeting_booked', 'qualified_no_meeting', 'pricing_escalation', 'callback'].includes(scenario)) {
    const low = Math.round(budgetTarget * 0.7);
    const high = Math.round(budgetTarget * 1.25);
    budgetStated = `${inrShort(low)}–${inrShort(high)} per month`;
    turns.push(turn('assistant', 'Roughly, what kind of monthly budget would you be comfortable testing with — not a commitment, just a range?', step(5, 9), 0.15));
    turns.push(turn('user', `See, I can start small. Maybe around ${inrShort(low)} to ${inrShort(high)} a month to test. If it works we can increase.`, step(6, 10), 0.15));

    timeline = r.weighted([['this_month', 40], ['next_month', 35], ['this_quarter', 18], ['no_timeline', 7]]);
    turns.push(turn('assistant', 'And if the numbers make sense, when would you look to start?', step(4, 7), 0.2));
    const timelineSaid = {
      this_month: 'If it looks good we can start this month itself.',
      next_month: 'Next month, after this festive stock clears.',
      this_quarter: 'Sometime this quarter, not immediately.',
      no_timeline: 'I cannot say right now, let me see.'
    }[timeline];
    turns.push(turn('user', timelineSaid, step(4, 8), timeline === 'no_timeline' ? -0.05 : 0.25));
  }

  if (scenario === 'callback') {
    turns.push(turn('user', 'Actually I am in the middle of something, can you call me back tomorrow around the same time?', step(5, 9), 0.05));
    turns.push(turn('assistant', 'Of course, I will call back tomorrow. Thank you for your time.', step(3, 6), 0.2));
    objections.push({
      objection_type: 'no_time',
      verbatim: 'I am in the middle of something, can you call me back',
      agent_response: 'Agreed to call back at the requested time.',
      resolved: true
    });
  }

  let meetingBooked = false;
  if (scenario === 'meeting_booked' || scenario === 'pricing_escalation') {
    turns.push(turn('assistant', 'Let me book you twenty minutes with a specialist who handles your category. Would tomorrow around 4 PM work, or is a later slot easier?', step(5, 9), 0.3));
    turns.push(turn('user', 'Tomorrow four is fine. Send me the details on WhatsApp.', step(4, 8), 0.4));
    turns.push(turn('assistant', 'Done — you will get the confirmation on WhatsApp shortly. Thank you for your time, and all the best with the festive season.', step(3, 6), 0.45));
    meetingBooked = true;
  } else if (scenario === 'qualified_no_meeting') {
    turns.push(turn('assistant', 'This sounds like a good fit. Let me send you a short summary on WhatsApp, and a specialist will follow up to find a slot that works.', step(5, 8), 0.3));
    turns.push(turn('user', 'Okay, send it. I will look at it and let you know.', step(4, 7), 0.2));
    objections.push({
      objection_type: 'need_approval',
      verbatim: 'I will look at it and let you know',
      agent_response: 'Agreed to send a written summary before booking.',
      resolved: false
    });
  }

  const duration = at + r.int(3, 9);
  const sentiments = turns.map((t) => t.sentiment);
  const overall = sentiments.reduce((a, b) => a + b, 0) / (sentiments.length || 1);
  const agentChars = turns.filter((t) => t.role === 'assistant').reduce((a, t) => a + t.content.length, 0);
  const totalChars = turns.reduce((a, t) => a + t.content.length, 0) || 1;

  const outcome = meetingBooked
    ? 'meeting_booked'
    : scenario === 'qualified_no_meeting'
      ? 'qualified'
      : scenario === 'callback'
        ? 'callback_requested'
        : scenario === 'not_interested'
          ? 'not_interested'
          : 'not_qualified';

  return {
    scenario,
    script_variant: variant,
    language,
    status: 'completed',
    // A booked meeting wins the outcome field even when a guardrail also fired:
    // the escalation stays visible on `escalation.triggered`, and the SDR
    // console counts escalations from that flag, so nothing is lost — while the
    // lead's booked meeting keeps a matching meeting_booked run behind it.
    outcome: meetingBooked ? 'meeting_booked' : escalation ? 'escalated' : outcome,
    duration_sec: duration,
    cost_usd: Number((duration * 0.0016 + 0.012).toFixed(4)),
    transcript: turns,
    objections,
    guardrail_events: guardrails,
    overall_sentiment: Number(overall.toFixed(2)),
    talk_ratio: Number((agentChars / totalChars).toFixed(2)),
    signature_verified: true,
    escalation,
    meeting_booked: meetingBooked,
    qualification: buildQualification({ turns, isDecisionMaker, advertising, budgetStated, timeline, painConfirmed, meetingBooked, scenario }),
    started_at: startedAt
  };
}

function buildQualification({ isDecisionMaker, advertising, budgetStated, timeline, painConfirmed, meetingBooked, scenario }) {
  if (scenario === 'not_interested') {
    return {
      is_decision_maker: isDecisionMaker,
      currently_advertising: advertising,
      budget_band_stated: null,
      timeline: 'no_timeline',
      pain_confirmed: painConfirmed,
      qualified: false,
      confidence: 0.82,
      pain_description: 'Seller declined outreach and asked not to be contacted again.',
      fields_needing_verification: []
    };
  }
  const qualified = Boolean(isDecisionMaker && painConfirmed && budgetStated && timeline && timeline !== 'no_timeline');
  const needsVerify = [];
  if (!isDecisionMaker) needsVerify.push('is_decision_maker');
  if (!budgetStated) needsVerify.push('budget_band_stated');
  if (timeline === 'no_timeline') needsVerify.push('timeline');
  return {
    is_decision_maker: isDecisionMaker,
    decision_maker_name: isDecisionMaker ? null : 'Brother (co-owner)',
    currently_advertising: advertising,
    budget_band_stated: budgetStated,
    timeline: timeline || 'no_timeline',
    pain_confirmed: painConfirmed,
    qualified: qualified || meetingBooked,
    confidence: Number((0.62 + (isDecisionMaker ? 0.12 : 0) + (budgetStated ? 0.12 : 0) + (painConfirmed ? 0.08 : 0)).toFixed(2)),
    pain_description: painConfirmed
      ? 'Seller confirmed a drop in orders consistent with the organic impression decline on their account.'
      : 'Seller did not confirm any commercial pain on the call.',
    fields_needing_verification: needsVerify
  };
}

/* ------------------------------------------------------------------ *
 * Extraction
 *
 * Re-derives the structured qualification from the transcript text using
 * rule-based matching, rather than reading back what the generator stored.
 * That keeps "Extract qualification" an operation that genuinely reads the
 * turns, and it is what a real LLM pass would be swapped in for.
 * ------------------------------------------------------------------ */

const OBJECTION_PATTERNS = [
  { type: 'price_sensitivity', re: /(what is the cost|how much|too expensive|costly|price)/i, response: 'Deflected to the specialist call rather than quoting a number.' },
  { type: 'tried_before_failed', re: /(tried this before|did not work|results were not great|spent money but)/i, response: 'Acknowledged the prior experience and reframed on-platform intent.' },
  { type: 'no_time', re: /(call me back|middle of something|not a good time|busy right now)/i, response: 'Agreed to call back at the requested time.' },
  { type: 'need_approval', re: /(let me know|my brother|discuss with|check with|think about it)/i, response: 'Offered a written summary for the decision maker.' },
  { type: 'not_interested', re: /(not interested|do not call|stop calling|remove me)/i, response: 'Closed the call and flagged for suppression.' }
];

const PLATFORM_PATTERNS = [
  { label: 'Google Ads', re: /google/i },
  { label: 'Meta Ads', re: /(meta|facebook|instagram)/i },
  { label: 'Marketplace Ads', re: /marketplace ads/i }
];

export function extractFromTranscript(turns = []) {
  const sellerTurns = turns.filter((t) => t.role === 'user');
  const sellerText = sellerTurns.map((t) => t.content).join(' ');
  const allText = turns.map((t) => t.content).join(' ');

  if (!sellerTurns.length) {
    return {
      qualification: {
        is_decision_maker: false,
        currently_advertising: [],
        budget_band_stated: null,
        timeline: 'no_timeline',
        pain_confirmed: false,
        qualified: false,
        confidence: 0.2,
        pain_description: 'No seller speech on this call — nothing to extract.',
        fields_needing_verification: ['is_decision_maker', 'budget_band_stated', 'timeline']
      },
      objections: [],
      guardrail_events: [],
      overall_sentiment: 0,
      talk_ratio: 1
    };
  }

  const isDecisionMaker = /(i handle|i manage|i decide|myself|i take.*decision)/i.test(sellerText)
    && !/(brother|owner|sir|boss).{0,40}(handles|decides|takes)/i.test(sellerText);
  const decisionMakerName = isDecisionMaker ? null : (/(brother|partner|owner)/i.exec(sellerText)?.[1] || null);

  const currently_advertising = PLATFORM_PATTERNS.filter((p) => p.re.test(sellerText)).map((p) => p.label);

  const budgetMatch = /(₹[\d,.]+\s*[KLCr]*(?:\s*[–-]\s*₹?[\d,.]+\s*[KLCr]*)?)/i.exec(sellerText);
  const budget_band_stated = budgetMatch ? `${budgetMatch[1]} per month` : null;

  let timeline = 'no_timeline';
  if (/this month/i.test(sellerText)) timeline = 'this_month';
  else if (/next month/i.test(sellerText)) timeline = 'next_month';
  else if (/quarter/i.test(sellerText)) timeline = 'this_quarter';

  const pain_confirmed = /(orders have dropped|dropped quite a lot|not showing up|business is down|sales are down|drop)/i.test(sellerText);

  const objections = OBJECTION_PATTERNS
    .filter((p) => p.re.test(sellerText))
    .map((p) => ({
      objection_type: p.type,
      verbatim: (sellerTurns.find((t) => p.re.test(t.content)) || {}).content || '',
      agent_response: p.response,
      resolved: p.type !== 'tried_before_failed' && p.type !== 'not_interested'
    }));

  const guardrail_events = [];
  const priceTurn = sellerTurns.find((t) => /(what is the cost|how much per month|tell me the price)/i.test(t.content));
  if (priceTurn) {
    guardrail_events.push({
      type: 'pricing_question',
      at_sec: priceTurn.timestamp_sec,
      action: 'agent deflected to specialist, escalation logged',
      verbatim: priceTurn.content
    });
  }
  const guaranteeTurn = sellerTurns.find((t) => /(guarantee|assured return|how much return)/i.test(t.content));
  if (guaranteeTurn) {
    guardrail_events.push({
      type: 'roas_guarantee_request',
      at_sec: guaranteeTurn.timestamp_sec,
      action: 'agent declined to guarantee a return',
      verbatim: guaranteeTurn.content
    });
  }
  const contractTurn = sellerTurns.find((t) => /(contract|agreement|lock in|terms)/i.test(t.content));
  if (contractTurn) {
    guardrail_events.push({
      type: 'contract_terms',
      at_sec: contractTurn.timestamp_sec,
      action: 'agent referred contract terms to the specialist',
      verbatim: contractTurn.content
    });
  }

  const meetingBooked = /(tomorrow four is fine|send me the details|book you twenty minutes)/i.test(allText);
  const qualified = Boolean(isDecisionMaker && pain_confirmed && budget_band_stated && timeline !== 'no_timeline') || meetingBooked;

  const fields_needing_verification = [];
  if (!isDecisionMaker) fields_needing_verification.push('is_decision_maker');
  if (!budget_band_stated) fields_needing_verification.push('budget_band_stated');
  if (timeline === 'no_timeline') fields_needing_verification.push('timeline');

  const sentiments = turns.map((t) => Number(t.sentiment) || 0);
  const agentChars = turns.filter((t) => t.role === 'assistant').reduce((a, t) => a + t.content.length, 0);
  const totalChars = turns.reduce((a, t) => a + t.content.length, 0) || 1;

  return {
    qualification: {
      is_decision_maker: isDecisionMaker,
      decision_maker_name: decisionMakerName,
      currently_advertising,
      budget_band_stated,
      timeline,
      pain_confirmed,
      qualified,
      confidence: Number((0.55 + (isDecisionMaker ? 0.14 : 0) + (budget_band_stated ? 0.14 : 0) + (pain_confirmed ? 0.1 : 0)).toFixed(2)),
      pain_description: pain_confirmed
        ? 'Seller confirmed a drop in orders consistent with the organic impression decline on their account.'
        : 'Seller did not confirm commercial pain on this call.',
      fields_needing_verification
    },
    objections,
    guardrail_events,
    meeting_booked: meetingBooked,
    overall_sentiment: Number((sentiments.reduce((a, b) => a + b, 0) / (sentiments.length || 1)).toFixed(2)),
    talk_ratio: Number((agentChars / totalChars).toFixed(2))
  };
}

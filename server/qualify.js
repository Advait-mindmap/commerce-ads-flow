/**
 * Reading a sales call with Claude.
 *
 * The keyword extractor in call-sim.js was written against transcripts this
 * app generated itself, so it only recognises the phrasings it was taught. Real
 * sellers answer in two words, switch between Hindi, Gujarati and English
 * mid-sentence, and say "haan bilkul" where the regex expects "yes". Pattern
 * matching cannot follow that, and a call it cannot read is silently recorded
 * as a seller who failed to qualify.
 *
 * So the transcript is read by a model instead. Structured outputs pin the
 * response to the exact shape the app already stores, so nothing downstream has
 * to change and there is no JSON to repair.
 *
 * The rule-based extractor stays as the fallback. If no key is configured, or
 * the call fails, or the model declines, the pipeline degrades to keywords
 * rather than losing the call — every result records which path produced it.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { extractFromTranscript } from './call-sim.js';

/*
 * Either provider can read the transcript. Anthropic is preferred when a key
 * for it exists; otherwise OpenAI. Both are pinned to the same JSON schema, so
 * the record this module returns is identical either way and nothing
 * downstream knows or cares which one read the call.
 */
const anthropicKey = () => process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
const openaiKey = () => process.env.OPENAI_API_KEY;

export const provider = () => (anthropicKey() ? 'anthropic' : (openaiKey() ? 'openai' : null));
export const isConfigured = () => Boolean(provider());

const ANTHROPIC_MODEL = process.env.QUALIFY_MODEL || 'claude-opus-5';
const OPENAI_MODEL = process.env.QUALIFY_OPENAI_MODEL || 'gpt-4o';
// A scoped extraction, not a reasoning problem. Raise to "high" if calls in a
// new language are being read poorly.
const EFFORT = process.env.QUALIFY_EFFORT || 'medium';

let anthropic = null;
let openai = null;
const getAnthropic = () => { if (!anthropic) anthropic = new Anthropic(); return anthropic; };
const getOpenAI = () => { if (!openai) openai = new OpenAI(); return openai; };

/*
 * Mirrors the shape the console and Call Detail already read. additionalProperties
 * is false throughout and every field is required, so a response is either
 * exactly this or the request fails — there is no half-populated case to guard.
 */
const SCHEMA = {
  type: 'object',
  properties: {
    qualification: {
      type: 'object',
      properties: {
        pain_confirmed: { type: 'boolean', description: 'Seller confirmed orders, sales or visibility have fallen.' },
        is_decision_maker: { type: 'boolean', description: 'This person decides marketing spend. False if someone else does.' },
        decision_maker_name: { type: 'string', description: 'Who decides instead, or empty string if this person decides.' },
        currently_advertising: {
          type: 'array',
          description: 'Platforms the seller named, e.g. Google Ads, Meta Ads, Marketplace Ads. Empty if none or not asked.',
          items: { type: 'string' }
        },
        budget_band_stated: { type: 'string', description: 'Budget in the seller\'s own words, e.g. "₹30K per month". Empty string if not stated.' },
        timeline: { type: 'string', enum: ['this_month', 'next_month', 'this_quarter', 'no_timeline'] },
        qualified: { type: 'boolean', description: 'Decision maker, confirmed pain, and either a budget or a timeline.' },
        confidence: { type: 'number', description: '0 to 1. How much the call actually established, not how sure you are of your reading.' },
        rationale: { type: 'string', description: 'One sentence, quoting the seller where it decided the verdict.' }
      },
      required: ['pain_confirmed', 'is_decision_maker', 'decision_maker_name', 'currently_advertising',
        'budget_band_stated', 'timeline', 'qualified', 'confidence', 'rationale'],
      additionalProperties: false
    },
    meeting_booked: { type: 'boolean', description: 'Seller agreed to a specific call or meeting with a specialist.' },
    meeting_time_text: { type: 'string', description: 'Time agreed, in the seller\'s words. Empty if none.' },
    objections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          objection_type: {
            type: 'string',
            enum: ['price_sensitivity', 'tried_before_failed', 'no_time', 'not_interested',
              'needs_approval', 'trust_concern', 'platform_blame', 'other']
          },
          verbatim: { type: 'string', description: 'What the seller actually said, in the original language.' }
        },
        required: ['objection_type', 'verbatim'],
        additionalProperties: false
      }
    },
    guardrail_events: {
      type: 'array',
      description: 'Where the seller pushed on price, guaranteed returns, or contract terms — the three things the agent must never commit to.',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['pricing_question', 'roas_guarantee_request', 'contract_terms'] },
          verbatim: { type: 'string' },
          agent_deflected: { type: 'boolean', description: 'True if the agent declined to answer, false if it stated a figure or made a promise.' }
        },
        required: ['type', 'verbatim', 'agent_deflected'],
        additionalProperties: false
      }
    },
    overall_sentiment: { type: 'number', description: '-1 hostile to 1 enthusiastic, judged across the call.' },
    opt_out_requested: { type: 'boolean', description: 'Seller asked not to be contacted again.' },
    language: { type: 'string', description: 'Main language spoken, e.g. Hindi, English, Gujarati, or Hindi-English mix.' },
    summary: { type: 'string', description: 'Two sentences a rep can read before calling back.' }
  },
  required: ['qualification', 'meeting_booked', 'meeting_time_text', 'objections',
    'guardrail_events', 'overall_sentiment', 'opt_out_requested', 'language', 'summary'],
  additionalProperties: false
};

const SYSTEM = `You read outbound sales calls for a marketplace's advertising team and record what the seller established.

The agent is calling sellers on the marketplace to find out whether advertising is worth a conversation. It asks five things: has the seller noticed orders slowing, do they decide marketing spend, are they advertising anywhere already, what monthly budget they would test with, and when they would start. A qualified seller decides spend, confirms the drop, and gives either a budget or a timeline.

Read what was actually said, in whatever language it was said in. These calls run in Hindi, Gujarati, Marathi and English, usually mixed together, and sellers answer briefly — "haan", "yeah I have", "ho, ghatla ahe" are all confirmations when they answer a question that was asked. Judge a short reply by the question before it.

Rules that decide the record:
- Record only what the seller said or clearly meant. Never infer a budget, a timeline or a decision maker that was not discussed.
- If a question was never asked, that field is unestablished: false, empty, or no_timeline. Do not treat "not asked" as "no".
- A seller who says they will "think about it" or "call back later" has not booked a meeting. A meeting needs an agreed time or a clear yes to a specific slot.
- Quote the seller in the original language for verbatim fields. Do not translate them.
- confidence reflects how many of the five facts the call established, not how confident you are in your reading. A call that established two of five is around 0.4 even if both were unmistakable.
- Record an objection whenever the seller gives a reason not to proceed, in any language. Past failure ("we tried Google Ads and it did not work", "paise waste hue") is tried_before_failed. Cost worry is price_sensitivity. Being busy or asked to call later is no_time. Needing someone else to agree is needs_approval. Doubt about the marketplace or the caller is trust_concern or platform_blame. Record these even when the seller stays friendly and even when the call ends well — a booked meeting does not erase the objection raised on the way there.
- Record a guardrail event whenever the seller pushes for a price, a guaranteed return, or contract terms — whether or not the agent handled it well. Set agent_deflected to false if the agent named a figure or made a promise, because that is a compliance breach someone needs to see.
- The two lists are independent, not alternatives. A seller pressing on cost is usually both a price_sensitivity objection and a pricing_question guardrail; record it in both.

If the transcript is too short or garbled to establish anything, say so in the summary and leave the fields unestablished rather than guessing.`;

/** Maps the model's reading onto the record shape the app stores. */
function toRecord(parsed, transcript, readBy) {
  const q = parsed.qualification;
  const sellerTurns = transcript.filter((t) => t.role === 'user');
  const sellerChars = sellerTurns.reduce((n, t) => n + String(t.content || '').length, 0);
  const totalChars = transcript.reduce((n, t) => n + String(t.content || '').length, 0) || 1;

  return {
    qualification: {
      pain_confirmed: q.pain_confirmed,
      is_decision_maker: q.is_decision_maker,
      decision_maker_name: q.decision_maker_name || null,
      currently_advertising: q.currently_advertising || [],
      budget_band_stated: q.budget_band_stated || null,
      timeline: q.timeline,
      qualified: q.qualified,
      confidence: Number(Math.min(1, Math.max(0, q.confidence)).toFixed(2)),
      rationale: q.rationale,
      // So a rep looking at a verdict can always tell what produced it.
      read_by: readBy
    },
    meeting_booked: parsed.meeting_booked,
    meeting_time_text: parsed.meeting_time_text || null,
    objections: parsed.objections || [],
    guardrail_events: (parsed.guardrail_events || []).map((g) => ({
      type: g.type,
      verbatim: g.verbatim,
      agent_deflected: g.agent_deflected,
      action: g.agent_deflected
        ? 'agent deflected to specialist, escalation logged'
        : 'agent answered when it should have deflected — review required'
    })),
    overall_sentiment: Number(Math.min(1, Math.max(-1, parsed.overall_sentiment)).toFixed(2)),
    // Talk ratio is arithmetic, not judgement — measure it rather than ask.
    talk_ratio: Number((1 - sellerChars / totalChars).toFixed(2)),
    opt_out_requested: parsed.opt_out_requested,
    detected_language: parsed.language,
    summary: parsed.summary
  };
}

/**
 * Reads a transcript. Never throws: on any failure the keyword extractor's
 * result is returned instead, tagged so the degradation is visible rather than
 * silent.
 */
export async function analyseTranscript(transcript = [], context = {}) {
  if (!transcript.length) return null;

  const fallback = () => {
    const rules = extractFromTranscript(transcript);
    if (rules?.qualification) rules.qualification.read_by = 'keywords';
    return rules;
  };

  if (!isConfigured()) return fallback();

  const conversation = transcript
    .map((t) => `${t.role === 'user' ? 'SELLER' : 'AGENT'}: ${String(t.content || '').trim()}`)
    .join('\n');

  const preamble = [
    context.seller_name && `Seller: ${context.seller_name}`,
    context.category && `Category: ${context.category}`,
    context.language && `Expected language: ${context.language}`
  ].filter(Boolean).join('\n');

  const prompt = `${preamble ? `${preamble}

` : ''}Transcript:

${conversation}`;
  const which = provider();

  try {
    let parsed;

    if (which === 'anthropic') {
      const response = await getAnthropic().messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: SYSTEM,
        output_config: { effort: EFFORT, format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: prompt }]
      });

      // A refusal or a truncation is a failure, not a result — check before
      // reading content, or a refusal reads as an empty transcript.
      if (response.stop_reason === 'refusal') {
        console.error('[qualify] model declined:', response.stop_details?.category || 'unknown');
        return fallback();
      }
      if (response.stop_reason === 'max_tokens') {
        console.error('[qualify] response truncated — falling back to keywords');
        return fallback();
      }
      const text = response.content.find((b) => b.type === 'text')?.text;
      if (!text) return fallback();
      parsed = JSON.parse(text);
    } else {
      const response = await getOpenAI().chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: prompt }
        ],
        // Strict mode pins the reply to the same schema the other provider is
        // given, so both produce an identical record.
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'call_reading', strict: true, schema: SCHEMA }
        }
      });

      const choice = response.choices?.[0];
      if (choice?.finish_reason === 'length') {
        console.error('[qualify] response truncated — falling back to keywords');
        return fallback();
      }
      if (choice?.message?.refusal) {
        console.error('[qualify] model declined:', choice.message.refusal);
        return fallback();
      }
      const text = choice?.message?.content;
      if (!text) return fallback();
      parsed = JSON.parse(text);
    }

    return toRecord(parsed, transcript, which);
  } catch (err) {
    console.error('[qualify] read failed, falling back to keywords:', err.message);
    return fallback();
  }
}

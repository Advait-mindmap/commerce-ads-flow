/**
 * Experimentation platform.
 *
 * Experiments are created by users, not authored in fixture data. What a user
 * supplies is the definition — name, hypothesis, unit, which metric decides the
 * result, which metrics to watch as guardrails, the sample target and the split.
 * Everything numeric is derived from records:
 *
 *   assignment  deterministic hash of (experiment_key, unit_id), so a unit's arm
 *               is reproducible and auditable with no stored randomness
 *   arms        counted from the units actually assigned
 *   conversions counted by evaluating the chosen metric against those units
 *   statistics  computed from those counts
 *
 * A metric can only be offered if it is computable from a record, which is why
 * the catalogue below is the source of truth for what the UI may offer.
 */

import crypto from 'crypto';

/* ------------------------------------------------------------------ */
/* Metric catalogue                                                    */
/* ------------------------------------------------------------------ */

/**
 * Every metric the platform can measure. `converted` is evaluated against a
 * single record of `unit` type. Adding a metric here makes it immediately
 * selectable when creating an experiment — there is no second place to edit.
 */
export const METRIC_CATALOGUE = {
  meeting_booked_rate: {
    unit: 'lead',
    label: 'Meeting booked rate',
    describes: 'A lead counts as converted once a meeting is booked on it.',
    converted: (lead) => lead.meeting_status === 'booked'
  },
  mql_to_sql_rate: {
    unit: 'lead',
    label: 'MQL → SQL rate',
    describes: 'A lead counts as converted once it reaches SQL (sql_at is stamped).',
    converted: (lead) => Boolean(lead.sql_at)
  },
  qualified_rate: {
    unit: 'lead',
    label: 'Qualified rate',
    describes: 'A lead counts as converted once it advances beyond MQL to SQL, opportunity or won.',
    converted: (lead) => ['sql', 'opportunity', 'won'].includes(lead.stage)
  },
  lead_connect_rate: {
    unit: 'lead',
    label: 'Connect rate',
    describes: 'A lead counts as converted once at least one call attempt has been made and answered.',
    converted: (lead) => (lead.agent_attempts || 0) > 0 && Boolean(lead.last_agent_contact_at)
  },
  disqualification_rate: {
    unit: 'lead',
    label: 'Disqualification rate',
    describes: 'A lead counts when it ends up disqualified. Lower is better.',
    lowerIsBetter: true,
    converted: (lead) => lead.stage === 'disqualified'
  },
  close_rate: {
    unit: 'opportunity',
    label: 'Close rate',
    describes: 'An opportunity counts as converted when its stage is won.',
    converted: (opp) => opp.stage === 'won'
  },
  proposal_view_rate: {
    unit: 'opportunity',
    label: 'Proposal view rate',
    describes: 'An opportunity counts as converted once its proposal has been viewed.',
    converted: (opp) => Boolean(opp.proposal_viewed_at)
  },
  verbal_or_better_rate: {
    unit: 'opportunity',
    label: 'Reached verbal or better',
    describes: 'An opportunity counts once it reaches verbal commitment or is won.',
    converted: (opp) => ['verbal', 'won'].includes(opp.stage)
  },
  renewal_rate: {
    unit: 'campaign',
    label: 'Retention rate',
    describes: 'A campaign counts as retained while its status remains live.',
    converted: (campaign) => campaign.status === 'live'
  },
  budget_increase_rate: {
    unit: 'campaign',
    label: 'Budget at cap rate',
    describes: 'A campaign counts once it spends at least 95% of its monthly budget.',
    converted: (campaign) => (campaign.budget_utilization || 0) >= 0.95
  },
  roas_above_promise_rate: {
    unit: 'campaign',
    label: 'ROAS above promise',
    describes: 'A campaign counts when delivered ROAS meets or beats what was promised.',
    converted: (campaign) => (campaign.roas_vs_promised || 0) >= 1
  },
  red_churn_rate: {
    unit: 'campaign',
    label: 'RED churn risk rate',
    describes: 'A campaign counts when it lands in the RED churn band. Lower is better.',
    lowerIsBetter: true,
    converted: (campaign) => campaign.churn_band === 'RED'
  }
};

export const UNIT_TYPES = ['lead', 'opportunity', 'campaign'];

/** Catalogue shape the UI renders in the metric pickers. */
export function metricCatalogue() {
  return Object.entries(METRIC_CATALOGUE).map(([key, m]) => ({
    key,
    label: m.label,
    unit: m.unit,
    describes: m.describes,
    lower_is_better: Boolean(m.lowerIsBetter)
  }));
}

// Kept as an alias so existing call sites read naturally.
export const METRIC_DEFINITIONS = METRIC_CATALOGUE;

/* ------------------------------------------------------------------ */
/* Assignment                                                          */
/* ------------------------------------------------------------------ */

/** Stable 0..1 position for a unit within an experiment. */
export function assignmentHash(experimentKey, unitId) {
  const digest = crypto.createHash('sha256').update(`${experimentKey}:${unitId}`).digest();
  return digest.readUIntBE(0, 6) / 0xffffffffffff;
}

/**
 * Which arm a unit belongs to, or null when held out of the exposed fraction.
 */
export function assignArm(experimentKey, unitId, { split = 0.5, exposure = 1 } = {}) {
  if (!unitId) return null;
  const h = assignmentHash(experimentKey, unitId);
  if (h >= exposure) return null;
  return (h / exposure) < split ? 'control' : 'treatment';
}

/** Assignment map for a unit across every running experiment of its type. */
export function assignmentsFor(unitId, unitType, experiments) {
  const out = {};
  for (const exp of experiments || []) {
    if (exp.status !== 'running') continue;
    const metric = METRIC_CATALOGUE[exp.primary_metric];
    if (!metric || metric.unit !== unitType) continue;
    const arm = assignArm(exp.experiment_key, unitId, {
      split: exp.traffic_split ?? 0.5,
      exposure: exp.exposure ?? 1
    });
    if (arm) out[exp.experiment_key] = arm;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

/** Abramowitz & Stegun normal CDF approximation. */
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/** Two-proportion z-test, two-sided. */
export function twoProportionTest(cN, cX, tN, tX) {
  if (!cN || !tN) return { z: null, p: null };
  const p1 = cX / cN;
  const p2 = tX / tN;
  const pooled = (cX + tX) / (cN + tN);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / cN + 1 / tN));
  if (!se) return { z: null, p: null };
  const z = (p2 - p1) / se;
  return { z: Number(z.toFixed(4)), p: Number(Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.abs(z))))).toFixed(4)) };
}

/**
 * Always-valid p-value via a mixture SPRT. Unlike the fixed-horizon test this
 * stays valid under repeated peeking, which is why it is the decision criterion.
 */
export function alwaysValidP(cN, cX, tN, tX, { tau2 = 0.0025 } = {}) {
  if (!cN || !tN) return null;
  const p1 = cX / cN;
  const p2 = tX / tN;
  const n = (2 * cN * tN) / (cN + tN);
  const pooled = (cX + tX) / (cN + tN);
  const s2 = Math.max(1e-9, pooled * (1 - pooled) * 2);
  const d = p2 - p1;
  const denom = s2 + n * tau2;
  const lambda = Math.sqrt(s2 / denom) * Math.exp((n * n * tau2 * d * d) / (2 * s2 * denom));
  if (!Number.isFinite(lambda) || lambda <= 0) return 1;
  return Number(Math.max(0, Math.min(1, 1 / lambda)).toFixed(4));
}

/** Sample ratio mismatch: chi-square against the intended split. */
export function srmCheck(cN, tN, split = 0.5) {
  const total = cN + tN;
  if (total < 20) return { p: null, flagged: false };
  const expectedC = total * split;
  const expectedT = total * (1 - split);
  const chi = ((cN - expectedC) ** 2) / expectedC + ((tN - expectedT) ** 2) / expectedT;
  const p = Number(Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.sqrt(chi))))).toFixed(4));
  return { p, flagged: p < 0.001 };
}

/** Relative lift with a normal-approximation confidence interval. */
export function relativeLift(cN, cX, tN, tX, z = 1.96) {
  if (!cN || !tN || !cX) return { lift: null, low: null, high: null };
  const p1 = cX / cN;
  const p2 = tX / tN;
  if (!p1) return { lift: null, low: null, high: null };
  const lift = (p2 - p1) / p1;
  const varLog = (1 - p1) / (cX || 1) + (1 - p2) / (tX || 1);
  const se = Math.sqrt(Math.max(varLog, 0));
  const ratio = p2 / p1;
  return {
    lift: Number(lift.toFixed(4)),
    low: Number((ratio * Math.exp(-z * se) - 1).toFixed(4)),
    high: Number((ratio * Math.exp(z * se) - 1).toFixed(4))
  };
}

/** Counts one metric across both arms of an experiment. */
function countMetric(experiment, metricKey, units) {
  const metric = METRIC_CATALOGUE[metricKey];
  if (!metric) return null;
  const split = experiment.traffic_split ?? 0.5;
  const exposure = experiment.exposure ?? 1;

  const arms = { control: { n: 0, x: 0 }, treatment: { n: 0, x: 0 } };
  for (const unit of units) {
    const arm = assignArm(experiment.experiment_key, unit.id, { split, exposure });
    if (!arm) continue;
    arms[arm].n += 1;
    if (metric.converted(unit)) arms[arm].x += 1;
  }
  return arms;
}

/**
 * Recomputes an experiment's arms, guardrails and statistics from the units it
 * governs. `populations` maps unit type → records.
 */
/**
 * Folds hand-logged cases into the counts derived from the population.
 *
 * An experiment otherwise only moves as the funnel produces units, which is
 * right for a live test and useless when someone is running one deliberately
 * and wants to record what they saw. A logged case is an extra observation in
 * its arm, counted the same way as a derived one, so the statistics stay
 * honest — there is no separate maths for hand-entered rows.
 */
function withObservations(arms, experiment) {
  const merged = {
    control: { ...arms.control },
    treatment: { ...arms.treatment }
  };
  for (const o of experiment.observations || []) {
    const arm = o.arm === 'treatment' ? 'treatment' : 'control';
    merged[arm].n += 1;
    if (o.converted) merged[arm].x += 1;
  }
  return merged;
}

export function analyseExperiment(experiment, populations) {
  const metric = METRIC_CATALOGUE[experiment.primary_metric];
  if (!metric) return null;

  const units = populations[metric.unit] || [];
  // Guardrails stay derived from the population; a logged case records the
  // primary metric only, which is the thing the operator actually observed.
  const arms = withObservations(countMetric(experiment, experiment.primary_metric, units), experiment);
  const { control, treatment } = arms;

  const fixed = twoProportionTest(control.n, control.x, treatment.n, treatment.x);
  const msprt = alwaysValidP(control.n, control.x, treatment.n, treatment.x);
  const srm = srmCheck(control.n, treatment.n, experiment.traffic_split ?? 0.5);
  const { lift, low, high } = relativeLift(control.n, control.x, treatment.n, treatment.x);

  // Direction matters: for a "lower is better" metric a negative lift is a win.
  const movedRightWay = lift == null ? false : (metric.lowerIsBetter ? lift < 0 : lift > 0);
  const significant = msprt != null && msprt < 0.05 && lift != null && Math.abs(lift) > 0.001;

  // Guardrails are measured the same way as the primary metric, so a breach is
  // a computed fact rather than an authored row.
  const guardrails = (experiment.guardrail_metrics || []).map((key) => {
    const gm = METRIC_CATALOGUE[key];
    if (!gm) return null;
    const gArms = countMetric(experiment, key, populations[gm.unit] || []);
    const gTest = twoProportionTest(gArms.control.n, gArms.control.x, gArms.treatment.n, gArms.treatment.x);
    const cRate = gArms.control.n ? gArms.control.x / gArms.control.n : 0;
    const tRate = gArms.treatment.n ? gArms.treatment.x / gArms.treatment.n : 0;
    // A guardrail breaches when treatment moves the wrong way significantly.
    const worse = gm.lowerIsBetter ? tRate > cRate : tRate < cRate;
    return {
      metric: key,
      label: gm.label,
      control: `${(cRate * 100).toFixed(1)}%`,
      treatment: `${(tRate * 100).toFixed(1)}%`,
      p_value: gTest.p,
      breach: Boolean(worse && gTest.p != null && gTest.p < 0.05)
    };
  }).filter(Boolean);

  return {
    arms: [
      { variant: 'control', n: control.n, conversions: control.x, rate: control.n ? Number((control.x / control.n).toFixed(4)) : 0 },
      { variant: 'treatment', n: treatment.n, conversions: treatment.x, rate: treatment.n ? Number((treatment.x / treatment.n).toFixed(4)) : 0 }
    ],
    baseline_rate: control.n ? Number((control.x / control.n).toFixed(4)) : 0,
    relative_lift: lift,
    ci_low: low,
    ci_high: high,
    p_value_fixed: fixed.p,
    p_value_msprt: msprt,
    significant,
    moved_right_way: movedRightWay,
    srm_p: srm.p,
    srm_flagged: srm.flagged,
    guardrails,
    power_achieved: experiment.required_n_per_arm
      ? Number(Math.min(1, Math.min(control.n, treatment.n) / experiment.required_n_per_arm).toFixed(3))
      : null,
    analysed_at: new Date().toISOString(),
    metric_definition: metric.describes,
    assignment_method: 'Deterministic SHA-256 hash of (experiment_key, unit_id)',
    // Said plainly, so a reader knows how much of the result was hand-entered.
    logged_cases: (experiment.observations || []).length
  };
}

/** Normalises and validates a user-supplied experiment definition. */
export function validateDefinition(input = {}) {
  const errors = [];
  const name = String(input.name || '').trim();
  if (name.length < 3) errors.push('Name must be at least 3 characters');

  const primary_metric = String(input.primary_metric || '');
  const metric = METRIC_CATALOGUE[primary_metric];
  if (!metric) errors.push(`Unknown primary metric "${primary_metric}"`);

  const guardrail_metrics = Array.isArray(input.guardrail_metrics) ? input.guardrail_metrics.filter((k) => METRIC_CATALOGUE[k]) : [];

  const traffic_split = Number(input.traffic_split ?? 0.5);
  if (!(traffic_split > 0 && traffic_split < 1)) errors.push('Traffic split must be between 0 and 1');

  const exposure = Number(input.exposure ?? 1);
  if (!(exposure > 0 && exposure <= 1)) errors.push('Exposure must be between 0 and 1');

  const required_n_per_arm = Math.max(1, Math.round(Number(input.required_n_per_arm) || 100));

  if (errors.length) return { errors };

  // The unit type follows from the metric — it is not a free choice, because
  // the metric can only be evaluated against records of its own type.
  const unit_type = metric.unit;

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);

  return {
    definition: {
      experiment_key: String(input.experiment_key || `exp_${slug}`),
      name,
      hypothesis: String(input.hypothesis || '').trim(),
      funnel_stage: String(input.funnel_stage || 'qualification'),
      unit_type,
      primary_metric,
      guardrail_metrics,
      required_n_per_arm,
      traffic_split,
      exposure,
      status: 'running',
      decision: 'in_flight',
      status_note: 'Accruing sample; no decision taken yet.',
      started_at: new Date().toISOString(),
      ended_at: null
    }
  };
}

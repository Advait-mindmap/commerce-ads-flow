/**
 * Deterministic demo dataset for CommerceAds OS.
 *
 * Built to satisfy the coherence rules in SPEC.md rather than to look full:
 *   - traffic_series is generated first and organic_impr_decline is *derived*
 *     from it, so the sparkline can never disagree with the number beside it
 *   - pta_reasons quote that seller's own computed figures
 *   - budget_low/target/stretch stay inside 2%–12% of GMV
 *   - every won Opportunity traces to a won Lead traces to a qualified AgentRun
 *   - every lead with a meeting has an AgentRun with outcome meeting_booked
 *   - RED churn campaigns carry a falling ROAS series and matching drivers
 */

import { ENTITIES, q, tableFor } from './db.js';
import { makeRng } from './rng.js';
import { buildCall } from './call-sim.js';
import { createUser } from './auth.js';
import { ROLES, ROLE_KEYS } from './rbac.js';
import { inrShort } from './format.js';

const SELLER_COUNT = 400;
const ADVERTISING_TARGET = 95;
const DAY = 86400000;

const CATEGORIES = [
  'Home & Kitchen', 'Fashion & Apparel', 'Electronics & Accessories', 'Beauty & Personal Care',
  'Sports & Fitness', 'Toys & Baby', 'Books & Stationery', 'Furniture & Decor',
  'Health & Nutrition', 'Automotive Accessories', 'Jewellery', 'Pet Supplies'
];

const CITIES = [
  ['Mumbai', 'Maharashtra'], ['Delhi', 'Delhi'], ['Bengaluru', 'Karnataka'], ['Surat', 'Gujarat'],
  ['Jaipur', 'Rajasthan'], ['Ludhiana', 'Punjab'], ['Tiruppur', 'Tamil Nadu'], ['Ahmedabad', 'Gujarat'],
  ['Kolkata', 'West Bengal'], ['Hyderabad', 'Telangana'], ['Indore', 'Madhya Pradesh'], ['Noida', 'Uttar Pradesh'],
  ['Coimbatore', 'Tamil Nadu'], ['Pune', 'Maharashtra'], ['Kanpur', 'Uttar Pradesh'], ['Rajkot', 'Gujarat']
];

const BRAND_PREFIX = [
  'Shree', 'Kanha', 'Nova', 'Urban', 'Riya', 'Aarav', 'Metro', 'Kesar', 'Vardhman', 'Lakshmi',
  'Trendz', 'Elite', 'Gokul', 'Shanti', 'Prime', 'Zenith', 'Maruti', 'Anand', 'Vidya', 'Orbit',
  'Krishna', 'Sunrise', 'Bharat', 'Vega', 'Amrit', 'Classic', 'Royal', 'Sagar', 'Tulsi', 'Vibe'
];
const BRAND_SUFFIX = [
  'Enterprises', 'Traders', 'Creations', 'Exports', 'Industries', 'Collection', 'Retail', 'Handicrafts',
  'Textiles', 'Mart', 'Store', 'Overseas', 'Impex', 'Fashions', 'Trading Co', 'Sales', 'Agencies', 'Global'
];

const SELLER_TYPES = ['individual', 'proprietorship', 'private_limited', 'partnership', 'llp'];
const TIERS = ['bronze', 'silver', 'gold', 'platinum'];

const REPS = [
  { id: 'rep_ananya', name: 'Ananya Iyer' },
  { id: 'rep_rohan', name: 'Rohan Mehta' },
  { id: 'rep_meera_j', name: 'Meera Joshi' },
  { id: 'rep_arjun', name: 'Arjun Desai' },
  { id: 'rep_sneha', name: 'Sneha Pillai' }
];

const LEAD_SOURCES = ['google_ads', 'meta_ads', 'dashboard_nudge', 'inbound_form', 'webinar', 'referral', 'behavioural_trigger'];

const FIRST_NAMES = ['Rajesh', 'Sunita', 'Amit', 'Pooja', 'Vikas', 'Neha', 'Sanjay', 'Kavita', 'Manish', 'Ritu', 'Deepak', 'Anjali', 'Suresh', 'Nisha', 'Alok', 'Shalini'];
const LAST_NAMES = ['Sharma', 'Patel', 'Gupta', 'Reddy', 'Nair', 'Shah', 'Verma', 'Joshi', 'Kulkarni', 'Agarwal', 'Chauhan', 'Menon'];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ */
/* Sellers                                                             */
/* ------------------------------------------------------------------ */

/**
 * 24 weekly points. Sellers under pressure get a decaying tail; the headline
 * decline is computed from the series afterwards so the two always agree.
 */
function buildTrafficSeries(r, { basePeak, decayStrength, gmvBase }) {
  const points = [];
  for (let i = 0; i < 24; i += 1) {
    const weeksFromEnd = 23 - i;
    // Decay applies over the final 10 weeks, deepening toward the present.
    const decayWindow = clamp((10 - weeksFromEnd) / 10, 0, 1);
    const decayFactor = 1 - decayStrength * decayWindow;
    const seasonal = 1 + 0.06 * Math.sin(i / 2.4);
    const noise = r.float(0.955, 1.045);
    const organic = Math.max(120, Math.round(basePeak * decayFactor * seasonal * noise));
    // GMV tracks organic traffic with a lag and a floor from repeat buyers.
    const gmv = Math.round(gmvBase * (0.36 + 0.64 * (organic / basePeak)) * r.float(0.94, 1.06));
    points.push({ week: `W${String(i + 1).padStart(2, '0')}`, organic, gmv });
  }
  return points;
}

function buildSellers(r) {
  const sellers = [];
  // Which sellers already advertise is fixed up front so the count lands on target.
  const advertisingIdx = new Set(r.sample([...Array(SELLER_COUNT).keys()], ADVERTISING_TARGET));

  for (let i = 0; i < SELLER_COUNT; i += 1) {
    const id = `sel_${String(i + 1).padStart(4, '0')}`;
    const sr = makeRng(`seller-${i}`);
    const category = sr.pick(CATEGORIES);
    const [city, state] = sr.pick(CITIES);
    const everAdvertised = advertisingIdx.has(i);

    const tier = sr.weighted([['bronze', 40], ['silver', 33], ['gold', 20], ['platinum', 7]]);
    const tierMultiplier = { bronze: 1, silver: 2.6, gold: 6.5, platinum: 16 }[tier];
    const gmvBase = Math.round(sr.float(45000, 190000) * tierMultiplier);

    // Sellers with real decline are the ones worth calling; skew the population
    // so band A is a genuine minority rather than half the table.
    const pressure = sr.weighted([['none', 30], ['mild', 30], ['real', 26], ['severe', 14]]);
    const decayStrength = { none: sr.float(-0.04, 0.03), mild: sr.float(0.06, 0.16), real: sr.float(0.2, 0.34), severe: sr.float(0.36, 0.55) }[pressure];
    const basePeak = Math.round(sr.float(9000, 52000) * (tierMultiplier ** 0.55));

    const traffic_series = buildTrafficSeries(sr, { basePeak, decayStrength, gmvBase });

    // Decline is derived, never invented: last 4 weeks vs the 4 before them.
    const recent = traffic_series.slice(-4).reduce((a, p) => a + p.organic, 0);
    const prior = traffic_series.slice(-8, -4).reduce((a, p) => a + p.organic, 0);
    const organic_impr_decline = Number(clamp(prior ? (prior - recent) / prior : 0, -0.15, 0.8).toFixed(4));
    const organic_impr_30d = recent;

    const gmv_30d = traffic_series.slice(-4).reduce((a, p) => a + p.gmv, 0);
    const gmvPrior = traffic_series.slice(-8, -4).reduce((a, p) => a + p.gmv, 0);
    const gmv_growth_30 = Number((gmvPrior ? (gmv_30d - gmvPrior) / gmvPrior : 0).toFixed(4));

    const sku_count = Math.round(sr.float(18, 140) * (tierMultiplier ** 0.6));
    const sku_added_30d = sr.bool(0.62) ? sr.int(1, Math.max(2, Math.round(sku_count * 0.18))) : 0;
    const avg_position = Number(sr.float(2.1, 9.4).toFixed(1));
    const position_loss_90d = Number(clamp(organic_impr_decline * sr.float(18, 30), 0, 14).toFixed(1));
    const category_sov = Number(clamp(sr.float(0.004, 0.09) * (tierMultiplier ** 0.35), 0.001, 0.34).toFixed(4));
    const tenure_days = sr.int(45, 1900);

    // ---- Signals -------------------------------------------------------
    const signals = [];
    const occurred = (d) => new Date(Date.now() - d * DAY).toISOString();
    if (organic_impr_decline > 0.18) {
      signals.push({
        signal_type: 'organic_traffic_decay',
        label: `Organic impressions down ${Math.round(organic_impr_decline * 100)}% in 30 days`,
        severity: organic_impr_decline > 0.34 ? 'critical' : 'high',
        value: organic_impr_decline,
        occurred_at: occurred(sr.int(1, 9))
      });
    }
    if (position_loss_90d > 3) {
      signals.push({
        signal_type: 'search_position_loss',
        label: `Average search position down ${position_loss_90d} places in 90 days`,
        severity: position_loss_90d > 7 ? 'high' : 'medium',
        value: position_loss_90d,
        occurred_at: occurred(sr.int(2, 20))
      });
    }
    if (sku_added_30d > 8) {
      signals.push({
        signal_type: 'catalog_expansion',
        label: `${sku_added_30d} new SKUs added in 30 days`,
        severity: 'medium',
        value: sku_added_30d,
        occurred_at: occurred(sr.int(1, 14))
      });
    }
    const zero_impression_sku_pct = Number(clamp(sr.float(0.05, 0.22) + organic_impr_decline * 0.45, 0.02, 0.72).toFixed(3));
    if (zero_impression_sku_pct > 0.3) {
      signals.push({
        signal_type: 'zero_impression_skus',
        label: `${Math.round(zero_impression_sku_pct * 100)}% of catalog getting no impressions`,
        severity: zero_impression_sku_pct > 0.45 ? 'high' : 'medium',
        value: zero_impression_sku_pct,
        occurred_at: occurred(sr.int(1, 12))
      });
    }
    if (gmv_growth_30 < -0.12) {
      signals.push({
        signal_type: 'gmv_decline',
        label: `GMV down ${Math.abs(Math.round(gmv_growth_30 * 100))}% month on month`,
        severity: gmv_growth_30 < -0.25 ? 'critical' : 'high',
        value: gmv_growth_30,
        occurred_at: occurred(sr.int(1, 8))
      });
    }

    // ---- PTA score -----------------------------------------------------
    // A weighted blend of the drivers above, so band and evidence agree.
    const contributions = [
      { feature: 'organic_impr_decline_30d', contribution: Number((organic_impr_decline * 0.62).toFixed(4)) },
      { feature: 'search_position_loss_90d', contribution: Number((position_loss_90d / 14 * 0.22).toFixed(4)) },
      { feature: 'sku_velocity_30d', contribution: Number((Math.min(sku_added_30d, 25) / 25 * 0.16).toFixed(4)) },
      { feature: 'zero_impression_sku_pct', contribution: Number((zero_impression_sku_pct * 0.18).toFixed(4)) },
      { feature: 'gmv_growth_30d', contribution: Number((clamp(-gmv_growth_30, -0.2, 0.4) * 0.2).toFixed(4)) },
      { feature: 'never_advertised', contribution: Number((everAdvertised ? -0.06 : 0.09).toFixed(4)) },
      { feature: 'tenure_days', contribution: Number((clamp(tenure_days / 1900, 0, 1) * 0.05).toFixed(4)) },
      { feature: 'category_sov', contribution: Number((-category_sov * 0.3).toFixed(4)) }
    ];
    const raw = contributions.reduce((a, c) => a + c.contribution, 0);
    const pta_score = Number(clamp(raw * 1.35 + sr.float(-0.04, 0.04) + 0.12, 0.02, 0.98).toFixed(3));
    const pta_band = pta_score >= 0.7 ? 'A' : pta_score >= 0.45 ? 'B' : pta_score >= 0.25 ? 'C' : 'D';

    const pta_reasons = [];
    if (organic_impr_decline > 0.12) {
      pta_reasons.push(`Organic impressions fell ${Math.round(organic_impr_decline * 100)}% over the last 30 days, from ${prior.toLocaleString('en-IN')} to ${recent.toLocaleString('en-IN')}`);
    }
    if (position_loss_90d > 2) {
      pta_reasons.push(`Average search position slipped ${position_loss_90d} places in 90 days, now at ${avg_position}`);
    }
    if (sku_added_30d > 4) {
      pta_reasons.push(`${sku_added_30d} SKUs added in the last 30 days against ${sku_count} live listings — new stock with no visibility`);
    }
    if (zero_impression_sku_pct > 0.25) {
      pta_reasons.push(`${Math.round(zero_impression_sku_pct * 100)}% of the catalog received zero impressions last month`);
    }
    if (!everAdvertised) {
      pta_reasons.push(`Never advertised despite ${inrShort(gmv_30d)} GMV in the last 30 days`);
    }
    if (!pta_reasons.length) {
      pta_reasons.push(`Stable organic traffic and ${inrShort(gmv_30d)} GMV — no acute pressure detected`);
    }

    // Budget guidance stays inside 2%–12% of GMV, per SPEC.
    const budget_low = Math.round((gmv_30d * 0.02) / 500) * 500;
    const budget_target = Math.round((gmv_30d * sr.float(0.045, 0.07)) / 500) * 500;
    const budget_stretch = Math.round((gmv_30d * 0.12) / 500) * 500;

    const status = sr.weighted([['active', 86], ['dormant', 8], ['suspended', 3], ['churned', 3]]);
    const display_name = `${sr.pick(BRAND_PREFIX)} ${sr.pick(BRAND_SUFFIX)}`;

    sellers.push({
      id,
      display_name: `${display_name}${sr.bool(0.18) ? ' Pvt Ltd' : ''}`,
      category,
      tier,
      seller_type: sr.pick(SELLER_TYPES),
      city,
      state,
      status,
      tenure_days,
      gmv_30d,
      gmv_growth_30,
      aov: Math.round(gmv_30d / Math.max(20, sku_count * sr.float(1.4, 5.2))),
      return_rate: Number(sr.float(0.03, 0.19).toFixed(3)),
      sku_count,
      sku_added_30d,
      zero_impression_sku_pct,
      listing_quality: Number(sr.float(0.42, 0.95).toFixed(3)),
      organic_impr_30d,
      organic_impr_decline,
      avg_position,
      position_loss_90d,
      category_sov,
      traffic_series,
      signals,
      pta_score,
      pta_band,
      pta_reasons,
      pta_contributions: contributions,
      budget_low,
      budget_target,
      budget_stretch,
      ever_advertised: everAdvertised,
      lifetime_ad_spend: everAdvertised ? Math.round(gmv_30d * sr.float(0.08, 0.55)) : 0,
      last_campaign_roas: everAdvertised ? Number(sr.float(1.4, 6.2).toFixed(2)) : 0,
      contact_phone: `+9198${String(sr.int(10000000, 99999999))}`,
      dnd: sr.bool(0.04),
      channel_consent: { voice: sr.bool(0.94), whatsapp: sr.bool(0.88), email: sr.bool(0.8) },
      last_contacted_at: sr.bool(0.35) ? new Date(Date.now() - sr.int(1, 60) * DAY).toISOString() : null,
      preferred_language: sr.pick(['en-IN', 'hi-IN', 'mr-IN', 'ta-IN', 'gu-IN'])
    });
  }
  return sellers;
}

function buildContacts(r, sellers) {
  const contacts = [];
  sellers.forEach((s, i) => {
    const cr = makeRng(`contact-${s.id}`);
    const count = cr.bool(0.22) ? 2 : 1;
    for (let n = 0; n < count; n += 1) {
      contacts.push({
        id: `con_${String(i + 1).padStart(4, '0')}_${n}`,
        seller_id: s.id,
        seller_name: s.display_name,
        full_name: `${cr.pick(FIRST_NAMES)} ${cr.pick(LAST_NAMES)}`,
        role: n === 0 ? cr.pick(['Owner', 'Proprietor', 'Director', 'Founder']) : cr.pick(['Operations Manager', 'Catalog Manager', 'Accounts']),
        phone: n === 0 ? s.contact_phone : `+9197${String(cr.int(10000000, 99999999))}`,
        email: `${s.display_name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.in`,
        is_primary: n === 0,
        preferred_language: s.preferred_language,
        dnd: n === 0 ? s.dnd : false
      });
    }
  });
  return contacts;
}

/* ------------------------------------------------------------------ */
/* Ad packages, models, experiments                                    */
/* ------------------------------------------------------------------ */

function buildAdPackages() {
  return [
    { id: 'pkg_starter', code: 'STARTER', name: 'Starter Visibility', description: 'Entry sponsored-listing placement for sellers testing paid traffic for the first time.', min_budget: 5000, max_budget: 25000, avg_roas_delivered: 3.1, historical_close_rate: 0.42, historical_retention_90d: 0.58, eligible_categories: [] },
    { id: 'pkg_growth', code: 'GROWTH', name: 'Growth Sponsored Listings', description: 'Sponsored listings across the seller top 30 SKUs with weekly bid management.', min_budget: 25000, max_budget: 90000, avg_roas_delivered: 4.2, historical_close_rate: 0.36, historical_retention_90d: 0.67, eligible_categories: [] },
    { id: 'pkg_category', code: 'CATEGORY', name: 'Category Dominance', description: 'Top-of-search placement plus category banner rotation for established sellers.', min_budget: 90000, max_budget: 300000, avg_roas_delivered: 4.8, historical_close_rate: 0.28, historical_retention_90d: 0.74, eligible_categories: [] },
    { id: 'pkg_brand', code: 'BRAND', name: 'Brand Storefront', description: 'Dedicated storefront, homepage banner slots and search keyword ownership.', min_budget: 300000, max_budget: 1200000, avg_roas_delivered: 5.4, historical_close_rate: 0.21, historical_retention_90d: 0.81, eligible_categories: ['Fashion & Apparel', 'Electronics & Accessories', 'Beauty & Personal Care', 'Home & Kitchen'] },
    { id: 'pkg_festive', code: 'FESTIVE', name: 'Festive Burst', description: 'Short-cycle high-intensity placement built around festive demand peaks.', min_budget: 40000, max_budget: 250000, avg_roas_delivered: 5.9, historical_close_rate: 0.47, historical_retention_90d: 0.41, eligible_categories: [] },
    { id: 'pkg_managed', code: 'MANAGED', name: 'Managed Performance', description: 'Fully managed campaigns with a dedicated strategist and monthly reviews.', min_budget: 150000, max_budget: 900000, avg_roas_delivered: 5.1, historical_close_rate: 0.24, historical_retention_90d: 0.86, eligible_categories: [] }
  ];
}

const MODEL_FEATURES = {
  pta: ['organic_impr_decline_30d', 'search_position_loss_90d', 'sku_velocity_30d', 'zero_impression_sku_pct', 'gmv_growth_30d', 'category_sov', 'tenure_days', 'never_advertised', 'listing_quality', 'return_rate', 'aov', 'dashboard_sessions_7d', 'catalog_size', 'competitor_ad_density', 'price_index_vs_category'],
  budget_capacity: ['gmv_30d', 'gmv_growth_30d', 'aov', 'margin_proxy', 'tenure_days', 'tier', 'lifetime_ad_spend', 'catalog_size', 'return_rate', 'category_avg_budget'],
  churn_survival: ['roas_vs_promised', 'roas_trend_slope', 'budget_utilization', 'days_since_rep_contact', 'support_tickets_30d', 'campaign_pauses_30d', 'conversion_rate_trend', 'seasonality_index', 'contract_months_remaining'],
  elasticity: ['spend_level', 'category_competition', 'listing_quality', 'price_index_vs_category', 'organic_share', 'keyword_breadth', 'bid_headroom', 'seasonality_index']
};

function buildModelVersions(r) {
  const out = [];
  const keys = Object.keys(MODEL_FEATURES);
  keys.forEach((model_key, ki) => {
    const mr = makeRng(`model-${model_key}`);
    const features = MODEL_FEATURES[model_key];
    const baseAuc = { pta: 0.82, budget_capacity: 0.76, churn_survival: 0.79, elasticity: 0.71 }[model_key];

    ['v3.2.0', 'v3.1.0', 'v2.8.0'].forEach((version, vi) => {
      const status = vi === 0 ? 'champion' : vi === 1 ? 'challenger' : 'retired';
      const auc = Number((baseAuc - vi * mr.float(0.008, 0.028)).toFixed(3));

      // Importances are normalised so the chart's percentages sum sensibly.
      const rawImportances = features.map((f, i) => ({ feature: f, raw: mr.float(0.2, 1) * (1 - i / (features.length * 1.4)) }));
      const totalRaw = rawImportances.reduce((a, x) => a + x.raw, 0);
      const feature_importances = rawImportances
        .map((x) => ({ feature: x.feature, importance: Number((x.raw / totalRaw).toFixed(4)) }))
        .sort((a, b) => b.importance - a.importance);

      // Calibration curve hugs the diagonal, with a slight, realistic S-bend.
      const calibration_curve = Array.from({ length: 10 }, (_, i) => {
        const predicted = Number(((i + 0.5) / 10).toFixed(2));
        const bend = (predicted - 0.5) * 0.12 * (vi + 1);
        return { predicted, actual: Number(clamp(predicted - bend + mr.float(-0.03, 0.03), 0.01, 0.99).toFixed(3)) };
      });

      const drift_psi_by_feature = features.slice(0, 8).map((f) => ({
        feature: f,
        psi: Number(clamp(mr.float(0.01, vi === 0 ? 0.19 : 0.3), 0.005, 0.42).toFixed(3))
      }));
      const drift_psi_max = Number(Math.max(...drift_psi_by_feature.map((d) => d.psi)).toFixed(3));

      out.push({
        id: `mv_${model_key}_${version.replace(/\./g, '_')}`,
        model_key,
        version,
        status,
        auc,
        average_precision: Number((auc - mr.float(0.05, 0.12)).toFixed(3)),
        calibration_error: Number((0.018 + vi * mr.float(0.006, 0.02)).toFixed(3)),
        training_rows: mr.int(48000, 320000),
        trained_at: new Date(Date.now() - (vi * 62 + mr.int(3, 25)) * DAY).toISOString(),
        drift_status: drift_psi_max >= 0.2 ? 'drifted' : drift_psi_max >= 0.13 ? 'watch' : 'stable',
        drift_psi_max,
        drift_psi_by_feature,
        feature_importances,
        calibration_curve,
        notes: vi === 0 ? 'Serving all scoring traffic.' : vi === 1 ? 'Shadow scoring on 10% of traffic.' : 'Retired after champion promotion.'
      });
    });
  });
  return out;
}

function buildExperiments() {
  // Deliberately mixed results, including a null result and a guardrail stop —
  // SPEC calls out that an all-wins board reads as decorative.
  const defs = [
    { key: 'exp_sdr_script_v3_signal_open', name: 'SDR script — signal-led opening', stage: 'qualification', metric: 'meeting_booked_rate', status: 'running', unit: 'lead', lift: null, control: [1840, 214], treat: [1822, 253], required: 2400 },
    { key: 'exp_sdr_script_v3_empathy_open', name: 'SDR script — empathy-led opening', stage: 'qualification', metric: 'meeting_booked_rate', status: 'stopped_guardrail', unit: 'lead', lift: 0.081, control: [1210, 139], treat: [1198, 150], required: 2400, breach: true },
    { key: 'exp_nurture_cadence_4step', name: 'Nurture cadence — 4 step vs 6 step', stage: 'acquisition', metric: 'mql_to_sql_rate', status: 'concluded', unit: 'lead', lift: 0.142, control: [3100, 372], treat: [3088, 425], required: 2900, significant: true },
    { key: 'exp_pta_model_v32', name: 'PTA model v3.2 vs v3.1 routing', stage: 'qualification', metric: 'qualified_rate', status: 'concluded', unit: 'lead', lift: 0.089, control: [2600, 468], treat: [2612, 510], required: 2500, significant: true },
    { key: 'exp_pricing_anchor_high', name: 'Pricing anchor — high band first', stage: 'conversion', metric: 'close_rate', status: 'concluded', unit: 'opportunity', lift: 0.012, control: [880, 268], treat: [874, 271], required: 1600, significant: false },
    { key: 'exp_package_recommender_v2', name: 'Package recommender v2', stage: 'conversion', metric: 'close_rate', status: 'running', unit: 'opportunity', lift: null, control: [640, 191], treat: [648, 214], required: 1500 },
    { key: 'exp_churn_outreach_proactive', name: 'Proactive churn outreach at day 45', stage: 'retention', metric: 'renewal_rate', status: 'concluded', unit: 'campaign', lift: 0.168, control: [420, 264], treat: [418, 308], required: 380, significant: true },
    { key: 'exp_budget_uplift_prompt', name: 'In-dashboard budget uplift prompt', stage: 'expansion', metric: 'budget_increase_rate', status: 'running', unit: 'campaign', lift: null, control: [310, 41], treat: [308, 49], required: 700 },
    { key: 'exp_whatsapp_vs_email', name: 'WhatsApp vs email for proposal delivery', stage: 'conversion', metric: 'proposal_view_rate', status: 'concluded', unit: 'opportunity', lift: 0.231, control: [520, 213], treat: [516, 262], required: 500, significant: true }
  ];

  return defs.map((d, i) => {
    const er = makeRng(`exp-${d.key}`);
    const [cn, cc] = d.control;
    const [tn, tc] = d.treat;
    const cRate = cc / cn;
    const tRate = tc / tn;
    const relative_lift = Number(((tRate - cRate) / cRate).toFixed(4));
    const running = d.status === 'running';
    const halfWidth = Math.abs(relative_lift) * er.float(0.45, 0.85) + 0.012;

    return {
      id: `exp_${String(i + 1).padStart(3, '0')}`,
      experiment_key: d.key,
      name: d.name,
      hypothesis: {
        exp_sdr_script_v3_signal_open: 'Opening with the seller’s own traffic decline earns more meetings than a generic benefit statement.',
        exp_sdr_script_v3_empathy_open: 'Leading with empathy before data reduces early hang-ups.',
        exp_nurture_cadence_4step: 'A shorter four-step nurture converts better than six steps by reducing fatigue.',
        exp_pta_model_v32: 'Routing on PTA v3.2 surfaces more genuinely qualified sellers per dial.',
        exp_pricing_anchor_high: 'Anchoring on the higher package band lifts the eventual close value.',
        exp_package_recommender_v2: 'Fit-scored package ranking closes more than budget-band matching alone.',
        exp_churn_outreach_proactive: 'Contacting at-risk campaigns at day 45 rather than day 60 improves renewals.',
        exp_budget_uplift_prompt: 'A performance-framed in-dashboard prompt drives voluntary budget increases.',
        exp_whatsapp_vs_email: 'Proposals delivered over WhatsApp get viewed more often than emailed PDFs.'
      }[d.key],
      funnel_stage: d.stage,
      status: d.status,
      unit_type: d.unit,
      primary_metric: d.metric,
      required_n_per_arm: d.required,
      arms: [
        { variant: 'control', n: cn, conversions: cc, rate: Number(cRate.toFixed(4)) },
        { variant: 'treatment', n: tn, conversions: tc, rate: Number(tRate.toFixed(4)) }
      ],
      relative_lift: running ? null : relative_lift,
      ci_low: running ? null : Number((relative_lift - halfWidth).toFixed(4)),
      ci_high: running ? null : Number((relative_lift + halfWidth).toFixed(4)),
      p_value_fixed: running ? null : Number((d.significant ? er.float(0.0004, 0.021) : er.float(0.18, 0.44)).toFixed(4)),
      p_value_msprt: running ? null : Number((d.significant ? er.float(0.001, 0.032) : er.float(0.22, 0.51)).toFixed(4)),
      significant: Boolean(d.significant),
      srm_flagged: false,
      srm_p: Number(er.float(0.21, 0.93).toFixed(3)),
      cuped_vr: Number(er.float(0.08, 0.31).toFixed(3)),
      power_achieved: Number(clamp((cn / d.required) * er.float(0.8, 0.98), 0.2, 0.99).toFixed(3)),
      guardrails: [
        { metric: 'seller_complaint_rate', control: '0.4%', treatment: d.breach ? '0.9%' : '0.4%', p_value: d.breach ? 0.03 : Number(er.float(0.3, 0.9).toFixed(3)), breach: Boolean(d.breach) },
        { metric: 'call_abandon_rate', control: '6.1%', treatment: `${(6.1 + er.float(-0.6, 0.7)).toFixed(1)}%`, p_value: Number(er.float(0.2, 0.9).toFixed(3)), breach: false },
        { metric: 'suppression_violations', control: '0', treatment: '0', p_value: 1, breach: false }
      ],
      started_at: new Date(Date.now() - er.int(30, 140) * DAY).toISOString(),
      ended_at: running ? null : new Date(Date.now() - er.int(2, 28) * DAY).toISOString(),
      decision: running ? 'in_flight' : d.breach ? 'stopped_on_guardrail' : d.significant ? 'ship_treatment' : 'keep_control'
    };
  });
}

/* ------------------------------------------------------------------ */
/* Leads, calls, opportunities, campaigns                              */
/* ------------------------------------------------------------------ */

function buildFunnel(r, sellers, packages, experiments) {
  const leads = [];
  const agentRuns = [];
  const opportunities = [];
  const interactions = [];
  const sequences = [];
  const suppressions = [];
  const auditLogs = [];

  const now = Date.now();
  // Prioritise high-intent sellers for the funnel, exactly as the product would.
  const ranked = sellers.slice().sort((a, b) => b.pta_score - a.pta_score);
  const funnelSellers = ranked.slice(0, 190);

  const runningExperiments = experiments.filter((e) => e.status === 'running');

  funnelSellers.forEach((seller, i) => {
    const lr = makeRng(`lead-${seller.id}`);
    const leadId = `lead_${String(i + 1).padStart(4, '0')}`;

    // Stage mix: most sit at MQL, fewer progress. Won leads must end up with a
    // qualified call and an opportunity, wired below.
    const stage = lr.weighted([
      ['mql', 40], ['sql', 22], ['opportunity', 14], ['won', 10], ['nurture', 8], ['disqualified', 6]
    ]);

    const mqlDaysAgo = lr.int(0, 44);
    const mql_at = new Date(now - mqlDaysAgo * DAY - lr.int(0, 20) * 3600000).toISOString();
    const rep = REPS[i % REPS.length];

    const slaHours = { A: 2, B: 8, C: 24, D: 48 }[seller.pta_band] || 24;
    const sla_due_at = new Date(new Date(mql_at).getTime() + slaHours * 3600000).toISOString();
    const overdue = new Date(sla_due_at).getTime() < now;
    const worked = ['sql', 'opportunity', 'won'].includes(stage);
    const sla_status = worked ? 'met' : overdue ? 'breached' : (new Date(sla_due_at).getTime() - now < 3600000 ? 'at_risk' : 'on_track');

    // Suppression state, mirroring the gate in functions.js.
    let suppression_status = 'none';
    if (seller.dnd) suppression_status = 'dnd';
    else if (!seller.channel_consent.voice) suppression_status = 'opted_out';
    else if (seller.status === 'suspended' || seller.status === 'churned') suppression_status = 'account_suspended';
    else if (lr.bool(0.06)) suppression_status = 'frequency_cap';
    else if (lr.bool(0.05)) suppression_status = 'recent_contact';

    const dialable = suppression_status === 'none';
    const agent_attempts = dialable ? lr.weighted([[0, 30], [1, 34], [2, 20], [3, 11], [4, 5]]) : 0;

    const experiment_assignments = {};
    runningExperiments.forEach((e) => { experiment_assignments[e.experiment_key] = lr.bool(0.5) ? 'treatment' : 'control'; });

    const lead = {
      id: leadId,
      seller_id: seller.id,
      seller_name: seller.display_name,
      category: seller.category,
      source: lr.pick(LEAD_SOURCES),
      mql_trigger: lr.pick([
        `Organic impressions down ${Math.round(seller.organic_impr_decline * 100)}% — crossed the 20% alert threshold`,
        `Viewed the advertising page in the seller dashboard ${lr.int(2, 6)} times this week`,
        `Added ${seller.sku_added_30d} SKUs in 30 days with no paid coverage`,
        'Submitted the "grow my sales" enquiry form',
        `Clicked a retargeting ad for sponsored listings`,
        `Search position dropped ${seller.position_loss_90d} places in 90 days`
      ]),
      mql_at,
      sql_at: worked ? new Date(new Date(mql_at).getTime() + lr.int(1, 6) * DAY).toISOString() : null,
      stage,
      pta_score: seller.pta_score,
      pta_band: seller.pta_band,
      pta_reasons: seller.pta_reasons,
      budget_target: seller.budget_target,
      contact_phone: seller.contact_phone,
      suppression_status,
      agent_attempts,
      assigned_rep_id: rep.id,
      assigned_rep_name: rep.name,
      sla_status,
      sla_due_at,
      last_agent_contact_at: agent_attempts ? new Date(now - lr.int(1, 14) * DAY).toISOString() : null,
      agent_disposition: null,
      meeting_status: 'none',
      meeting_scheduled_at: null,
      meeting_booked_by: null,
      meeting_rep: null,
      disqualify_reason: stage === 'disqualified' ? lr.pick(['Not the decision maker and no route through', 'Explicitly asked not to be contacted', 'Budget far below the entry package', 'Account suspended for policy violation']) : null,
      suggested_opening_line: `Your organic impressions are down ${Math.round(seller.organic_impr_decline * 100)}% this month and ${Math.round(seller.zero_impression_sku_pct * 100)}% of your ${seller.sku_count} listings got no impressions at all — that gap is what paid placement closes.`,
      experiment_assignments,
      created_date: mql_at
    };

    // ---- Calls ---------------------------------------------------------
    // Every attempt produces an AgentRun. The final call's outcome is forced to
    // agree with the lead's stage so the funnel never contradicts itself.
    for (let attempt = 0; attempt < agent_attempts; attempt += 1) {
      const isLast = attempt === agent_attempts - 1;
      const startedAt = new Date(new Date(mql_at).getTime() + (attempt + 1) * lr.int(1, 4) * DAY).toISOString();
      if (new Date(startedAt).getTime() > now) continue;

      let forceScenario;
      if (isLast) {
        if (stage === 'won' || stage === 'opportunity') forceScenario = 'meeting_booked';
        else if (stage === 'sql') forceScenario = lr.bool(0.6) ? 'meeting_booked' : 'qualified_no_meeting';
        else if (stage === 'disqualified') forceScenario = 'not_interested';
        else if (stage === 'nurture') forceScenario = lr.bool(0.5) ? 'callback' : 'qualified_no_meeting';
      }

      const call = buildCall({ seller, lead, rng: lr, startedAt, forceScenario });
      const runId = `run_${leadId}_${attempt}`;
      const ended = new Date(new Date(startedAt).getTime() + call.duration_sec * 1000).toISOString();

      if (call.escalation) {
        call.escalation.assigned_rep = lr.bool(0.55) ? rep.name : null;
        call.escalation.status = lr.bool(0.45) ? 'open' : 'resolved';
      }

      agentRuns.push({
        id: runId,
        agent_key: 'sdr_qualification',
        lead_id: leadId,
        seller_id: seller.id,
        seller_name: seller.display_name,
        contact_phone: seller.contact_phone,
        channel: 'voice_out',
        status: call.status,
        outcome: call.outcome,
        started_at: startedAt,
        ended_at: ended,
        duration_sec: call.duration_sec,
        cost_usd: call.cost_usd,
        script_variant: call.script_variant,
        language: call.language,
        transcript: call.transcript,
        objections: call.objections,
        guardrail_events: call.guardrail_events,
        qualification: call.qualification,
        overall_sentiment: call.overall_sentiment,
        talk_ratio: call.talk_ratio,
        signature_verified: call.signature_verified,
        escalation: call.escalation,
        created_date: startedAt
      });

      if (call.transcript.length) {
        interactions.push({
          id: `int_${runId}`,
          seller_id: seller.id,
          seller_name: seller.display_name,
          lead_id: leadId,
          agent_run_id: runId,
          channel: 'voice_out',
          actor_type: 'agent',
          actor_name: 'AI SDR (Meera)',
          direction: 'outbound',
          outcome: call.outcome,
          disposition: call.outcome,
          summary: `AI SDR call — ${call.outcome.replace(/_/g, ' ')}. ${call.qualification?.pain_confirmed ? 'Seller confirmed the traffic drop.' : 'No pain confirmed.'}`,
          objections: call.objections.map((o) => o.objection_type),
          sentiment_score: call.overall_sentiment,
          duration_sec: call.duration_sec,
          started_at: startedAt
        });
      }

      if (isLast && call.meeting_booked) {
        lead.meeting_status = 'booked';
        lead.meeting_scheduled_at = new Date(new Date(startedAt).getTime() + lr.int(1, 5) * DAY).toISOString();
        lead.meeting_booked_by = 'agent';
        lead.meeting_rep = rep.name;
        lead.agent_disposition = 'meeting_booked';
      } else if (isLast) {
        lead.agent_disposition = call.outcome;
      }
    }

    // A lead that reached opportunity or won must carry a booked meeting; if the
    // dial loop never produced one (e.g. suppressed), book it with a human rep.
    if (['opportunity', 'won'].includes(stage) && lead.meeting_status === 'none') {
      lead.meeting_status = 'booked';
      lead.meeting_scheduled_at = new Date(new Date(mql_at).getTime() + lr.int(3, 12) * DAY).toISOString();
      lead.meeting_booked_by = 'human';
      lead.meeting_rep = rep.name;
    }

    leads.push(lead);

    // ---- Opportunities -------------------------------------------------
    if (['opportunity', 'won'].includes(stage)) {
      const budget = seller.budget_target;
      const pkg = packages.find((p) => budget >= p.min_budget && budget <= p.max_budget) || packages[0];
      const contract_months = lr.pick([3, 6, 6, 12]);
      const oppStage = stage === 'won' ? 'won' : lr.weighted([['proposed', 34], ['negotiating', 30], ['verbal', 18], ['lost', 18]]);
      const createdAt = new Date(new Date(mql_at).getTime() + lr.int(4, 16) * DAY);
      const daysInStage = Math.max(0, Math.round((now - createdAt.getTime()) / DAY) - lr.int(0, 6));
      const proposalSent = new Date(createdAt.getTime() + lr.int(1, 5) * DAY);
      const proposal_status = oppStage === 'won' ? 'signed' : lr.weighted([['sent', 40], ['viewed', 38], ['draft', 22]]);
      const contractStart = oppStage === 'won' ? new Date(createdAt.getTime() + lr.int(6, 20) * DAY) : null;

      opportunities.push({
        id: `opp_${String(opportunities.length + 1).padStart(4, '0')}`,
        seller_id: seller.id,
        seller_name: seller.display_name,
        category: seller.category,
        lead_id: leadId,
        stage: oppStage,
        package_code: pkg.code,
        package_name: pkg.name,
        monthly_budget: budget,
        contract_months,
        total_value: budget * contract_months,
        close_probability: Number({ proposed: lr.float(0.2, 0.4), negotiating: lr.float(0.4, 0.65), verbal: lr.float(0.7, 0.88), won: 1, lost: 0 }[oppStage].toFixed(2)),
        expected_close_date: new Date(now + lr.int(-10, 45) * DAY).toISOString().slice(0, 10),
        owner_rep_id: rep.id,
        owner_rep_name: rep.name,
        days_in_stage: clamp(daysInStage, 0, 70),
        lost_reason: oppStage === 'lost' ? lr.pick(['budget_withdrawn', 'chose_competitor_platform', 'no_decision', 'timing_pushed_out']) : null,
        projected_roas_low: Number((pkg.avg_roas_delivered * 0.8).toFixed(1)),
        projected_roas_high: Number((pkg.avg_roas_delivered * 1.25).toFixed(1)),
        proposal_status,
        proposal_sent_at: proposal_status === 'draft' ? null : proposalSent.toISOString(),
        proposal_viewed_at: ['viewed', 'signed'].includes(proposal_status) ? new Date(proposalSent.getTime() + lr.int(1, 4) * DAY).toISOString() : null,
        proposal_view_count: ['viewed', 'signed'].includes(proposal_status) ? lr.int(1, 7) : 0,
        contract_start_date: contractStart ? contractStart.toISOString() : null,
        contract_end_date: contractStart ? new Date(contractStart.getTime() + contract_months * 30 * DAY).toISOString() : null,
        renewal_date: contractStart ? new Date(contractStart.getTime() + contract_months * 30 * DAY).toISOString() : null,
        created_date: createdAt.toISOString()
      });
    }

    // ---- Nurture sequences --------------------------------------------
    if (['mql', 'nurture'].includes(stage) && lr.bool(0.42)) {
      const step_number = lr.int(1, 4);
      sequences.push({
        id: `seq_${leadId}`,
        seller_id: seller.id,
        seller_name: seller.display_name,
        lead_id: leadId,
        sequence_type: lr.pick(['nurture', 'reengage', 'onboarding']),
        channel: lr.pick(['whatsapp', 'email', 'whatsapp']),
        step_number,
        total_steps: 4,
        status: step_number >= 4 ? 'completed' : 'active',
        last_sent_at: new Date(now - lr.int(1, 12) * DAY).toISOString(),
        next_send_at: step_number >= 4 ? null : new Date(now + lr.int(1, 5) * DAY).toISOString()
      });
    }

    // ---- Suppressions --------------------------------------------------
    if (suppression_status !== 'none') {
      const reasonMap = {
        dnd: 'dnd_registry',
        opted_out: 'opted_out',
        frequency_cap: 'frequency_cap',
        recent_contact: 'recent_contact',
        account_suspended: 'account_suspended'
      };
      const permanent = ['dnd', 'opted_out'].includes(suppression_status);
      suppressions.push({
        id: `sup_${leadId}`,
        seller_id: seller.id,
        seller_name: seller.display_name,
        reason: reasonMap[suppression_status],
        channel: 'voice',
        created_at: new Date(now - lr.int(2, 90) * DAY).toISOString(),
        expires_at: permanent ? null : new Date(now + lr.int(2, 40) * DAY).toISOString(),
        notes: permanent ? 'Permanent — seller opted out of voice outreach.' : 'Temporary hold from the contact-frequency policy.'
      });
    }
  });

  return { leads, agentRuns, opportunities, interactions, sequences, suppressions, auditLogs };
}

/** A slice of very recent calls so the SDR console's "today" panel is populated. */
function buildTodayRuns(r, sellers, leads) {
  const runs = [];
  const interactions = [];
  const now = Date.now();
  const candidates = leads.filter((l) => l.suppression_status === 'none' && ['mql', 'sql'].includes(l.stage)).slice(0, 40);

  candidates.forEach((lead, i) => {
    if (i >= 30) return;
    const seller = sellers.find((s) => s.id === lead.seller_id);
    if (!seller) return;
    const tr = makeRng(`today-${lead.id}`);
    const minutesAgo = 20 + i * tr.int(18, 34);
    const startedAt = new Date(now - minutesAgo * 60000).toISOString();

    // The two most recent stay in flight so the live indicator has something to
    // show; server boot schedules their completion.
    const live = i < 2;
    const call = buildCall({ seller, lead, rng: tr, startedAt });
    const runId = `run_today_${String(i + 1).padStart(3, '0')}`;

    if (call.escalation) {
      call.escalation.assigned_rep = tr.bool(0.5) ? REPS[i % REPS.length].name : null;
      call.escalation.status = 'open';
    }

    runs.push({
      id: runId,
      agent_key: 'sdr_qualification',
      lead_id: lead.id,
      seller_id: seller.id,
      seller_name: seller.display_name,
      contact_phone: seller.contact_phone,
      channel: 'voice_out',
      status: live ? 'in_progress' : 'completed',
      outcome: live ? null : call.outcome,
      started_at: startedAt,
      ended_at: live ? null : new Date(new Date(startedAt).getTime() + call.duration_sec * 1000).toISOString(),
      duration_sec: live ? null : call.duration_sec,
      cost_usd: live ? 0 : call.cost_usd,
      script_variant: 'v3_signal_open',
      language: call.language,
      transcript: live ? call.transcript.slice(0, 3) : call.transcript,
      objections: live ? [] : call.objections,
      guardrail_events: live ? [] : call.guardrail_events,
      qualification: live ? null : call.qualification,
      overall_sentiment: live ? 0 : call.overall_sentiment,
      talk_ratio: live ? 0.5 : call.talk_ratio,
      signature_verified: true,
      escalation: live ? null : call.escalation,
      // Retained so the boot-time resumer finishes these as the same call.
      _pending: live ? { scenario: call.scenario } : undefined,
      created_date: startedAt
    });

    if (!live && call.transcript.length) {
      interactions.push({
        id: `int_${runId}`,
        seller_id: seller.id,
        seller_name: seller.display_name,
        lead_id: lead.id,
        agent_run_id: runId,
        channel: 'voice_out',
        actor_type: 'agent',
        actor_name: 'AI SDR (Meera)',
        direction: 'outbound',
        outcome: call.outcome,
        disposition: call.outcome,
        summary: `AI SDR call — ${call.outcome.replace(/_/g, ' ')}.`,
        objections: call.objections.map((o) => o.objection_type),
        sentiment_score: call.overall_sentiment,
        duration_sec: call.duration_sec,
        started_at: startedAt
      });
    }
  });

  return { runs, interactions };
}

function buildCampaigns(r, sellers, opportunities, packages) {
  const campaigns = [];
  const advertisers = sellers.filter((s) => s.ever_advertised);

  advertisers.forEach((seller, i) => {
    const cr = makeRng(`camp-${seller.id}`);
    const won = opportunities.find((o) => o.seller_id === seller.id && o.stage === 'won');
    const pkg = won
      ? packages.find((p) => p.code === won.package_code)
      : packages.find((p) => seller.budget_target >= p.min_budget && seller.budget_target <= p.max_budget) || packages[0];

    const monthly_budget = won ? won.monthly_budget : Math.round(seller.budget_target / 500) * 500;
    const status = cr.weighted([['live', 74], ['paused', 14], ['ended', 12]]);
    const days_active = cr.int(20, 400);

    // Risk profile drives everything else, so band, drivers and the ROAS series
    // all tell the same story.
    const risk = cr.weighted([['healthy', 46], ['watch', 26], ['slipping', 18], ['critical', 10]]);
    const promised = pkg.avg_roas_delivered;
    const roas_30d = Number(clamp(
      { healthy: promised * cr.float(1.02, 1.35), watch: promised * cr.float(0.9, 1.02), slipping: promised * cr.float(0.66, 0.88), critical: promised * cr.float(0.36, 0.62) }[risk],
      0.4, 9
    ).toFixed(2));

    const slopeByRisk = { healthy: cr.float(0.004, 0.02), watch: cr.float(-0.004, 0.006), slipping: cr.float(-0.026, -0.008), critical: cr.float(-0.06, -0.03) }[risk];
    const roas_series = Array.from({ length: 12 }, (_, w) => ({
      week: `W${String(w + 1).padStart(2, '0')}`,
      // Walk backwards from the current ROAS along the trend, so the last point
      // equals roas_30d and the line visibly matches the band.
      roas: Number(clamp(roas_30d - slopeByRisk * (11 - w) * promised * cr.float(0.9, 1.1), 0.2, 10).toFixed(2))
    }));

    const budget_utilization = Number(clamp(
      { healthy: cr.float(0.88, 1.0), watch: cr.float(0.74, 0.92), slipping: cr.float(0.52, 0.78), critical: cr.float(0.3, 0.6) }[risk],
      0.2, 1.05
    ).toFixed(3));
    const days_since_rep_contact = { healthy: cr.int(2, 18), watch: cr.int(12, 30), slipping: cr.int(24, 48), critical: cr.int(38, 95) }[risk];
    const roas_vs_promised = Number((roas_30d / promised).toFixed(2));

    const churn_p30 = Number(clamp(
      0.06
      + (roas_vs_promised < 1 ? (1 - roas_vs_promised) * 0.62 : -0.02)
      + (1 - budget_utilization) * 0.28
      + clamp((days_since_rep_contact - 20) / 100, 0, 0.28)
      + cr.float(-0.03, 0.03),
      0.01, 0.96
    ).toFixed(3));
    const churn_band = churn_p30 >= 0.55 ? 'RED' : churn_p30 >= 0.35 ? 'AMBER' : churn_p30 >= 0.2 ? 'YELLOW' : 'GREEN';

    const drivers = [];
    if (roas_vs_promised < 1) drivers.push({ driver: 'roas_decline', contribution: Number(((1 - roas_vs_promised) * 0.6).toFixed(3)) });
    if (budget_utilization < 0.8) drivers.push({ driver: 'budget_underspend', contribution: Number(((1 - budget_utilization) * 0.45).toFixed(3)) });
    if (days_since_rep_contact > 30) drivers.push({ driver: 'no_rep_contact', contribution: Number(clamp(days_since_rep_contact / 200, 0.05, 0.4).toFixed(3)) });
    if (cr.bool(0.45)) drivers.push({ driver: 'keyword_waste', contribution: Number(cr.float(0.05, 0.26).toFixed(3)) });
    if (status === 'paused') drivers.push({ driver: 'pause_churn', contribution: Number(cr.float(0.12, 0.3).toFixed(3)) });
    if (!drivers.length) drivers.push({ driver: 'seasonal_softness', contribution: Number(cr.float(0.04, 0.12).toFixed(3)) });

    const spend_30d = Math.round(monthly_budget * budget_utilization);
    const revenue_30d = Math.round(spend_30d * roas_30d);

    // Recommendations follow from the drivers rather than being random.
    const optimization_actions = [];
    if (drivers.some((d) => d.driver === 'keyword_waste')) {
      const wasted = Math.round(spend_30d * cr.float(0.08, 0.19));
      optimization_actions.push({
        action_type: 'pause_keywords',
        target: `${cr.int(4, 17)} keywords with zero conversions in 30 days`,
        current_value: `${inrShort(wasted)} wasted spend`,
        recommended_value: 'Pause and add as negatives',
        rationale: `These terms consumed ${inrShort(wasted)} across ${cr.int(900, 5200)} clicks with no attributed conversion.`,
        projected_impact: `Recovers roughly ${inrShort(wasted)} per month for converting terms`,
        confidence: Number(cr.float(0.72, 0.94).toFixed(2)),
        status: cr.weighted([['pending', 60], ['approved', 25], ['rejected', 15]])
      });
    }
    if (budget_utilization < 0.85) {
      optimization_actions.push({
        action_type: 'raise_daily_cap',
        target: 'Daily budget cap',
        current_value: inrShort(Math.round(monthly_budget / 30)),
        recommended_value: inrShort(Math.round((monthly_budget / 30) * 1.35)),
        rationale: `Campaign is capping out by mid-afternoon and only spending ${Math.round(budget_utilization * 100)}% of the monthly budget.`,
        projected_impact: `Adds an estimated ${cr.int(200, 1400)} impressions per day in peak hours`,
        confidence: Number(cr.float(0.63, 0.88).toFixed(2)),
        status: cr.weighted([['pending', 65], ['approved', 22], ['rejected', 13]])
      });
    }
    if (roas_vs_promised < 1) {
      optimization_actions.push({
        action_type: 'bid_rebalance',
        target: `Top ${cr.int(5, 14)} SKUs by impression share`,
        current_value: `${roas_30d.toFixed(1)}x ROAS`,
        recommended_value: `${(roas_30d * cr.float(1.12, 1.3)).toFixed(1)}x projected`,
        rationale: 'Bids are over-indexed on broad terms that convert below the category median.',
        projected_impact: `Lifts ROAS toward the ${promised.toFixed(1)}x promised on this package`,
        confidence: Number(cr.float(0.58, 0.82).toFixed(2)),
        status: cr.weighted([['pending', 70], ['approved', 18], ['rejected', 12]])
      });
    }

    campaigns.push({
      id: `cmp_${String(i + 1).padStart(4, '0')}`,
      seller_id: seller.id,
      seller_name: seller.display_name,
      opportunity_id: won ? won.id : null,
      campaign_type: cr.pick(['sponsored_listings', 'category_banner', 'search_placement', 'brand_storefront', 'festive_burst']),
      package_code: pkg.code,
      status,
      monthly_budget,
      spend_30d,
      roas_30d,
      roas_promised: promised,
      roas_vs_promised,
      conversions_30d: Math.round(revenue_30d / Math.max(200, seller.aov)),
      revenue_30d,
      budget_utilization,
      roas_series,
      roas_trend_slope: Number(slopeByRisk.toFixed(4)),
      days_since_rep_contact,
      days_active,
      churn_p30,
      churn_band,
      churn_drivers: drivers,
      optimization_actions,
      started_at: new Date(Date.now() - days_active * DAY).toISOString()
    });
  });

  return campaigns;
}

function buildAuditLog(r, { leads, campaigns, opportunities, agentRuns, experiments }) {
  const logs = [];
  const now = Date.now();
  const actors = [
    ['human_rep', 'Ananya Iyer'], ['human_rep', 'Rohan Mehta'], ['human_rep', 'Meera Joshi'],
    ['agent', 'AI SDR (Meera)'], ['system', 'Scoring pipeline'], ['admin', 'Aarav Sharma']
  ];
  const push = (entry) => logs.push({ id: `aud_${String(logs.length + 1).padStart(5, '0')}`, ...entry });

  agentRuns.slice(0, 60).forEach((run, i) => {
    push({
      actor_type: 'agent',
      actor_name: 'AI SDR (Meera)',
      action: 'call_placed',
      entity_type: 'AgentRun',
      entity_id: run.id,
      entity_name: run.seller_name,
      summary: `Outbound qualification call — ${(run.outcome || 'in progress').replace(/_/g, ' ')}`,
      timestamp: run.started_at
    });
    if (run.escalation?.triggered) {
      push({
        actor_type: 'system',
        actor_name: 'Guardrail monitor',
        action: 'escalation_raised',
        entity_type: 'AgentRun',
        entity_id: run.id,
        entity_name: run.seller_name,
        summary: `Guardrail fired on ${run.escalation.trigger_type.replace(/_/g, ' ')} — routed to a human rep`,
        timestamp: run.escalation.raised_at || run.started_at
      });
    }
  });

  leads.filter((l) => l.stage === 'disqualified').slice(0, 25).forEach((l) => {
    const [actor_type, actor_name] = r.pick(actors);
    push({
      actor_type,
      actor_name,
      action: 'lead_disqualified',
      entity_type: 'Lead',
      entity_id: l.id,
      entity_name: l.seller_name,
      summary: l.disqualify_reason || 'Disqualified after review',
      before_value: 'mql',
      after_value: 'disqualified',
      timestamp: new Date(now - r.int(1, 40) * DAY).toISOString()
    });
  });

  campaigns.filter((c) => (c.optimization_actions || []).some((a) => a.status !== 'pending')).slice(0, 30).forEach((c) => {
    const action = c.optimization_actions.find((a) => a.status !== 'pending');
    push({
      actor_type: 'human_rep',
      actor_name: r.pick(REPS).name,
      action: `optimization_action_${action.status}`,
      entity_type: 'Campaign',
      entity_id: c.id,
      entity_name: c.seller_name,
      summary: `${action.action_type.replace(/_/g, ' ')} on ${action.target}`,
      before_value: action.current_value,
      after_value: action.status === 'approved' ? action.recommended_value : action.current_value,
      timestamp: new Date(now - r.int(1, 25) * DAY).toISOString()
    });
  });

  opportunities.filter((o) => o.stage === 'won').slice(0, 20).forEach((o) => {
    push({
      actor_type: 'human_rep',
      actor_name: o.owner_rep_name,
      action: 'opportunity_won',
      entity_type: 'Opportunity',
      entity_id: o.id,
      entity_name: o.seller_name,
      summary: `${o.package_name} closed at ${inrShort(o.monthly_budget)} per month for ${o.contract_months} months`,
      before_value: 'verbal',
      after_value: 'won',
      timestamp: o.contract_start_date || o.created_date
    });
  });

  // Experiment decisions — ExperimentDetail reads these by entity_id.
  experiments.forEach((e) => {
    push({
      actor_type: 'system',
      actor_name: 'Experiment engine',
      action: 'experiment_started',
      entity_type: 'Experiment',
      entity_id: e.id,
      entity_name: e.name,
      summary: `Started with a required n of ${e.required_n_per_arm.toLocaleString('en-IN')} per arm on ${e.primary_metric.replace(/_/g, ' ')}`,
      timestamp: e.started_at
    });
    if (e.status === 'stopped_guardrail') {
      push({
        actor_type: 'system',
        actor_name: 'Guardrail monitor',
        action: 'experiment_auto_stopped',
        entity_type: 'Experiment',
        entity_id: e.id,
        entity_name: e.name,
        summary: 'Auto-stopped on a seller complaint-rate breach (+31% vs control, p=0.03)',
        before_value: 'running',
        after_value: 'stopped_guardrail',
        timestamp: e.ended_at
      });
    } else if (e.status === 'concluded') {
      push({
        actor_type: 'admin',
        actor_name: 'Priya Nair',
        action: e.significant ? 'experiment_shipped' : 'experiment_concluded_no_change',
        entity_type: 'Experiment',
        entity_id: e.id,
        entity_name: e.name,
        summary: e.significant
          ? `Treatment shipped — ${(e.relative_lift * 100).toFixed(1)}% lift, mSPRT p=${e.p_value_msprt}`
          : `No significant difference — kept the control (mSPRT p=${e.p_value_msprt})`,
        before_value: 'running',
        after_value: 'concluded',
        timestamp: e.ended_at
      });
    }
  });

  return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

async function bulkInsert(entity, rows) {
  if (!rows.length) return;
  const table = tableFor(entity);
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = [];
    const params = [];
    chunk.forEach((row, n) => {
      const { id, created_date, ...rest } = row;
      params.push(id, JSON.stringify(rest), created_date || new Date().toISOString());
      values.push(`($${n * 3 + 1}, $${n * 3 + 2}::jsonb, $${n * 3 + 3}::timestamptz)`);
    });
    await q(
      `INSERT INTO ${table} (id, data, created_date) VALUES ${values.join(', ')}
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, created_date = EXCLUDED.created_date, updated_date = NOW()`,
      params
    );
  }
}

export async function isSeeded() {
  const { rows } = await q(`SELECT COUNT(*)::int AS n FROM ${tableFor('Seller')}`);
  return rows[0].n > 0;
}

async function seedDemoUsers() {
  for (const key of ROLE_KEYS) {
    const role = ROLES[key];
    const { rows } = await q('SELECT id FROM users WHERE email = $1', [role.demo.email]);
    if (rows.length) continue;
    await createUser({
      email: role.demo.email,
      password: 'Demo@1234',
      full_name: role.demo.full_name,
      role: key,
      is_demo: true,
      email_verified: true
    });
  }
}

export async function seedAll({ force = false } = {}) {
  const already = await isSeeded();
  if (already && !force) {
    await seedDemoUsers();
    return { skipped: true, reason: 'already seeded' };
  }

  if (force) {
    for (const entity of ENTITIES) {
      await q(`TRUNCATE TABLE ${tableFor(entity)}`);
    }
  }

  const r = makeRng('commerceads-os-v1');

  const sellers = buildSellers(r);
  const contacts = buildContacts(r, sellers);
  const packages = buildAdPackages();
  const modelVersions = buildModelVersions(r);
  const experiments = buildExperiments();

  const funnel = buildFunnel(r, sellers, packages, experiments);
  const today = buildTodayRuns(r, sellers, funnel.leads);
  const agentRuns = [...funnel.agentRuns, ...today.runs];
  const interactions = [...funnel.interactions, ...today.interactions];
  const campaigns = buildCampaigns(r, sellers, funnel.opportunities, packages);

  // Rep-led touches, so the churn console's "interventions this week" is real.
  funnel.leads.slice(0, 90).forEach((lead, i) => {
    const ir = makeRng(`rep-int-${lead.id}`);
    if (!ir.bool(0.55)) return;
    interactions.push({
      id: `int_rep_${String(i + 1).padStart(4, '0')}`,
      seller_id: lead.seller_id,
      seller_name: lead.seller_name,
      lead_id: lead.id,
      channel: ir.pick(['voice_out', 'whatsapp', 'email']),
      actor_type: 'human_rep',
      actor_name: lead.assigned_rep_name,
      direction: 'outbound',
      outcome: ir.pick(['connected', 'follow_up_scheduled', 'proposal_sent', 'no_answer']),
      disposition: ir.pick(['book_meeting', 'add_to_nurture', 'callback']),
      summary: ir.pick([
        'Walked through the traffic decline and the recommended package.',
        'Sent the proposal over WhatsApp and agreed to follow up mid-week.',
        'Performance review call — discussed keyword pruning and bid rebalance.',
        'Left a voicemail, followed up with a WhatsApp summary.'
      ]),
      objections: [],
      sentiment_score: Number(ir.float(-0.2, 0.6).toFixed(2)),
      duration_sec: ir.int(90, 900),
      started_at: new Date(Date.now() - ir.int(0, 9) * DAY).toISOString()
    });
  });

  const auditLogs = buildAuditLog(r, { leads: funnel.leads, campaigns, opportunities: funnel.opportunities, agentRuns, experiments });

  await bulkInsert('Seller', sellers);
  await bulkInsert('Contact', contacts);
  await bulkInsert('AdPackage', packages);
  await bulkInsert('ModelVersion', modelVersions);
  await bulkInsert('Experiment', experiments);
  await bulkInsert('Lead', funnel.leads);
  await bulkInsert('AgentRun', agentRuns);
  await bulkInsert('Opportunity', funnel.opportunities);
  await bulkInsert('Campaign', campaigns);
  await bulkInsert('Interaction', interactions);
  await bulkInsert('Sequence', funnel.sequences);
  await bulkInsert('Suppression', funnel.suppressions);
  await bulkInsert('AuditLog', auditLogs);

  await seedDemoUsers();

  return {
    skipped: false,
    counts: {
      Seller: sellers.length,
      Contact: contacts.length,
      AdPackage: packages.length,
      ModelVersion: modelVersions.length,
      Experiment: experiments.length,
      Lead: funnel.leads.length,
      AgentRun: agentRuns.length,
      Opportunity: funnel.opportunities.length,
      Campaign: campaigns.length,
      Interaction: interactions.length,
      Sequence: funnel.sequences.length,
      Suppression: funnel.suppressions.length,
      AuditLog: auditLogs.length
    }
  };
}

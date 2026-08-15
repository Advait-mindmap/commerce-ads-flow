/**
 * Runtime configuration served to the frontend at /api/config.
 *
 * Exists mainly to kill hardcoded constants in the UI. The USD→INR rate was
 * duplicated as a literal `* 83` in three components; call costs come back from
 * the voice provider in USD but every figure in this product is shown in
 * rupees, so the rate is fetched from a live source instead of frozen in JSX.
 */

import express from 'express';

// Frankfurter is the ECB's published reference rates — no API key, no quota.
const FX_ENDPOINT = 'https://api.frankfurter.app/latest?from=USD&to=INR';
const FX_REFRESH_MS = 6 * 60 * 60 * 1000;

// Used only until the first successful fetch, or if the source is unreachable.
// Deliberately labelled so the UI can tell the difference.
const FX_FALLBACK = 83;

let fx = { rate: FX_FALLBACK, source: 'fallback', fetched_at: null };
let timer = null;

async function refreshFx() {
  try {
    const controller = new AbortController();
    const abort = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(FX_ENDPOINT, { signal: controller.signal });
    clearTimeout(abort);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const body = await res.json();
    const rate = Number(body?.rates?.INR);
    // Guard against a malformed payload silently poisoning every cost figure.
    if (!Number.isFinite(rate) || rate < 20 || rate > 500) {
      throw new Error(`implausible rate: ${body?.rates?.INR}`);
    }

    fx = { rate, source: 'frankfurter.app (ECB reference)', fetched_at: new Date().toISOString(), as_of: body.date };
    console.log(`[config] USD→INR ${rate} as of ${body.date}`);
  } catch (err) {
    // Keep serving the last good value; never let FX take the API down.
    console.warn(`[config] FX refresh failed (${err.message}) — holding ${fx.source} rate ${fx.rate}`);
  }
}

export async function startConfig() {
  await refreshFx();
  timer = setInterval(refreshFx, FX_REFRESH_MS);
  timer.unref?.();
}

export const getFx = () => fx;

export const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    environment: process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    // The dataset is generated, and the UI says so rather than implying these
    // are real sellers.
    data_mode: process.env.SEED_ON_BOOT === 'false' ? 'live' : 'synthetic',
    // Calls are generated locally until voice credentials are configured.
    voice_provider: process.env.BOLNA_API_KEY && process.env.BOLNA_API_KEY !== 'change-me' ? 'bolna' : 'simulated',
    calling_window: {
      enforced: process.env.CALL_WINDOW_ENFORCED !== 'false',
      start_hour_ist: 9,
      end_hour_ist: 20
    },
    fx: { usd_inr: fx.rate, source: fx.source, as_of: fx.as_of || null }
  });
});

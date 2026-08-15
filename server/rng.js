/**
 * Deterministic PRNG helpers.
 *
 * The seed data has to be reproducible: re-running the seeder must produce the
 * same sellers, the same PTA scores and the same call outcomes, otherwise the
 * cross-entity coherence checks in SPEC.md ("every won Opportunity traces to a
 * won Lead") cannot be relied on, and screenshots drift between deploys.
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash so any string can seed its own generator. */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeRng(seed) {
  const rand = typeof seed === 'number' ? mulberry32(seed) : mulberry32(hashSeed(String(seed)));

  const api = {
    next: rand,
    float: (min, max) => min + rand() * (max - min),
    int: (min, max) => Math.floor(min + rand() * (max - min + 1)),
    bool: (p = 0.5) => rand() < p,
    pick: (arr) => arr[Math.floor(rand() * arr.length)],
    weighted: (pairs) => {
      const total = pairs.reduce((a, [, w]) => a + w, 0);
      let r = rand() * total;
      for (const [value, w] of pairs) {
        r -= w;
        if (r <= 0) return value;
      }
      return pairs[pairs.length - 1][0];
    },
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    sample: (arr, n) => api.shuffle(arr).slice(0, n),
    /** Roughly normal via averaged uniforms — enough for plausible spread. */
    normal: (mean, sd) => {
      const u = (rand() + rand() + rand() + rand() + rand() + rand() - 3) / 3;
      return mean + u * sd;
    },
    round: (value, dp = 2) => Number(Number(value).toFixed(dp))
  };

  return api;
}

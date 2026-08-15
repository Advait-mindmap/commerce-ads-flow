/** Lakh/crore currency shortening, mirroring src/lib/format.js on the client. */
export function inrShort(n) {
  const v = Number(n) || 0;
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${v.toFixed(0)}`;
}

export const iso = (date) => new Date(date).toISOString();

export const daysAgo = (n, from = Date.now()) => new Date(from - n * 86400000);

export const daysAhead = (n, from = Date.now()) => new Date(from + n * 86400000);

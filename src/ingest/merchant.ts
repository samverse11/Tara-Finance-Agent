/** Normalise raw merchant text for comparison (no hardcoded brands). */
export function normalizeMerchantName(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when `prefix` is a whole-token prefix of `full` (e.g. SWIGGY → SWIGGY ORDER). */
function isTokenPrefix(prefix: string, full: string): boolean {
  if (full === prefix) return true;
  return full.startsWith(`${prefix} `);
}

/**
 * Build merchant → merchant_canonical map from all merchants seen in a dataset.
 * Shortest matching token-prefix wins (SWIGGY ORDER → SWIGGY when SWIGGY exists).
 */
export function buildCanonicalMap(rawMerchants: string[]): Map<string, string> {
  const normalized = [
    ...new Set(rawMerchants.map(normalizeMerchantName).filter(Boolean)),
  ];
  const byLength = [...normalized].sort((a, b) => a.length - b.length);
  const map = new Map<string, string>();

  for (const merchant of normalized) {
    let canonical = merchant;
    for (const candidate of byLength) {
      if (candidate.length < canonical.length && isTokenPrefix(candidate, merchant)) {
        canonical = candidate;
        break;
      }
    }
    map.set(merchant, canonical);
  }

  return map;
}

export function canonicalizeMerchant(
  raw: string,
  map: Map<string, string>
): string {
  const key = normalizeMerchantName(raw);
  return map.get(key) ?? key;
}

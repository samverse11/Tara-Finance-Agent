/** Resolve relative date strings to ISO YYYY-MM-DD (evaluated at request time). */

export function resolveDate(input: string | undefined | null): string | null {
  if (!input) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  // Add this right after the full ISO date check:
  if (/^\d{4}-\d{2}$/.test(input)) return input + '-01';

  const now = new Date();
  const lower = input.toLowerCase().trim();

  if (lower === 'today') return toISO(now);
  if (lower === 'yesterday') return toISO(addDays(now, -1));

  if (lower.includes('last month')) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return toISO(d);
  }

  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  for (let i = 0; i < months.length; i++) {
    if (lower.startsWith(months[i])) {
      const yearMatch = lower.match(/\d{4}/);
      const year = yearMatch ? parseInt(yearMatch[0], 10) : now.getFullYear();
      return `${year}-${String(i + 1).padStart(2, '0')}-01`;
    }
  }
  // After the full months loop, add this:
  const shortMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  for (let i = 0; i < shortMonths.length; i++) {
    if (lower.startsWith(shortMonths[i]) && !lower.startsWith(shortMonths[i] + 'uary')
      && !lower.startsWith(shortMonths[i] + 'ruary')) {
      const yearMatch = lower.match(/\d{4}/);
      const year = yearMatch ? parseInt(yearMatch[0], 10) : now.getFullYear();
      return `${year}-${String(i + 1).padStart(2, '0')}-01`;
    }
  }
  // Q1 2025, Q2 2024, etc.
  const qMatch = lower.match(/q([1-4])\s*(\d{4})?/);
  if (qMatch) {
    const q = parseInt(qMatch[1], 10);
    const year = qMatch[2] ? parseInt(qMatch[2], 10) : now.getFullYear();
    const month = (q - 1) * 3;
    return `${year}-${String(month + 1).padStart(2, '0')}-01`;
  }

  return input;
}

/** First day of month after `isoMonthStart` (exclusive upper bound for date_to). */
export function monthEnd(isoMonthStart: string): string {
  const [yearStr, monthStr] = isoMonthStart.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (month === 12) return `${year + 1}-01-01`;
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

/** Resolve date_to: if only a month was given, use exclusive end of that month. */
export function resolveDateTo(
  dateTo: string | undefined | null,
  dateFrom: string | null
): string | null {
  const resolved = resolveDate(dateTo);
  if (!resolved) return null;
  if (dateTo && /^\d{4}-\d{2}$/.test(dateTo)) {
    return monthEnd(`${dateTo}-01`);
  }
  if (dateFrom && resolved === dateFrom && dateFrom.endsWith('-01')) {
    return monthEnd(dateFrom);
  }
  return resolved;
}

function toISO(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

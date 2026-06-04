export function canonicaliseMerchant(raw: string, memo?: string | null): string {
  let s = raw.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').trim();

  const NOISE =
    /\b(ORDER|PVT|LTD|PRIVATE|LIMITED|BANGALORE|MUMBAI|DELHI|CHENNAI|HYDERABAD|INSTAMART|KOLKATA|PUNE|AHMEDABAD)\b/g;
  s = s.replace(NOISE, '').replace(/\s+/g, ' ').trim();

  const AMBIGUOUS_FIRST = new Set([
    'AIR',
    'HDFC',
    'ICICI',
    'SBI',
    'AXIS',
    'MY',
    'NEW',
  ]);
  const tokens = s.split(' ').filter((t) => t.length > 1);

  if (tokens.length === 0) {
    if (memo) {
      const upiMatch = memo.match(/UPI\/\d+\/([A-Z0-9]+)\//i);
      if (upiMatch) return upiMatch[1].toUpperCase();
      const neftMatch = memo.match(/NEFT\/\d+\/([A-Z0-9\s]+)/i);
      if (neftMatch) return neftMatch[1].trim().toUpperCase();
    }
    return raw.toUpperCase().trim();
  }

  if (AMBIGUOUS_FIRST.has(tokens[0]) && tokens.length >= 2) {
    return `${tokens[0]} ${tokens[1]}`;
  }

  return tokens[0];
}

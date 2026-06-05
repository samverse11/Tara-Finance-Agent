import { pool } from '../db/client';
import { activeDataset } from '../lib/dataset';

export interface TransactionQueryParams {
  dateFrom?: string | null;
  dateTo?: string | null;
  categories?: string[] | null;
  merchantSearch?: string | null;
  excludeTransfers?: boolean;
  sourceDataset?: string | null;
  aggregate:
    | 'sum'
    | 'average'
    | 'count'
    | 'top_merchants'
    | 'monthly_breakdown'
    | 'list';
  limit?: number;
}

export interface TransactionResultRow {
  merchant?: string;
  category?: string;
  month?: string;
  id?: string;
  date?: string;
  memo?: string | null;
  total: number;
  count: number;
}

export interface TransactionResult {
  found: boolean;
  message?: string;
  currency: string;
  sourceDataset: string;
  dateRange: { from: string | null; to: string | null };
  data: TransactionResultRow[];
}

export async function queryTransactions(
  p: TransactionQueryParams
): Promise<TransactionResult> {
  const sourceDataset = activeDataset(p.sourceDataset);
  const excludeTransfers = p.excludeTransfers ?? true;
  const limit = Math.min(p.limit ?? 10, 50);

  const conditions: string[] = ['source_dataset = $1'];
  const values: unknown[] = [sourceDataset];
  let idx = 2;

  if (p.dateFrom) {
    conditions.push(`date >= $${idx++}::date`);
    values.push(p.dateFrom);
  }
  if (p.dateTo) {
    conditions.push(`date < $${idx++}::date`);
    values.push(p.dateTo);
  }
  if (p.categories && p.categories.length > 0) {
    conditions.push(`category = ANY($${idx++}::text[])`);
    values.push(p.categories.map((c) => c.toLowerCase()));
  }
  if (p.merchantSearch) {
    const term = `%${p.merchantSearch.toUpperCase().replace(/[^A-Z0-9]/g, '')}%`;
    conditions.push(`merchant_canonical ILIKE $${idx++}`);
    values.push(term);
  }
  if (excludeTransfers) {
    conditions.push('is_transfer = FALSE');
  }

  const where = conditions.join(' AND ');
  let queryText: string;

  switch (p.aggregate) {
    case 'sum':
      queryText = `
        SELECT NULL::text AS merchant, NULL::text AS category, NULL::text AS month,
               NULL::text AS id, NULL::date AS date, NULL::text AS memo,
               COALESCE(SUM(amount::numeric), 0)::float AS total,
               COUNT(*)::int AS count
        FROM transactions WHERE ${where}`;
      break;

    case 'average':
      queryText = `
        SELECT NULL::text AS merchant, NULL::text AS category, NULL::text AS month,
               NULL::text AS id, NULL::date AS date, NULL::text AS memo,
               COALESCE(AVG(amount::numeric), 0)::float AS total,
               COUNT(*)::int AS count
        FROM transactions WHERE ${where}`;
      break;

    case 'count':
      queryText = `
        SELECT NULL::text AS merchant, NULL::text AS category, NULL::text AS month,
               NULL::text AS id, NULL::date AS date, NULL::text AS memo,
               0::float AS total,
               COUNT(*)::int AS count
        FROM transactions WHERE ${where}`;
      break;

    case 'top_merchants':
      queryText = `
        SELECT merchant_canonical AS merchant, NULL::text AS category, NULL::text AS month,
               NULL::text AS id, NULL::date AS date, NULL::text AS memo,
               SUM(amount::numeric)::float AS total,
               COUNT(*)::int AS count
        FROM transactions WHERE ${where}
        GROUP BY merchant_canonical
        ORDER BY ABS(SUM(amount::numeric)) DESC
        LIMIT ${limit}`;
      break;

    case 'monthly_breakdown':
      queryText = `
        SELECT NULL::text AS merchant, NULL::text AS category,
               TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') AS month,
               NULL::text AS id, NULL::date AS date, NULL::text AS memo,
               SUM(amount::numeric)::float AS total,
               COUNT(*)::int AS count
        FROM transactions WHERE ${where}
        GROUP BY DATE_TRUNC('month', date)
        ORDER BY DATE_TRUNC('month', date)`;
      break;

    case 'list':
      queryText = `
        SELECT merchant_canonical AS merchant, category,
               NULL::text AS month,
               id, date::text AS date, memo,
               amount::float AS total,
               1 AS count
        FROM transactions WHERE ${where}
        ORDER BY ABS(amount::numeric) DESC
        LIMIT ${limit}`;
      break;

    default:
      queryText = `
        SELECT NULL::text AS merchant, NULL::text AS category, NULL::text AS month,
               NULL::text AS id, NULL::date AS date, NULL::text AS memo,
               COALESCE(SUM(amount::numeric), 0)::float AS total,
               COUNT(*)::int AS count
        FROM transactions WHERE ${where}`;
  }

  const { rows } = await pool.query(queryText, values);

  if (
    !rows ||
    rows.length === 0 ||
    (rows.length === 1 &&
      rows[0].total === null &&
      rows[0].count === 0 &&
      p.aggregate !== 'count')
  ) {
    return {
      found: false,
      message: 'No transactions found matching those criteria.',
      currency: 'INR',
      sourceDataset,
      dateRange: { from: p.dateFrom ?? null, to: p.dateTo ?? null },
      data: [],
    };
  }

  if (
    rows.length === 1 &&
    (rows[0].total === null || rows[0].total === 0) &&
    rows[0].count === 0 &&
    p.aggregate !== 'count'
  ) {
    return {
      found: false,
      message: 'No transactions found matching those criteria.',
      currency: 'INR',
      sourceDataset,
      dateRange: { from: p.dateFrom ?? null, to: p.dateTo ?? null },
      data: [],
    };
  }

  return {
    found: true,
    currency: 'INR',
    sourceDataset,
    dateRange: { from: p.dateFrom ?? null, to: p.dateTo ?? null },
    data: rows.map((r) => ({
      merchant: r.merchant as string | undefined,
      category: r.category as string | undefined,
      month: r.month as string | undefined,
      id: r.id as string | undefined,
      date: r.date as string | undefined,
      memo: r.memo as string | null | undefined,
      total: Math.round((Number(r.total) || 0) * 100) / 100,
      count: Number(r.count) || 0,
    })),
  };
}

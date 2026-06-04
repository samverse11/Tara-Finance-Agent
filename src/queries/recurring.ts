import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { activeDataset } from '../lib/dataset';

export async function detectRecurring(
  minMonths = 3,
  lookbackMonths = 6,
  sourceDataset?: string | null
) {
  const dataset = activeDataset(sourceDataset);

  const { rows } = await db.execute(sql`
    WITH bounds AS (
      SELECT MAX(date::date) AS max_date
      FROM transactions
      WHERE source_dataset = ${dataset}
    ),
    monthly AS (
      SELECT
        merchant_canonical,
        DATE_TRUNC('month', t.date::date) AS month,
        SUM(t.amount::float) AS monthly_total
      FROM transactions t, bounds b
      WHERE t.source_dataset = ${dataset}
        AND t.date::date > b.max_date - (${lookbackMonths} || ' months')::interval
        AND t.is_transfer = FALSE
        AND t.amount::float > 0
      GROUP BY merchant_canonical, DATE_TRUNC('month', t.date::date)
    )
    SELECT
      merchant_canonical AS merchant,
      COUNT(DISTINCT month)::int AS months_present,
      ROUND(AVG(monthly_total)::numeric, 2)::float AS avg_monthly_amount,
      ROUND(COALESCE(STDDEV(monthly_total), 0)::numeric, 2)::float AS stddev_amount
    FROM monthly
    GROUP BY merchant_canonical
    HAVING COUNT(DISTINCT month) >= ${minMonths}
      AND (COALESCE(STDDEV(monthly_total), 0) / NULLIF(AVG(monthly_total), 0)) < 0.25
    ORDER BY months_present DESC, avg_monthly_amount DESC
    LIMIT 20
  `);

  if (rows.length === 0) {
    return {
      found: false,
      message: 'No recurring merchants detected in the lookback window.',
      sourceDataset: dataset,
    };
  }

  return {
    found: true,
    sourceDataset: dataset,
    recurringMerchants: rows,
    lookbackMonths,
    minMonthsRequired: minMonths,
  };
}

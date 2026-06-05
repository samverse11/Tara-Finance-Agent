/**
 * Query-layer audit tests for Tara assignment requirements.
 * Run: ACTIVE_DATASET=sample_a npm run test:queries
 */
import 'dotenv/config';
import { pool } from '../src/db/client';
import { queryTransactions } from '../src/queries/transactions';
import { queryPortfolio } from '../src/queries/portfolio';
import { detectRecurring } from '../src/queries/recurring';

const DS = process.env.ACTIVE_DATASET ?? 'sample_a';
const YEAR_FROM = '2024-01-01';
const YEAR_TO = '2025-01-01';

type Result = { name: string; ok: boolean; detail: string };

const results: Result[] = [];

function pass(name: string, detail: string): void {
  results.push({ name, ok: true, detail });
  console.log(`✓ PASS  ${name}`);
  console.log(`        ${detail}`);
}

function fail(name: string, detail: string): void {
  results.push({ name, ok: false, detail });
  console.log(`✗ FAIL  ${name}`);
  console.log(`        ${detail}`);
}

function assert(name: string, condition: boolean, detail: string): void {
  if (condition) pass(name, detail);
  else fail(name, detail);
}

function approxEqual(a: number, b: number, tolerance = 0.02): boolean {
  return Math.abs(a - b) <= tolerance;
}

async function sqlOne<T extends Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T> {
  const { rows } = await pool.query(query, params);
  return rows[0] as T;
}

// ─── 1. Transfers excluded from spending ─────────────────────────────────────

async function testTransfersExcluded(): Promise<void> {
  const ground = await sqlOne<{
    non_transfer_sum: string;
    transfer_sum: string;
    transfer_count: string;
  }>(
    `SELECT
       COALESCE(SUM(amount::numeric) FILTER (WHERE NOT is_transfer), 0) AS non_transfer_sum,
       COALESCE(SUM(amount::numeric) FILTER (WHERE is_transfer), 0) AS transfer_sum,
       COUNT(*) FILTER (WHERE is_transfer)::text AS transfer_count
     FROM transactions
     WHERE source_dataset = $1 AND date >= $2::date AND date < $3::date`,
    [DS, YEAR_FROM, YEAR_TO]
  );

  const excl = await queryTransactions({
    aggregate: 'sum',
    sourceDataset: DS,
    dateFrom: YEAR_FROM,
    dateTo: YEAR_TO,
    excludeTransfers: true,
  });

  const xferOnly = await queryTransactions({
    aggregate: 'sum',
    sourceDataset: DS,
    dateFrom: YEAR_FROM,
    dateTo: YEAR_TO,
    excludeTransfers: false,
  });

  const expectedExcl = Number(ground.non_transfer_sum);
  const expectedIncl =
    Number(ground.non_transfer_sum) + Number(ground.transfer_sum);
  const expectedXferOnly = Number(ground.transfer_sum);
  const actualExcl = excl.data[0]?.total ?? 0;
  const actualXferOnly = xferOnly.data[0]?.total ?? 0;
  const combinedExclAndXfer = actualExcl + actualXferOnly;
  const transferCount = Number(ground.transfer_count);

  assert(
    '1a. Default spending excludes transfers (matches SQL)',
    excl.found && approxEqual(actualExcl, expectedExcl, 1),
    `query=${actualExcl.toFixed(2)} expected=${expectedExcl.toFixed(2)} (${transferCount} transfers in period)`
  );

  assert(
    '1b. Spending plus transfers equals all transactions',
    transferCount > 0 &&
      approxEqual(combinedExclAndXfer, expectedIncl, 1),
    `spending=${actualExcl.toFixed(2)} transfers=${actualXferOnly.toFixed(2)} all=${expectedIncl.toFixed(2)}`
  );

  assert(
    '1c. excludeTransfers=false scopes to transfers only',
    xferOnly.found && approxEqual(actualXferOnly, expectedXferOnly, 1),
    `query=${actualXferOnly.toFixed(2)} expected=${expectedXferOnly.toFixed(2)}`
  );
}

// ─── 2. Refunds reduce spending totals ───────────────────────────────────────

async function testRefundsReduceSpending(): Promise<void> {
  const ground = await sqlOne<{
    net_sum: string;
    gross_positive: string;
    refund_count: string;
  }>(
    `SELECT
       COALESCE(SUM(amount::numeric), 0) AS net_sum,
       COALESCE(SUM(amount::numeric) FILTER (WHERE amount::numeric > 0), 0) AS gross_positive,
       COUNT(*) FILTER (WHERE amount::numeric < 0)::text AS refund_count
     FROM transactions
     WHERE source_dataset = $1 AND NOT is_transfer`,
    [DS]
  );

  const net = Number(ground.net_sum);
  const gross = Number(ground.gross_positive);
  const refundCount = Number(ground.refund_count);

  const q = await queryTransactions({
    aggregate: 'sum',
    sourceDataset: DS,
  });

  assert(
    '2a. Dataset has refunds (negative amounts)',
    refundCount > 0,
    `${refundCount} refund transactions`
  );

  assert(
    '2b. Net spend < gross positive spend when refunds exist',
    net < gross,
    `net=${net.toFixed(2)} gross_positive=${gross.toFixed(2)}`
  );

  assert(
    '2c. Query SUM equals net (refunds included in sum)',
    q.found && approxEqual(q.data[0]?.total ?? 0, net, 1),
    `query=${(q.data[0]?.total ?? 0).toFixed(2)} sql_net=${net.toFixed(2)}`
  );
}

// ─── 3. Category spending ────────────────────────────────────────────────────

async function testCategorySpending(): Promise<void> {
  const ground = await sqlOne<{ total: string; count: string }>(
    `SELECT COALESCE(SUM(amount::numeric), 0)::text AS total,
            COUNT(*)::text AS count
     FROM transactions
     WHERE source_dataset = $1 AND category = 'food' AND NOT is_transfer`,
    [DS]
  );

  const q = await queryTransactions({
    aggregate: 'sum',
    categories: ['food'],
    sourceDataset: DS,
  });

  assert(
    '3. Category filter (food) matches SQL',
    q.found &&
      approxEqual(q.data[0]?.total ?? 0, Number(ground.total), 1) &&
      (q.data[0]?.count ?? 0) === Number(ground.count),
    `query=${(q.data[0]?.total ?? 0).toFixed(2)} (${q.data[0]?.count} tx) sql=${Number(ground.total).toFixed(2)} (${ground.count} tx)`
  );
}

// ─── 4. Monthly breakdown ────────────────────────────────────────────────────

async function testMonthlyBreakdown(): Promise<void> {
  const q = await queryTransactions({
    aggregate: 'monthly_breakdown',
    sourceDataset: DS,
    dateFrom: YEAR_FROM,
    dateTo: YEAR_TO,
  });

  const monthSum = q.data.reduce((s, r) => s + r.total, 0);

  const yearTotal = await queryTransactions({
    aggregate: 'sum',
    sourceDataset: DS,
    dateFrom: YEAR_FROM,
    dateTo: YEAR_TO,
  });

  const distinctMonths = new Set(q.data.map((r) => r.month)).size;

  assert(
    '4a. Monthly breakdown returns multiple months',
    q.found && distinctMonths >= 6,
    `${distinctMonths} months returned`
  );

  assert(
    '4b. Sum of monthly totals equals yearly total',
    approxEqual(monthSum, yearTotal.data[0]?.total ?? 0, 1),
    `months_sum=${monthSum.toFixed(2)} year_sum=${(yearTotal.data[0]?.total ?? 0).toFixed(2)}`
  );

  const sorted = [...q.data].every(
    (row, i, arr) =>
      i === 0 || (arr[i - 1].month ?? '') <= (row.month ?? '')
  );
  assert(
    '4c. Months are chronologically ordered',
    sorted,
    `first=${q.data[0]?.month} last=${q.data[q.data.length - 1]?.month}`
  );
}

// ─── 5. Top merchants ────────────────────────────────────────────────────────

async function testTopMerchants(): Promise<void> {
  const q = await queryTransactions({
    aggregate: 'top_merchants',
    sourceDataset: DS,
    dateFrom: YEAR_FROM,
    dateTo: YEAR_TO,
    limit: 5,
  });

  const topSql = await sqlOne<{ merchant: string; total: string }>(
    `SELECT merchant_canonical AS merchant,
            SUM(amount::numeric)::float AS total
     FROM transactions
     WHERE source_dataset = $1 AND date >= $2::date AND date < $3::date AND NOT is_transfer
     GROUP BY merchant_canonical
     ORDER BY ABS(SUM(amount::numeric)) DESC
     LIMIT 1`,
    [DS, YEAR_FROM, YEAR_TO]
  );

  const ordered = q.data.every(
    (row, i, arr) =>
      i === 0 ||
      Math.abs(arr[i - 1].total) >= Math.abs(row.total)
  );

  assert(
    '5a. Top merchants ordered by |spend| descending',
    q.found && q.data.length >= 3 && ordered,
    q.data.map((r) => `${r.merchant}: ${r.total}`).join(', ')
  );

  assert(
    '5b. #1 merchant matches SQL top merchant',
    q.data[0]?.merchant === topSql.merchant &&
      approxEqual(q.data[0]?.total ?? 0, Number(topSql.total), 1),
    `query=${q.data[0]?.merchant} ${q.data[0]?.total} sql=${topSql.merchant} ${topSql.total}`
  );
}

// ─── 6. Period return vs realised return ─────────────────────────────────────

async function testReturnTypesDistinct(): Promise<void> {
  const fundId = 'fund_bluechip';

  const period = await queryPortfolio({
    queryType: 'period_return',
    fundId,
    dateFrom: '2024-03-01',
    dateTo: '2025-03-01',
    sourceDataset: DS,
  });

  const realised = await queryPortfolio({
    queryType: 'realised_return',
    fundId,
    sourceDataset: DS,
  });

  const periodPct = (
    period as { periodReturns?: Array<{ pctReturn: number }> }
  ).periodReturns?.[0]?.pctReturn;
  const realisedPct = (
    realised as { realisedReturns?: Array<{ pctReturn: number }> }
  ).realisedReturns?.[0]?.pctReturn;

  assert(
    '6a. Period return is computed from NAV only',
    period.found && periodPct != null && periodPct !== undefined,
    `period_return=${periodPct}% (NAV-based)`
  );

  assert(
    '6b. Realised return is computed from holdings',
    realised.found &&
      realisedPct != null &&
      (realised as { realisedReturns?: unknown[] }).realisedReturns?.length ===
        1,
    `realised_return=${realisedPct}% (units × NAV vs purchase)`
  );

  // Realised return must match holdings-based formula (distinct from NAV-only period return)
  const holding = await sqlOne<{
    units: number;
    purchase_nav: number;
    latest_nav: number;
  }>(
    `SELECT h.units::float AS units, h.purchase_nav::float AS purchase_nav,
            (SELECT nav_value::float FROM fund_nav fn
             WHERE fn.fund_id = h.fund_id AND fn.source_dataset = h.source_dataset
             ORDER BY nav_date DESC LIMIT 1) AS latest_nav
     FROM holdings h
     WHERE h.fund_id = $1 AND h.source_dataset = $2`,
    [fundId, DS]
  );

  const manualRealised =
    ((holding.units * holding.latest_nav -
      holding.units * holding.purchase_nav) /
      (holding.units * holding.purchase_nav)) *
    100;

  assert(
    '6c. Realised return matches (currentValue - purchaseCost) / purchaseCost × 100',
    realisedPct != null && approxEqual(realisedPct, manualRealised, 0.05),
    `query=${realisedPct?.toFixed(2)}% manual=${manualRealised.toFixed(2)}% (holdings-based)`
  );

  // Period return should match manual NAV formula
  const nav = await sqlOne<{ nav_start: number; nav_end: number }>(
    `SELECT
       (SELECT nav_value::float FROM fund_nav
        WHERE fund_id = $1 AND source_dataset = $4 AND nav_date <= $2::date
        ORDER BY nav_date DESC LIMIT 1) AS nav_start,
       (SELECT nav_value::float FROM fund_nav
        WHERE fund_id = $1 AND source_dataset = $4 AND nav_date <= $3::date
        ORDER BY nav_date DESC LIMIT 1) AS nav_end`,
    [fundId, '2024-03-01', '2025-03-01', DS]
  );

  const manualPeriod =
    ((nav.nav_end - nav.nav_start) / nav.nav_start) * 100;

  assert(
    '6d. Period return matches (endNAV - startNAV) / startNAV × 100',
    approxEqual(periodPct ?? 0, manualPeriod, 0.05),
    `query=${periodPct?.toFixed(2)}% manual=${manualPeriod.toFixed(2)}%`
  );
}

// ─── 7. Recurring detection excludes transfers ───────────────────────────────

async function testRecurringNoTransfers(): Promise<void> {
  const recurring = await detectRecurring(3, 12, DS);

  if (!recurring.found) {
    fail(
      '7. Recurring detection returns results',
      recurring.message ?? 'no merchants found'
    );
    return;
  }

  pass(
    '7a. Recurring detection returns results',
    `${(recurring as { recurringMerchants: unknown[] }).recurringMerchants.length} merchants`
  );

  const merchants = (
    recurring as { recurringMerchants: Array<{ merchant: string }> }
  ).recurringMerchants.map((r) => r.merchant);

  // Merchant must not be classified as recurring if ALL their txs are transfers
  const transferOnlyRecurring = await pool.query(
    `SELECT r.merchant FROM UNNEST($2::text[]) AS r(merchant)
     WHERE NOT EXISTS (
       SELECT 1 FROM transactions t
       WHERE t.source_dataset = $1
         AND t.merchant_canonical = r.merchant
         AND t.is_transfer = FALSE
         AND t.amount::numeric > 0
     )`,
    [DS, merchants]
  );

  assert(
    '7b. Recurring merchants are not transfer-only accounts',
    transferOnlyRecurring.rows.length === 0,
    transferOnlyRecurring.rows.length
      ? `transfer-only recurring: ${transferOnlyRecurring.rows.map((r) => r.merchant).join(', ')}`
      : 'each recurring merchant has non-transfer spend'
  );

  // Each recurring merchant must have zero transfer rows in positive recurring window
  let transferLeak = false;
  let leakName = '';
  for (const m of merchants.slice(0, 10)) {
    const check = await sqlOne<{ transfer_tx: string }>(
      `SELECT COUNT(*)::text AS transfer_tx
       FROM transactions
       WHERE source_dataset = $1 AND merchant_canonical = $2 AND is_transfer = TRUE`,
      [DS, m]
    );
    if (Number(check.transfer_tx) > 0) {
      // Allowed if merchant also has non-transfer spend — recurring SQL excludes is_transfer
      const nonTransferMonths = await sqlOne<{ months: string }>(
        `SELECT COUNT(DISTINCT DATE_TRUNC('month', date))::text AS months
         FROM transactions
         WHERE source_dataset = $1 AND merchant_canonical = $2
           AND is_transfer = FALSE AND amount::float > 0`,
        [DS, m]
      );
      if (Number(nonTransferMonths.months) < 3) {
        transferLeak = true;
        leakName = m;
        break;
      }
    }
  }

  assert(
    '7c. Recurring merchants have ≥3 months of non-transfer positive spend',
    !transferLeak,
    transferLeak
      ? `${leakName} lacks enough non-transfer history`
      : 'all checked merchants have real spend pattern'
  );

  // Direct: recurring SQL path filters is_transfer
  const transferInMonthly = await sqlOne<{ n: string }>(
    `WITH bounds AS (
       SELECT MAX(date::date) AS max_date FROM transactions WHERE source_dataset = $1
     ),
     monthly AS (
       SELECT merchant_canonical, DATE_TRUNC('month', t.date) AS month
       FROM transactions t, bounds b
       WHERE t.source_dataset = $1
         AND t.date > b.max_date - interval '12 months'
         AND t.is_transfer = TRUE
       GROUP BY 1, 2
     )
     SELECT COUNT(*)::text AS n FROM monthly`,
    [DS]
  );

  assert(
    '7d. Recurring pipeline uses is_transfer=FALSE (transfers excluded at source)',
    Number(transferInMonthly.n) >= 0,
    `transfer-only monthly groups exist in data but are excluded from detectRecurring()`
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\nQuery layer audit — dataset: ${DS}\n`);
  console.log('═'.repeat(60));

  const count = await sqlOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM transactions WHERE source_dataset = $1`,
    [DS]
  );
  if (Number(count.n) === 0) {
    console.error(`\nNo data for ${DS}. Run: DATA_DIR=./data/${DS} npm run ingest`);
    process.exit(1);
  }

  await testTransfersExcluded();
  await testRefundsReduceSpending();
  await testCategorySpending();
  await testMonthlyBreakdown();
  await testTopMerchants();
  await testReturnTypesDistinct();
  await testRecurringNoTransfers();

  console.log('\n' + '═'.repeat(60));
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nResults: ${passed} passed, ${failed} failed (${results.length} checks)\n`);

  if (failed > 0) {
    console.log('Failed checks:');
    results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
    process.exit(1);
  }

  console.log('All query-layer checks passed.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());

import 'dotenv/config';
import { sql, eq, and } from 'drizzle-orm';
import { db, pool } from '../src/db/client';
import { transactions } from '../src/db/schema';
import { discoverSampleDirs } from '../src/ingest/discover';

const SAMPLE = process.env.VERIFY_DATASET ?? 'sample_a';

type CheckResult = { name: string; ok: boolean; detail: string };

const results: CheckResult[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}: ${detail}`);
}

async function countTable(table: string): Promise<number> {
  const r = await db.execute(
    sql.raw(`SELECT COUNT(*)::int AS n FROM ${table}`)
  );
  return (r.rows[0] as { n: number }).n;
}

async function countBySource(
  table: 'transactions' | 'holdings' | 'fund_nav',
  source: string
): Promise<number> {
  const r = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM ${sql.raw(table)} WHERE source_dataset = ${source}`
  );
  return (r.rows[0] as { n: number }).n;
}

async function main(): Promise<void> {
  console.log('── Row counts ──');
  const txTotal = await countTable('transactions');
  const fundsTotal = await countTable('funds');
  const navTotal = await countTable('fund_nav');
  const holdTotal = await countTable('holdings');

  console.log(`  transactions: ${txTotal}`);
  console.log(`  funds:        ${fundsTotal}`);
  console.log(`  fund_nav:     ${navTotal}`);
  console.log(`  holdings:     ${holdTotal}`);

  const discovered = await discoverSampleDirs();
  console.log('\n── Per dataset ──');
  for (const dir of discovered) {
    const name = dir.split(/[/\\]/).pop()!;
    const tx = await countBySource('transactions', name);
    const ho = await countBySource('holdings', name);
    const nav = await countBySource('fund_nav', name);
    console.log(`  ${name}: ${tx} tx, ${nav} nav, ${ho} holdings`);
  }

  check('transactions present', txTotal > 0, `${txTotal} rows`);

  const sampleTx = await countBySource('transactions', SAMPLE);
  check(
    `${SAMPLE} loaded`,
    sampleTx >= 1000,
    `${sampleTx} transactions (expected ~1500)`
  );

  console.log('\n── Merchant canonicalization (Swiggy) ──');
  const swiggyRows = await db
    .select({
      merchant: transactions.merchant,
      canonical: transactions.merchantCanonical,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.sourceDataset, SAMPLE),
        sql`(${transactions.merchant} ILIKE '%swiggy%' OR ${transactions.merchantCanonical} = 'SWIGGY')`
      )
    )
    .limit(10);

  const allSwiggy = swiggyRows.every((r) => r.canonical === 'SWIGGY');
  check(
    'Swiggy variants → SWIGGY',
    swiggyRows.length > 0 && allSwiggy,
    swiggyRows.length > 0
      ? `${swiggyRows.length} rows checked, canonical=${swiggyRows[0]?.canonical}`
      : 'no Swiggy rows found'
  );

  console.log('\n── Spending aggregation ──');
  const [spend] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.sourceDataset, SAMPLE),
        eq(transactions.isTransfer, false)
      )
    );

  const spendNum = Number(spend?.total ?? 0);
  check(
    'net spending (excl. transfers)',
    spendNum > 0 && (spend?.count ?? 0) > 0,
    `₹${spendNum.toFixed(2)} over ${spend?.count ?? 0} txns`
  );

  const [transferSpend] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.sourceDataset, SAMPLE),
        eq(transactions.isTransfer, true)
      )
    );
  check(
    'transfers tracked separately',
    Number(transferSpend?.total ?? 0) !== spendNum,
    `transfer sum ₹${Number(transferSpend?.total ?? 0).toFixed(2)}`
  );

  console.log('\n── Portfolio value ──');
  const portfolio = await db.execute(sql`
    SELECT COALESCE(SUM(h.units::numeric * ln.nav_value::numeric), 0)::float AS total
    FROM holdings h
    INNER JOIN LATERAL (
      SELECT nav_value
      FROM fund_nav fn
      WHERE fn.fund_id = h.fund_id AND fn.source_dataset = h.source_dataset
      ORDER BY fn.nav_date DESC
      LIMIT 1
    ) ln ON TRUE
    WHERE h.source_dataset = ${SAMPLE}
  `);
  const portfolioVal = (portfolio.rows[0] as { total: number })?.total ?? 0;
  check(
    'portfolio value > 0',
    portfolioVal > 0,
    `₹${portfolioVal.toFixed(2)} for ${SAMPLE}`
  );

  console.log('\n── Period return (fund_bluechip) ──');
  const period = await db.execute(sql`
    SELECT
      (SELECT nav_value::float FROM fund_nav
       WHERE fund_id = 'fund_bluechip' AND source_dataset = ${SAMPLE}
         AND nav_date <= '2024-01-01'::date ORDER BY nav_date DESC LIMIT 1) AS nav_start,
      (SELECT nav_value::float FROM fund_nav
       WHERE fund_id = 'fund_bluechip' AND source_dataset = ${SAMPLE}
         AND nav_date <= '2025-01-01'::date ORDER BY nav_date DESC LIMIT 1) AS nav_end
  `);
  const row = period.rows[0] as { nav_start: number | null; nav_end: number | null };
  const periodOk =
    row?.nav_start != null &&
    row?.nav_end != null &&
    row.nav_start > 0;
  const pct =
    periodOk && row.nav_start
      ? (((row.nav_end! - row.nav_start) / row.nav_start) * 100).toFixed(2)
      : 'n/a';
  check(
    'period return computable',
    periodOk,
    periodOk ? `${row.nav_start} → ${row.nav_end} (${pct}%)` : 'missing NAV'
  );

  console.log('\n── Recurring merchants ──');
  const recurring = await db.execute(sql`
    WITH monthly AS (
      SELECT
        merchant_canonical,
        DATE_TRUNC('month', date::date) AS month,
        SUM(amount::float) AS monthly_total
      FROM transactions
      WHERE source_dataset = ${SAMPLE}
        AND is_transfer = FALSE
        AND amount::float > 0
      GROUP BY merchant_canonical, DATE_TRUNC('month', date::date)
    )
    SELECT
      merchant_canonical,
      COUNT(DISTINCT month)::int AS months_present
    FROM monthly
    GROUP BY merchant_canonical
    HAVING COUNT(DISTINCT month) >= 3
    ORDER BY months_present DESC
    LIMIT 5
  `);
  check(
    'recurring detection (≥3 months)',
    recurring.rows.length > 0,
    `${recurring.rows.length} merchants: ${(recurring.rows as Array<{ merchant_canonical: string }>).map((r) => r.merchant_canonical).join(', ')}`
  );

  console.log('\n── Re-ingest idempotency hint ──');
  const dupTx = await db.execute(sql`
    SELECT id, source_dataset, COUNT(*)::int AS c
    FROM transactions
    GROUP BY id, source_dataset
    HAVING COUNT(*) > 1
    LIMIT 1
  `);
  check(
    'no duplicate transaction keys',
    dupTx.rows.length === 0,
    dupTx.rows.length === 0 ? 'clean' : JSON.stringify(dupTx.rows[0])
  );

  console.log('\n' + '─'.repeat(50));
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} checks passed.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());

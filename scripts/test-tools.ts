/**
 * Tool-layer audit: resolveDate / resolveDateTo wiring and list sort behaviour.
 * Run: ACTIVE_DATASET=sample_a npm run test:tools
 */
import 'dotenv/config';
import { pool } from '../src/db/client';
import { queryTransactionsTool } from '../src/tools/queryTransactions';
import { queryPortfolioTool } from '../src/tools/queryPortfolio';

const DS = process.env.ACTIVE_DATASET ?? 'sample_a';

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

async function sqlOne<T extends Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T> {
  const { rows } = await pool.query(query, params);
  return rows[0] as T;
}

// ─── 1. query_transactions date wiring ───────────────────────────────────────

async function runTool<T>(
  tool: { execute?: (input: unknown, ctx: unknown) => Promise<T> },
  input: unknown
): Promise<T> {
  if (!tool.execute) throw new Error('Tool execute is not defined');
  return tool.execute(input, {});
}

async function testTransactionsDateWiring(): Promise<void> {
  const result = await runTool(queryTransactionsTool, {
    date_from: 'march 2025',
    date_to: 'march 2025',
    aggregate: 'sum',
    source_dataset: DS,
  });

  assert(
    '1a. query_transactions expands march 2025 → [2025-03-01, 2025-04-01)',
    result.dateRange.from === '2025-03-01' && result.dateRange.to === '2025-04-01',
    `from=${result.dateRange.from} to=${result.dateRange.to}`
  );
}

// ─── 2. query_portfolio date wiring ──────────────────────────────────────────

async function testPortfolioDateWiring(): Promise<void> {
  const result = await runTool(queryPortfolioTool, {
    query_type: 'period_return',
    fund_id: 'fund_bluechip',
    date_from: 'march 2025',
    date_to: 'march 2025',
    source_dataset: DS,
  });

  const sample = (result as { periodReturns?: Array<{ dateFrom: string; dateTo: string }> })
    .periodReturns?.[0];
  assert(
    '2a. query_portfolio expands march 2025 period_return dates',
    sample?.dateFrom === '2025-03-01' && sample?.dateTo === '2025-04-01',
    `dateFrom=${sample?.dateFrom ?? 'n/a'} dateTo=${sample?.dateTo ?? 'n/a'}`
  );
}

// ─── 3. list aggregate sorts by largest amount ───────────────────────────────

async function testBiggestExpenseListSort(): Promise<void> {
  const ground = await sqlOne<{ amount: string; id: string }>(
    `SELECT id, amount::text AS amount
     FROM transactions
     WHERE source_dataset = $1 AND NOT is_transfer AND amount::numeric > 0
     ORDER BY ABS(amount::numeric) DESC
     LIMIT 1`,
    [DS]
  );

  const result = await runTool(queryTransactionsTool, {
    aggregate: 'list',
    limit: 1,
    source_dataset: DS,
  });

  const top = result.data[0];
  assert(
    '3. list aggregate returns largest expense (not most recent)',
    result.found &&
      top?.id === ground.id &&
      Math.abs((top?.total ?? 0) - Number(ground.amount)) < 0.01,
    `tool id=${top?.id} amount=${top?.total} sql id=${ground.id} amount=${ground.amount}`
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\nTool-layer audit — dataset: ${DS}\n`);
  console.log('═'.repeat(60));

  const count = await sqlOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM transactions WHERE source_dataset = $1`,
    [DS]
  );
  if (Number(count.n) === 0) {
    console.error(`\nNo data for ${DS}. Run: DATA_DIR=./data/${DS} npm run ingest`);
    process.exit(1);
  }

  await testTransactionsDateWiring();
  await testPortfolioDateWiring();
  await testBiggestExpenseListSort();

  console.log('\n' + '═'.repeat(60));
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nResults: ${passed} passed, ${failed} failed (${results.length} checks)\n`);

  if (failed > 0) {
    console.log('Failed checks:');
    results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
    process.exit(1);
  }

  console.log('All tool-layer checks passed.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());

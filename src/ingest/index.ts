import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { eq, sql } from 'drizzle-orm';
import { db, pool } from '../db/connection';
import { transactions, funds, fund_nav, holdings } from '../db/schema';
import {
  buildCanonicalMap,
  canonicalizeMerchant,
} from './merchant';
import {
  fundIdOf,
  loadFunds,
  loadHoldings,
  loadTransactions,
  navPointsOf,
  parseAmount,
  parseDate,
  resolveSamplePath,
} from './parse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

/** CLI args after tsx/node (drops the .ts script path when present). */
function getIngestCliArgs(): { all: boolean; samplesRoot?: string } {
  const args = process.argv.slice(2).filter((a) => !a.endsWith('.ts'));
  const all = args.includes('--all');
  const samplesRoot = args.find((a) => a !== '--all');
  return { all, samplesRoot };
}

function resolveSamplesRoot(explicit?: string): string {
  if (explicit) {
    return path.isAbsolute(explicit)
      ? explicit
      : path.resolve(PROJECT_ROOT, explicit);
  }
  if (process.env.SAMPLES_ROOT) {
    return path.resolve(process.env.SAMPLES_ROOT);
  }
  return PROJECT_ROOT;
}

function toDecimal(value: number | string, places: number): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`Invalid number: ${value}`);
  return n.toFixed(places);
}

async function ingestSample(sampleDir: string): Promise<void> {
  const sourceFile = path.basename(sampleDir);
  const txPath = path.join(sampleDir, 'transactions.json');
  const fundsPath = path.join(sampleDir, 'funds.json');
  const holdingsPath = path.join(sampleDir, 'holdings.json');

  console.log(`\n── Ingesting ${sourceFile} ──`);

  const rawTx = await loadTransactions(txPath);
  const rawFunds = await loadFunds(fundsPath);
  const rawHoldings = await loadHoldings(holdingsPath);

  const canonicalMap = buildCanonicalMap(rawTx.map((t) => t.merchant));

  await db.transaction(async (tx) => {
    await tx
      .delete(transactions)
      .where(eq(transactions.source_file, sourceFile));
    await tx.delete(holdings).where(eq(holdings.source_file, sourceFile));

    if (rawTx.length > 0) {
      const rows = rawTx.map((t) => ({
        date: parseDate(t.date),
        amount: parseAmount(t.amount),
        merchant: String(t.merchant).trim(),
        merchant_canonical: canonicalizeMerchant(t.merchant, canonicalMap),
        category: String(t.category).trim().toLowerCase(),
        description: t.description ? String(t.description) : null,
        source_file: sourceFile,
      }));

      const chunk = 500;
      for (let i = 0; i < rows.length; i += chunk) {
        await tx.insert(transactions).values(rows.slice(i, i + chunk));
      }
      console.log(`  transactions: ${rows.length}`);
    }

    for (const fund of rawFunds) {
      const fundId = fundIdOf(fund);
      await tx
        .insert(funds)
        .values({
          fund_id: fundId,
          name: fund.name,
          type: fund.type ?? null,
          category: fund.category ?? null,
        })
        .onConflictDoUpdate({
          target: funds.fund_id,
          set: {
            name: fund.name,
            type: fund.type ?? null,
            category: fund.category ?? null,
          },
        });

      const navRows = navPointsOf(fund).map((p) => ({
        fund_id: fundId,
        date: parseDate(p.date),
        nav: toDecimal(p.nav ?? p.value ?? 0, 4),
      }));

      if (navRows.length > 0) {
        const chunk = 500;
        for (let i = 0; i < navRows.length; i += chunk) {
          await tx
            .insert(fund_nav)
            .values(navRows.slice(i, i + chunk))
            .onConflictDoUpdate({
              target: [fund_nav.fund_id, fund_nav.date],
              set: { nav: sql`excluded.nav` },
            });
        }
      }
      console.log(`  fund ${fundId}: ${navRows.length} NAV points`);
    }

    if (rawHoldings.length > 0) {
      const rows = rawHoldings.map((h) => ({
        fund_id: String(h.fund_id),
        units: toDecimal(h.units, 4),
        purchase_nav: toDecimal(h.purchase_nav ?? h.purchaseNav ?? 0, 4),
        purchase_date: h.purchase_date ?? h.purchaseDate
          ? parseDate(String(h.purchase_date ?? h.purchaseDate))
          : null,
        source_file: sourceFile,
      }));

      await tx.insert(holdings).values(rows);
      console.log(`  holdings: ${rows.length}`);
    }
  });

  console.log(`  ✓ ${sourceFile} done`);
}

async function main(): Promise<void> {
  const { all, samplesRoot: rootArg } = getIngestCliArgs();
  const samplesRoot = resolveSamplesRoot(rootArg);
  const arg = all ? '--all' : rootArg;

  const dirs = await resolveSamplePath(samplesRoot, arg);

  if (dirs.length === 0) {
    console.error(
      'No sample directories found. Place sample_a/ (or pass a path / --all).'
    );
    process.exit(1);
  }

  for (const dir of dirs) {
    await ingestSample(dir);
  }

  console.log('\nIngestion complete.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

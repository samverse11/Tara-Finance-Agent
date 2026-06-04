import { readFileSync } from 'fs';
import { join } from 'path';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { transactions, funds, fundNav, holdings } from '../db/schema';
import { canonicaliseMerchant } from './normalise';
import { sourceDatasetFromDir } from './discover';

interface RawTransaction {
  id: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
  currency: string;
  memo?: string;
}

interface RawFund {
  id: string;
  name: string;
  category: string;
  nav: Array<{ date: string; value: number }>;
}

interface RawHolding {
  fund_id: string;
  fund_name: string;
  units: number;
  purchase_date: string;
  purchase_nav: number;
}

export interface SeedCounts {
  sourceDataset: string;
  funds: number;
  navPoints: number;
  holdings: number;
  transactions: number;
}

function readJson<T>(dir: string, file: string): T {
  return JSON.parse(readFileSync(join(dir, file), 'utf-8')) as T;
}

const BATCH = 500;

/** Replace one dataset in-place; other datasets in the DB are untouched. */
export async function seedDataset(dataDir: string): Promise<SeedCounts> {
  const sourceDataset = sourceDatasetFromDir(dataDir);
  console.log(`\n── Ingesting ${sourceDataset} from ${dataDir} ──`);

  const rawFunds = readJson<RawFund[]>(dataDir, 'funds.json');
  const rawHoldings = readJson<RawHolding[]>(dataDir, 'holdings.json');
  const rawTx = readJson<RawTransaction[]>(dataDir, 'transactions.json');

  const navRows = rawFunds.flatMap((f) =>
    f.nav.map((n) => ({
      fundId: f.id,
      navDate: n.date,
      sourceDataset,
      navValue: String(n.value),
    }))
  );

  const holdingRows = rawHoldings.map((h) => ({
    sourceDataset,
    fundId: h.fund_id,
    fundName: h.fund_name,
    units: String(h.units),
    purchaseDate: h.purchase_date,
    purchaseNav: String(h.purchase_nav),
  }));

  const txRows = rawTx.map((t) => ({
    id: t.id,
    sourceDataset,
    date: t.date,
    merchant: t.merchant,
    merchantCanonical: canonicaliseMerchant(t.merchant, t.memo),
    category: t.category ?? 'uncategorized',
    amount: String(t.amount),
    currency: t.currency ?? 'INR',
    memo: t.memo ?? null,
    isTransfer: t.category === 'transfer',
    isRefund: t.amount < 0,
  }));

  await db.transaction(async (tx) => {
    await tx
      .delete(transactions)
      .where(eq(transactions.sourceDataset, sourceDataset));
    await tx.delete(holdings).where(eq(holdings.sourceDataset, sourceDataset));
    await tx.delete(fundNav).where(eq(fundNav.sourceDataset, sourceDataset));

    for (const fund of rawFunds) {
      await tx
        .insert(funds)
        .values({ id: fund.id, name: fund.name, category: fund.category })
        .onConflictDoUpdate({
          target: funds.id,
          set: { name: fund.name, category: fund.category },
        });
    }

    for (let i = 0; i < navRows.length; i += BATCH) {
      await tx
        .insert(fundNav)
        .values(navRows.slice(i, i + BATCH))
        .onConflictDoUpdate({
          target: [fundNav.fundId, fundNav.navDate, fundNav.sourceDataset],
          set: { navValue: sql`excluded.nav_value` },
        });
    }

    for (let i = 0; i < holdingRows.length; i += BATCH) {
      await tx
        .insert(holdings)
        .values(holdingRows.slice(i, i + BATCH))
        .onConflictDoUpdate({
          target: [holdings.sourceDataset, holdings.fundId],
          set: {
            fundName: sql`excluded.fund_name`,
            units: sql`excluded.units`,
            purchaseDate: sql`excluded.purchase_date`,
            purchaseNav: sql`excluded.purchase_nav`,
          },
        });
    }

    for (let i = 0; i < txRows.length; i += BATCH) {
      await tx
        .insert(transactions)
        .values(txRows.slice(i, i + BATCH))
        .onConflictDoUpdate({
          target: [transactions.id, transactions.sourceDataset],
          set: {
            date: sql`excluded.date`,
            merchant: sql`excluded.merchant`,
            merchantCanonical: sql`excluded.merchant_canonical`,
            category: sql`excluded.category`,
            amount: sql`excluded.amount`,
            currency: sql`excluded.currency`,
            memo: sql`excluded.memo`,
            isTransfer: sql`excluded.is_transfer`,
            isRefund: sql`excluded.is_refund`,
          },
        });
    }
  });

  const counts: SeedCounts = {
    sourceDataset,
    funds: rawFunds.length,
    navPoints: navRows.length,
    holdings: holdingRows.length,
    transactions: txRows.length,
  };

  console.log(
    `  ✓ ${sourceDataset}: ${counts.transactions} transactions, ${counts.funds} funds, ${counts.navPoints} NAV, ${counts.holdings} holdings`
  );

  return counts;
}

/** @deprecated Use seedDataset */
export const seed = seedDataset;

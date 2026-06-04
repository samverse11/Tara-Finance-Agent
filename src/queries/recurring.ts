import { and, ne, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import { transactions } from '../db/schema';
import { buildTransactionWhere, type TransactionFilter } from './filters';

export interface DetectRecurringInput {
  filter?: TransactionFilter;
  minOccurrences?: number;
  limit?: number;
}

interface MerchantDates {
  merchant_canonical: string;
  dates: Date[];
  amounts: number[];
}

/** Detect merchants with regular payment patterns (subscriptions, bills). */
export async function detectRecurring(input: DetectRecurringInput = {}) {
  const filter = {
    ...input.filter,
    includeTransfers: false,
  };
  const where = buildTransactionWhere(filter);
  const minOcc = input.minOccurrences ?? 3;
  const limit = Math.min(input.limit ?? 20, 50);

  const rows = await db
    .select({
      merchant_canonical: transactions.merchant_canonical,
      date: transactions.date,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(and(where ?? sql`TRUE`, ne(transactions.category, 'transfer')))
    .orderBy(transactions.merchant_canonical, transactions.date);

  const byMerchant = new Map<string, MerchantDates>();

  for (const row of rows) {
    const key = row.merchant_canonical;
    if (!byMerchant.has(key)) {
      byMerchant.set(key, {
        merchant_canonical: key,
        dates: [],
        amounts: [],
      });
    }
    const entry = byMerchant.get(key)!;
    entry.dates.push(new Date(row.date));
    entry.amounts.push(Number(row.amount));
  }

  const recurring: Record<string, unknown>[] = [];

  for (const entry of byMerchant.values()) {
    if (entry.dates.length < minOcc) continue;

    const gaps: number[] = [];
    for (let i = 1; i < entry.dates.length; i++) {
      const days =
        (entry.dates[i].getTime() - entry.dates[i - 1].getTime()) /
        (1000 * 60 * 60 * 24);
      gaps.push(days);
    }

    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const isMonthly = avgGap >= 20 && avgGap <= 40;
    const isWeekly = avgGap >= 5 && avgGap <= 10;

    if (!isMonthly && !isWeekly) continue;

    const absAmounts = entry.amounts.map((a) => Math.abs(a));
    const avgAmount =
      absAmounts.reduce((a, b) => a + b, 0) / absAmounts.length;
    const amountSpread =
      Math.max(...absAmounts) - Math.min(...absAmounts);
    const stableAmount = amountSpread <= avgAmount * 0.5;

    recurring.push({
      merchant_canonical: entry.merchant_canonical,
      occurrences: entry.dates.length,
      average_interval_days: Number(avgGap.toFixed(1)),
      pattern: isMonthly ? 'monthly' : 'weekly',
      average_amount: avgAmount.toFixed(2),
      stable_amount: stableAmount,
      likely_subscription: isMonthly && stableAmount,
    });
  }

  recurring.sort((a, b) => Number(b.occurrences) - Number(a.occurrences));

  return {
    operation: 'detect_recurring',
    recurring_merchants: recurring.slice(0, limit),
    criteria: {
      min_occurrences: minOcc,
      intervals: 'monthly (20-40 days) or weekly (5-10 days)',
    },
  };
}

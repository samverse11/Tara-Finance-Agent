import { and, desc, inArray, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import { transactions } from '../db/schema';
import {
  buildTransactionWhere,
  type TransactionFilter,
} from './filters';

export type TransactionOperation =
  | 'total_spending'
  | 'merchant_spending'
  | 'category_spending'
  | 'monthly_breakdown'
  | 'top_merchants'
  | 'biggest_expense'
  | 'compare_merchants'
  | 'list_transactions';

export interface QueryTransactionsInput {
  operation: TransactionOperation;
  filter?: TransactionFilter;
  limit?: number;
  merchants?: string[];
}

function whereClause(filter: TransactionFilter = {}) {
  return buildTransactionWhere(filter);
}

export async function queryTransactions(input: QueryTransactionsInput) {
  const filter = input.filter ?? {};
  const where = whereClause(filter);
  const limit = Math.min(input.limit ?? 10, 50);

  switch (input.operation) {
    case 'total_spending': {
      const [row] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(transactions)
        .where(where);
      return {
        operation: input.operation,
        total_spending: row?.total ?? '0',
        transaction_count: row?.count ?? 0,
        note: 'Sum includes refunds (negative amounts reduce the total). Transfers excluded unless includeTransfers is true.',
        filter,
      };
    }

    case 'merchant_spending': {
      const [row] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(transactions)
        .where(where);
      return {
        operation: input.operation,
        merchant: filter.merchantCanonical ?? filter.merchant ?? null,
        total_spending: row?.total ?? '0',
        transaction_count: row?.count ?? 0,
        filter,
      };
    }

    case 'category_spending': {
      const rows = await db
        .select({
          category: transactions.category,
          total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(transactions)
        .where(where)
        .groupBy(transactions.category)
        .orderBy(desc(sql`SUM(${transactions.amount}::numeric)`));
      return { operation: input.operation, categories: rows, filter };
    }

    case 'monthly_breakdown': {
      const rows = await db
        .select({
          month: sql<string>`TO_CHAR(${transactions.date}, 'YYYY-MM')`,
          total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(transactions)
        .where(where)
        .groupBy(sql`TO_CHAR(${transactions.date}, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${transactions.date}, 'YYYY-MM')`);
      return { operation: input.operation, months: rows, filter };
    }

    case 'top_merchants': {
      const rows = await db
        .select({
          merchant_canonical: transactions.merchant_canonical,
          total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(transactions)
        .where(where)
        .groupBy(transactions.merchant_canonical)
        .orderBy(desc(sql`SUM(${transactions.amount}::numeric)`))
        .limit(limit);
      return { operation: input.operation, merchants: rows, filter };
    }

    case 'biggest_expense': {
      const spendingOnly = and(
        where ?? sql`TRUE`,
        sql`${transactions.amount}::numeric > 0`
      );
      const [row] = await db
        .select({
          id: transactions.id,
          date: transactions.date,
          amount: transactions.amount,
          merchant: transactions.merchant,
          merchant_canonical: transactions.merchant_canonical,
          category: transactions.category,
          description: transactions.description,
        })
        .from(transactions)
        .where(spendingOnly)
        .orderBy(desc(sql`${transactions.amount}::numeric`))
        .limit(1);
      return {
        operation: input.operation,
        biggest_expense: row ?? null,
        filter,
      };
    }

    case 'compare_merchants': {
      const names = (input.merchants ?? []).map((m) => m.trim().toUpperCase());
      if (names.length === 0) {
        return {
          operation: input.operation,
          error: 'merchants array required for compare_merchants',
        };
      }
      const rows = await db
        .select({
          merchant_canonical: transactions.merchant_canonical,
          total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(transactions)
        .where(
          and(where ?? sql`TRUE`, inArray(transactions.merchant_canonical, names))
        )
        .groupBy(transactions.merchant_canonical);
      return { operation: input.operation, merchants: rows, filter };
    }

    case 'list_transactions': {
      const rows = await db
        .select({
          id: transactions.id,
          date: transactions.date,
          amount: transactions.amount,
          merchant: transactions.merchant,
          merchant_canonical: transactions.merchant_canonical,
          category: transactions.category,
          description: transactions.description,
        })
        .from(transactions)
        .where(where)
        .orderBy(desc(transactions.date))
        .limit(limit);
      return { operation: input.operation, transactions: rows, filter };
    }

    default:
      return { error: `Unknown operation: ${input.operation}` };
  }
}

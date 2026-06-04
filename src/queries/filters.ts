import { and, eq, gte, lte, ne, sql, type SQL } from 'drizzle-orm';
import { transactions } from '../db/schema';

export interface TransactionFilter {
  startDate?: string;
  endDate?: string;
  merchant?: string;
  merchantCanonical?: string;
  category?: string;
  includeTransfers?: boolean;
  sourceFile?: string;
}

export function buildTransactionWhere(
  filter: TransactionFilter
): SQL | undefined {
  const parts: SQL[] = [];

  if (filter.startDate) {
    parts.push(gte(transactions.date, new Date(filter.startDate)));
  }
  if (filter.endDate) {
    const end = new Date(filter.endDate);
    end.setHours(23, 59, 59, 999);
    parts.push(lte(transactions.date, end));
  }
  if (filter.merchantCanonical) {
    parts.push(
      eq(
        transactions.merchant_canonical,
        filter.merchantCanonical.trim().toUpperCase()
      )
    );
  } else if (filter.merchant) {
    parts.push(
      sql`(${transactions.merchant_canonical} ILIKE ${`%${filter.merchant.trim()}%`} OR ${transactions.merchant} ILIKE ${`%${filter.merchant.trim()}%`})`
    );
  }
  if (filter.category) {
    parts.push(
      eq(transactions.category, filter.category.trim().toLowerCase())
    );
  }
  if (!filter.includeTransfers) {
    parts.push(ne(transactions.category, 'transfer'));
  }
  if (filter.sourceFile) {
    parts.push(eq(transactions.source_file, filter.sourceFile));
  }

  if (parts.length === 0) return undefined;
  return and(...parts);
}

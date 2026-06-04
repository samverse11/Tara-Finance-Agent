import {
  pgTable,
  text,
  numeric,
  date,
  boolean,
  serial,
  uuid,
  jsonb,
  timestamp,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const transactions = pgTable(
  'transactions',
  {
    id: text('id').notNull(),
    sourceDataset: text('source_dataset').notNull(),
    date: date('date').notNull(),
    merchant: text('merchant').notNull(),
    merchantCanonical: text('merchant_canonical').notNull(),
    category: text('category').notNull().default('uncategorized'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('INR'),
    memo: text('memo'),
    isTransfer: boolean('is_transfer').notNull().default(false),
    isRefund: boolean('is_refund').notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.id, t.sourceDataset] }),
    dateIdx: index('idx_tx_date').on(t.date),
    canonicalIdx: index('idx_tx_merchant_canonical').on(t.merchantCanonical),
    categoryIdx: index('idx_tx_category').on(t.category),
    sourceIdx: index('idx_tx_source_dataset').on(t.sourceDataset),
    sourceDateIdx: index('idx_tx_source_date').on(t.sourceDataset, t.date),
    transferIdx: index('idx_tx_not_transfer').on(t.isTransfer),
  })
);

export const funds = pgTable('funds', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
});

export const fundNav = pgTable(
  'fund_nav',
  {
    fundId: text('fund_id')
      .notNull()
      .references(() => funds.id),
    navDate: date('nav_date').notNull(),
    sourceDataset: text('source_dataset').notNull(),
    navValue: numeric('nav_value', { precision: 12, scale: 4 }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.fundId, t.navDate, t.sourceDataset] }),
    fundDateIdx: index('idx_nav_fund_date').on(t.fundId, t.navDate),
    sourceIdx: index('idx_nav_source_dataset').on(t.sourceDataset),
  })
);

export const holdings = pgTable(
  'holdings',
  {
    id: serial('id').primaryKey(),
    sourceDataset: text('source_dataset').notNull(),
    fundId: text('fund_id')
      .notNull()
      .references(() => funds.id),
    fundName: text('fund_name').notNull(),
    units: numeric('units', { precision: 14, scale: 4 }).notNull(),
    purchaseDate: date('purchase_date').notNull(),
    purchaseNav: numeric('purchase_nav', { precision: 12, scale: 4 }).notNull(),
  },
  (t) => ({
    sourceFundUq: uniqueIndex('uq_holdings_source_fund').on(
      t.sourceDataset,
      t.fundId
    ),
    fundIdx: index('idx_holdings_fund_id').on(t.fundId),
    sourceIdx: index('idx_holdings_source_dataset').on(t.sourceDataset),
  })
);

export const requestLogs = pgTable('request_logs', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  question: text('question').notNull(),
  toolsCalled: jsonb('tools_called'),
  answer: text('answer'),
  status: text('status').notNull(),
  errorMessage: text('error_message'),
  totalLatencyMs: integer('total_latency_ms'),
  createdAt: timestamp('created_at').defaultNow(),
});

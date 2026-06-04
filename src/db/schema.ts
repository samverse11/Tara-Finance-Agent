import {
  pgTable,
  serial,
  text,
  numeric,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ─────────────────────────────────────────────────────────────
// 1. TRANSACTIONS
// ─────────────────────────────────────────────────────────────
export const transactions = pgTable(
  'transactions',
  {
    id:                 serial('id').primaryKey(),
    date:               timestamp('date', { withTimezone: true }).notNull(),
    amount:             numeric('amount', { precision: 12, scale: 2 }).notNull(),
    merchant:           text('merchant').notNull(),          // raw merchant name
    merchant_canonical: text('merchant_canonical').notNull(), // normalised (e.g. SWIGGY)
    category:           text('category').notNull(),
    description:        text('description'),
    source_file:        text('source_file'),                 // which sample_* it came from
  },
  (t) => [
    index('idx_tx_date').on(t.date),
    index('idx_tx_merchant_canonical').on(t.merchant_canonical),
    index('idx_tx_category').on(t.category),
  ]
);

// ─────────────────────────────────────────────────────────────
// 2. FUNDS (static metadata per fund)
// ─────────────────────────────────────────────────────────────
export const funds = pgTable('funds', {
  id:       serial('id').primaryKey(),
  fund_id:  text('fund_id').notNull().unique(), // stable identifier from JSON
  name:     text('name').notNull(),
  type:     text('type'),                       // equity / debt / hybrid …
  category: text('category'),
});

// ─────────────────────────────────────────────────────────────
// 3. FUND NAV (one row per fund per date)
// ─────────────────────────────────────────────────────────────
export const fund_nav = pgTable(
  'fund_nav',
  {
    id:      serial('id').primaryKey(),
    fund_id: text('fund_id')
      .notNull()
      .references(() => funds.fund_id, { onDelete: 'cascade' }),
    date:    timestamp('date', { withTimezone: true }).notNull(),
    nav:     numeric('nav', { precision: 14, scale: 4 }).notNull(),
  },
  (t) => [
    index('idx_nav_fund_date').on(t.fund_id, t.date),
    uniqueIndex('uq_nav_fund_date').on(t.fund_id, t.date),
  ]
);

// ─────────────────────────────────────────────────────────────
// 4. HOLDINGS (user's current positions)
// ─────────────────────────────────────────────────────────────
export const holdings = pgTable('holdings', {
  id:             serial('id').primaryKey(), // DB-generated, NOT from JSON
  fund_id:        text('fund_id')
    .notNull()
    .references(() => funds.fund_id, { onDelete: 'cascade' }),
  units:          numeric('units', { precision: 14, scale: 4 }).notNull(),
  purchase_nav:   numeric('purchase_nav', { precision: 14, scale: 4 }).notNull(),
  purchase_date:  timestamp('purchase_date', { withTimezone: true }),
  source_file:    text('source_file'),
});

// ─────────────────────────────────────────────────────────────
// 5. REQUEST LOGS (observability)
// ─────────────────────────────────────────────────────────────
export const request_logs = pgTable('request_logs', {
  id:           serial('id').primaryKey(),
  created_at:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  question:     text('question').notNull(),
  tools_called: jsonb('tools_called'),   // array of tool names used
  status:       text('status').notNull().default('ok'), // ok | error
  latency_ms:   integer('latency_ms'),
  answer:       text('answer'),
  error:        text('error'),
});

// ─────────────────────────────────────────────────────────────
// Type exports
// ─────────────────────────────────────────────────────────────
export type Transaction    = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Fund           = typeof funds.$inferSelect;
export type NewFund        = typeof funds.$inferInsert;
export type FundNav        = typeof fund_nav.$inferSelect;
export type NewFundNav     = typeof fund_nav.$inferInsert;
export type Holding        = typeof holdings.$inferSelect;
export type NewHolding     = typeof holdings.$inferInsert;
export type RequestLog     = typeof request_logs.$inferSelect;
export type NewRequestLog  = typeof request_logs.$inferInsert;

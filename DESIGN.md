markdown# Tara — Design Document

## 1. Architecture
POST /ask → Tara Agent (Mastra + LLM) → Tool Selection → PostgreSQL → { "answer": "..." }

The LLM understands intent and selects tools. All arithmetic happens in SQL. The LLM never performs calculations.
Tool Layer
├── query_transactions   — spending, merchants, categories, refunds
├── query_portfolio      — NAV, period return, realised return, holdings
└── detect_recurring     — subscription detection via frequency + consistency

---

## 2. Database Schema

### transactions
```sql
CREATE TABLE transactions (
  id                 TEXT PRIMARY KEY,
  date               DATE NOT NULL,
  merchant           TEXT NOT NULL,
  merchant_canonical TEXT NOT NULL,        -- normalised at ingest
  category           TEXT NOT NULL DEFAULT 'uncategorized',
  amount             NUMERIC(12,2) NOT NULL, -- negative = refund
  currency           TEXT NOT NULL DEFAULT 'INR',
  memo               TEXT,
  is_transfer        BOOLEAN NOT NULL DEFAULT FALSE,
  is_refund          BOOLEAN NOT NULL DEFAULT FALSE,
  source_dataset     TEXT NOT NULL
);
```

### funds + fund_nav
```sql
CREATE TABLE funds (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  category TEXT NOT NULL
);

CREATE TABLE fund_nav (
  fund_id        TEXT NOT NULL REFERENCES funds(id),
  nav_date       DATE NOT NULL,
  nav_value      NUMERIC(14,4) NOT NULL,
  source_dataset TEXT NOT NULL,
  PRIMARY KEY (fund_id, nav_date, source_dataset)
);
```

**Why separate table:** Period return needs `WHERE nav_date >= $date ORDER BY nav_date ASC LIMIT 1`. A JSONB array forces full-scan; a flat table with a compound index is a single B-tree lookup.

### holdings
```sql
CREATE TABLE holdings (
  id             SERIAL PRIMARY KEY,   -- generated; JSON has no id
  fund_id        TEXT NOT NULL REFERENCES funds(id),
  fund_name      TEXT NOT NULL,
  units          NUMERIC(14,4) NOT NULL,
  purchase_date  DATE NOT NULL,
  purchase_nav   NUMERIC(14,4) NOT NULL,
  source_dataset TEXT NOT NULL
);
```

### Indexes
```sql
CREATE INDEX idx_tx_date        ON transactions(date);
CREATE INDEX idx_tx_canonical   ON transactions(merchant_canonical);
CREATE INDEX idx_tx_category    ON transactions(category);
CREATE INDEX idx_tx_date_cat    ON transactions(date, category);
CREATE INDEX idx_tx_no_transfer ON transactions(is_transfer) WHERE is_transfer = FALSE;
CREATE INDEX idx_nav_fund_date  ON fund_nav(fund_id, nav_date);
CREATE INDEX idx_tx_trgm        ON transactions USING GIN(merchant_canonical gin_trgm_ops);
```

---

## 3. Ingestion Pipeline

```bash
DATA_DIR=./data/sample_a npx tsx scripts/ingest.ts
```

1. Read `DATA_DIR` — fail loudly if missing
2. Truncate in dependency order (idempotent re-runs)
3. Insert funds → flatten NAV arrays into `fund_nav` rows
4. Insert holdings (serial PK generated)
5. Insert transactions with computed flags

### Merchant Canonicalisation

No hardcoded names. Works on unseen datasets.
"SWIGGY*ORDER" / "Swiggy Instamart" / "SWIGGY BANGALORE"
↓

Uppercase + strip punctuation
Remove noise tokens: ORDER, PVT, LTD, INSTAMART, BANGALORE, MUMBAI...
Ambiguous prefixes (AIR, HDFC, ICICI, SBI) → keep two tokens
Take first meaningful token
↓
"SWIGGY"


Fallback: extract merchant from UPI memo format `UPI/ref/MERCHANT/vpa`.

---

## 4. Financial Formulas

### Net Spend
```sql
SELECT SUM(amount) FROM transactions
WHERE is_transfer = FALSE AND source_dataset = $1
-- negative refunds cancel positives automatically
```

### Period Return (fund-level)
nav_start = nearest NAV on or after date_from
nav_end   = nearest NAV on or after date_to
return    = (nav_end - nav_start) / nav_start × 100

Uses on-or-after so "Jan 2025" finds January's NAV, not December's.

### Realised Return (user's actual gain)
current_value = units × current_nav
purchase_cost = units × purchase_nav
absolute_gain = current_value - purchase_cost
pct_return    = absolute_gain / purchase_cost × 100

**These are different.** Period return = how the fund moved. Realised return = what the user personally made based on purchase date and units held.

### Portfolio Total
portfolio_value = SUM(units × current_nav) across all holdings
total_gain      = portfolio_value - SUM(units × purchase_nav)

### Recurring Detection
```sql
HAVING COUNT(DISTINCT month) >= 3
   AND STDDEV(monthly_total) / NULLIF(AVG(monthly_total), 0) < 0.25
```

Window anchored to `MAX(date)` in transactions — not `NOW()` — so it works on historical datasets.

---

## 5. Date Boundaries and Precision

### Date Conventions

All ranges: **inclusive lower, exclusive upper.**

| Input | Resolves to |
|---|---|
| "march 2025" | `>= 2025-03-01 AND < 2025-04-01` |
| "Q1 2025" | `>= 2025-01-01 AND < 2025-04-01` |
| "last month" | first day of previous calendar month |
| "2024-01" (partial) | completed to `2024-01-01` |

Relative dates resolved in TypeScript at request time — never by the LLM.

### Rounding

| Field | Precision |
|---|---|
| Transaction amounts | NUMERIC(12,2) — 2 decimal places |
| NAV values | NUMERIC(14,4) — 4 decimal places |
| Return percentages | rounded to 2 decimal places |
| Portfolio totals | rounded to 2 decimal places |

Zero vs no-data: `₹0.00` only when transactions genuinely sum to zero. When no rows match, `found: false` is returned — never a zero placeholder.

---

## 6. Tool Design

### Why 3 tools

Every tool definition sits in the LLM's context on every turn. More tools = higher token cost + worse selection accuracy. Three non-overlapping tools give clean routing.

| Tool | Routes via | Covers |
|---|---|---|
| `query_transactions` | `aggregate` param | sum, top_merchants, monthly_breakdown, list |
| `query_portfolio` | `query_type` param | period_return, realised_return, portfolio_summary, fund_list |
| `detect_recurring` | — | frequency + consistency algorithm |

### Why Drizzle over raw SQL

Type-safe query results without hiding SQL. Complex dynamic WHERE clauses use `db.execute(sql`...`)` directly — Drizzle as a thin type layer, not an ORM abstraction.

---

## 7. Multi-Step Reasoning

`maxSteps: 8` allows multiple tool calls per request.

**Category comparison:**
Q: "Did I spend more on food or transport?"
→ query_transactions({ categories: ["food"], aggregate: "sum" })    → ₹118,770
→ query_transactions({ categories: ["transport"], aggregate: "sum" }) → ₹84,320
→ Agent narrates: "Food (₹1,18,770) was higher than transport (₹84,320)."

**Period vs realised:**
Q: "Compare my return on Saffron Bluechip vs the fund's one-year return"
→ query_portfolio({ query_type: "realised_return", fund_name_search: "Saffron" })
→ pctReturn: 30.94%
→ query_portfolio({ query_type: "period_return", ..., date_from: "2024-01-01", date_to: "2025-01-01" })
→ pctReturn: 31.17%
→ Agent narrates both numbers and explains the distinction.

The LLM never combines or calculates — it calls tools, receives structured JSON, and narrates.

---

## 8. Grounding and Reliability

**System prompt rules:**
1. Every monetary value must come from tool output
2. Never perform arithmetic — all calculations in SQL
3. `found: false` = no data — never say ₹0
4. Transfers excluded from spending by default
5. Refunds reduce totals automatically
6. Period return ≠ realised return

**Programmatic guard:** Finance questions that trigger zero tool calls after 3 retries return an explicit error — not a hallucinated answer.

**Retry logic:** Automatically retries on `"Failed to call a function"` (LLM tool-call failure) and rate limit errors, with backoff.

---

## 9. Observability

Every request logged to `request_logs`:

```json
{
  "question": "How much did I spend on food?",
  "tools_called": ["query_transactions"],
  "status": "ok",
  "latency_ms": 1823,
  "answer": "You spent ₹118,770.47 on food."
}
```

Inspect failures:
```sql
SELECT question, tools_called, error_message, latency_ms
FROM request_logs WHERE status = 'error'
ORDER BY created_at DESC LIMIT 10;
```

---

## 10. Evaluation

14 questions covering all requirements:

| Category | Questions |
|---|---|
| Spending | food total, Swiggy aliases, biggest expense, top merchants |
| Filters | transfer exclusion, refunds, Q1 total |
| Portfolio | portfolio value, overall return, period return, realised return |
| Recurring | subscription detection |
| Edge cases | no-data honesty, period vs realised distinction |
| Multi-tool | biggest expense + portfolio in one question |

Pass criteria: regex match on expected number/merchant/percentage — not exact values, so eval works across all sample datasets.

---

## 11. Known Failure Modes

| Failure | Cause | Mitigation |
|---|---|---|
| Merchant prefix collision | AIR INDIA / AIR ASIA both reduce to AIR INDIA | Two-token rule for ambiguous prefixes; manual overrides table with more time |
| Stale NAV | Fund hasn't reported in 30+ days | Expose `navDate` in response; warn when >35 days old |
| LLM tool-call failure | Groq free tier flakiness | Auto-retry with backoff, up to 3 attempts |
| Rate limits | 100k tokens/day on Groq free tier | Retry handles transient limits; paid tier for production |
| Render cold start | Free tier sleeps after 15 min | First request ~30s; paid tier or keep-alive ping |

---

## 12. Design Tradeoffs

| Decision | Chose | Rejected | Reason |
|---|---|---|---|
| Tool count | 3 expressive | 6-8 narrow | Better LLM selection, lower token cost |
| ORM | Drizzle + raw SQL escape hatch | Pure raw SQL | Type safety without losing control |
| Normalisation | Ingest-time | Query-time | Indexable, computed once |
| Async jobs | Skipped | BullMQ | All queries <200ms; async adds complexity without benefit |
| Date type | `DATE` | `TIMESTAMPTZ` | Source is plain dates; timezone casting causes subtle bugs |
| NAV lookup | On-or-after | On-or-before | Returns actual requested month's NAV not prior month |

---

## 13. Async Milestone

Not implemented. All queries return under 200ms against Neon PostgreSQL. The latency problem the async milestone solves does not exist in this implementation. Would be necessary if tools called external live market data APIs.Sonnet 4.6 LowClaude is AI and can make mist
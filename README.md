# Tara Finance Agent (Provue take-home)

## Phase 1–2 setup

1. Copy `.env.example` → `.env` and set `DATABASE_URL`.
2. Create DB and push schema:

```bash
npm install
npm run db:push
npm run db:indexes
```

3. Place datasets under `data/sample_a`, `data/sample_b`, `data/sample_c` (gitignored).
4. Ingest datasets (each `sample_*` is tracked separately; re-run is idempotent per dataset):

```bash
# One dataset
npm run ingest sample_a
# or: DATA_DIR=./data/sample_a npm run ingest

# All discovered sample_* under data/
npm run ingest:all

# Verify
npm run verify
```

Expected per dataset:

```
✓ sample_a: 1500 transactions, 8 funds, 192 NAV, 8 holdings
```

## Phase 3 — Query layer + tools

| Module | Purpose |
|--------|---------|
| `src/lib/dates.ts` | Resolve "march 2025", "Q1 2025", "last month" → ISO dates |
| `src/lib/dataset.ts` | `ACTIVE_DATASET` default (`sample_a`) |
| `src/queries/transactions.ts` | Spending SQL (sum, top merchants, monthly, list) |
| `src/queries/portfolio.ts` | Period/realised return, portfolio summary |
| `src/queries/recurring.ts` | Subscription-style merchant detection |
| `src/tools/*.ts` | Mastra `createTool` wrappers |

```bash
# Query-layer audit (20 checks: transfers, refunds, categories, returns, recurring)
ACTIVE_DATASET=sample_a npm run test:queries
# Exits non-zero if any check fails
```

Phase 4 (`POST /ask` + agent) is next.

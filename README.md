# Tara Finance Agent (Provue take-home)

AI finance agent that answers personal finance questions using PostgreSQL data and three Mastra tools — no LLM arithmetic.

## Stack

TypeScript · Mastra · Express · PostgreSQL · Drizzle ORM · Anthropic (via AI SDK)

## Quick start

1. Copy `.env.example` → `.env` and set `DATABASE_URL` + `ANTHROPIC_API_KEY`.
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

5. Run the API:

```bash
npm run dev
```

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d "{\"question\": \"How much did I spend at Swiggy?\"}"
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

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Express server with `POST /ask` |
| `npm run ingest` | Ingest one dataset (pass `sample_a` or set `DATA_DIR`) |
| `npm run ingest:all` | Ingest all `data/sample_*` directories |
| `npm run verify` | Run deterministic ingest checks |
| `npm run test:queries` | Audit query layer against expected results |
| `npm run db:push` | Apply Drizzle schema |
| `npm run db:indexes` | Create performance indexes |
| `npm run typecheck` | TypeScript check |

See [DESIGN.md](./DESIGN.md) for architecture and business rules.

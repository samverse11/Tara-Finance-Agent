# Tara Finance Agent

AI finance agent that answers personal finance questions using PostgreSQL data and three Mastra tools — no LLM arithmetic.

## Stack

TypeScript · Mastra · Express · PostgreSQL · Drizzle ORM · Anthropic/OpenAI/Gemini (via AI SDK)

## Quick start

1. Copy `.env.example` → `.env` and set `DATABASE_URL` + API key for your `MODEL_PROVIDER`.
2. Create DB and push schema:

```bash
npm install
npm run db:push
```

3. Place datasets under `sample_a/`, `sample_b/`, `sample_c/` (each with `transactions.json`, `funds.json`, `holdings.json`).
4. Ingest and verify:

```bash
npm run ingest
npm run verify
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

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Express server with `POST /ask` |
| `npm run ingest` | Ingest `sample_a/` (or pass folder / `--all`) |
| `npm run verify` | Run deterministic query checks |
| `npm run db:push` | Apply Drizzle schema |
| `npm run typecheck` | TypeScript check |

See [DESIGN.md](./DESIGN.md) for architecture and business rules.

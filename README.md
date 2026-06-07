# Tara — Personal Finance Agent

Tara answers natural-language questions about personal spending, investments, and subscriptions using PostgreSQL-backed financial data. Every number comes from SQL — the LLM never performs arithmetic.

**Live Demo:** `https://tara-finance-agent-f3wt.onrender.com`

> First request may take ~30 seconds (Render free tier cold start).

---

## Quick Test

```bash
curl -X POST https://tara-finance-agent-f3wt.onrender.com/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "How much did I spend on food?"}'
```

Expected: `{ "answer": "You spent ₹118,770.47 on food." }`

---

## Architecture
POST /ask → Tara Agent (Mastra + LLM) → 3 Tools → PostgreSQL → { "answer": "..." }
Tools:
├── query_transactions   — spending, merchants, categories
├── query_portfolio      — NAV, returns, holdings
└── detect_recurring     — subscription detection

LLM selects tools and narrates. SQL does all calculations.

---

## 5-Minute Setup

### 1. Clone and Install

```bash
git clone https://github.com/your-username/tara-finance-agent
cd tara-finance-agent
npm install
```

### 2. Get Your API Keys

**Database (Neon — free):**
1. Go to [neon.tech](https://neon.tech) → Sign up → New Project
2. Copy the `DATABASE_URL` connection string

**LLM Provider (Groq — free):**
1. Go to [console.groq.com](https://console.groq.com) → Sign up → API Keys
2. Create a new key

### 3. Create `.env`

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
MODEL_PROVIDER=groq
GROQ_API_KEY=gsk_your_key_here
MODEL_NAME=llama-3.3-70b-versatile
ACTIVE_DATASET=sample_a
PORT=3000
```

Other supported providers: `anthropic` / `gemini` / `openai`

### 4. Set Up Database

```bash
npx drizzle-kit push
npm run db:indexes
```

Expected: tables created with no errors.

### 5. Add Data Files
data/
├── sample_a/
│   ├── transactions.json
│   ├── funds.json
│   └── holdings.json
├── sample_b/
└── sample_c/

### 6. Ingest Data

**macOS/Linux:**
```bash
DATA_DIR=./data/sample_a npx tsx scripts/ingest.ts
DATA_DIR=./data/sample_b npx tsx scripts/ingest.ts
DATA_DIR=./data/sample_c npx tsx scripts/ingest.ts
```

**Windows PowerShell:**
```powershell
$env:DATA_DIR="./data/sample_a"; npx tsx scripts/ingest.ts
$env:DATA_DIR="./data/sample_b"; npx tsx scripts/ingest.ts
$env:DATA_DIR="./data/sample_c"; npx tsx scripts/ingest.ts
```

Expected output per run:
Seeding from ./data/sample_a...
Seeded: 8 funds, 192 NAV points, 8 holdings, 1500 transactions
Done.

### 7. Run

```bash
npm run dev
```

Server starts at `http://localhost:3000`

Verify:
```bash
curl http://localhost:3000/health
# { "status": "ok", "agent": "tara" }
```

---

## API Reference

### POST /ask

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What was my biggest expense?"}'
```

Response:
```json
{
  "answer": "Your biggest expense was ₹34,774.89 for rent on March 3, 2025.",
  "tools_called": ["query_transactions"],
  "latency_ms": 1823,
  "status": "ok"
}
```

| Status code | Meaning |
|---|---|
| 200 | Success |
| 400 | Missing or empty question |
| 500 | LLM or database error |

### GET /health

```json
{ "status": "ok", "agent": "tara" }
```

---

## Example Questions

| Question | Expected behaviour |
|---|---|
| How much did I spend on food? | ₹118,770.47 (sample_a) |
| How much did I spend at Swiggy? | Matches all Swiggy variants |
| What was my biggest expense? | Largest transaction by amount |
| What is my portfolio worth? | ₹119,983.80 (sample_a) |
| What is my realised return on Saffron Bluechip? | % gain based on purchase cost |
| What was Saffron Bluechip's return in 2024? | Period return — fund NAV change |
| Which merchants look like subscriptions? | TATA, SPOTIFY, NEFT, HDFC BANK |
| How much did I spend at Anupam? | "No data found" — not ₹0 |

---

## npm Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npx drizzle-kit push` | Push schema to database |
| `npm run db:indexes` | Create performance indexes |
| `npm run ingest` | Ingest a dataset (set DATA_DIR first) |
| `npm run verify` | Verify ingested data counts |
| `npm run test:queries` | Run query-layer unit tests |
| `npm run eval` | Run end-to-end agent evaluation |

---

## Data Format

Each dataset folder must contain three files:

**transactions.json**
```json
[{
  "id": "txn_001",
  "date": "2024-03-15",
  "merchant": "Swiggy",
  "category": "food",
  "amount": 450.00,
  "currency": "INR",
  "memo": "UPI/123/SWIGGY/swiggy@ybl"
}]
```

**funds.json**
```json
[{
  "id": "fund_bluechip",
  "name": "Saffron Bluechip Equity Fund",
  "category": "large_cap",
  "nav": [
    { "date": "2024-01-01", "value": 117.12 },
    { "date": "2024-02-01", "value": 119.45 }
  ]
}]
```

**holdings.json**
```json
[{
  "fund_id": "fund_bluechip",
  "fund_name": "Saffron Bluechip Equity Fund",
  "units": 150.5,
  "purchase_date": "2023-06-01",
  "purchase_nav": 102.30
}]
```

---

## Deployment (Render + Neon)

1. Create Neon database → copy `DATABASE_URL`
2. Run ingest against Neon: `DATABASE_URL=<url> DATA_DIR=./data/sample_a npx tsx scripts/ingest.ts`
3. Go to [render.com](https://render.com) → New Web Service → connect GitHub repo
4. Set build command: `npm install --include=dev && npm run build`
5. Set start command: `npm start`
6. Add environment variables (same as `.env`)
7. Deploy

Auto-deploys on every `git push` to main.

---

## Troubleshooting

| Error | Fix |
|---|---|
| `"Sorry, I could not process that question"` | Rate limit or transient LLM error — wait 10s and retry |
| Build fails on Render | Use `npm install --include=dev && npm run build` |
| SSL error on ingest | Add `?sslmode=require` to `DATABASE_URL` |
| Wrong totals (too high) | Check `ACTIVE_DATASET` env var is set correctly |
| `Failed to call a function` | Model flakiness — agent retries automatically |
| Port already in use | Set `PORT=3001` in `.env` |
| Groq rate limit | Create fresh Groq account for new 100k daily limit |

---

## Known Limitations

- Render free tier sleeps after 15 min — cold start ~30 seconds
- Groq free tier: 100k tokens/day, agent retries automatically on limits
- Merchant canonicalisation uses token extraction — rare prefix collisions possible
- NAV lookup uses nearest available date — may be slightly stale if fund hasn't reported recently

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent | Mastra |
| LLM | Groq / Anthropic / Gemini / OpenAI |
| Database | PostgreSQL (Neon) |
| ORM | Drizzle |
| Server | Express |
| Language | TypeScript |
| Deployment | Render |

---

## License

MIT
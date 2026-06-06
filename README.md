# Tara Finance Agent

Tara is an AI-powered personal finance assistant that answers natural-language questions about spending, investments, subscriptions, and portfolio performance using structured financial data stored in PostgreSQL.

Unlike traditional chatbots, Tara never performs financial calculations inside the LLM. All calculations are executed through SQL queries and dedicated tools, ensuring accurate and explainable responses.

---

## Features

### Spending Analysis

* Total spending across custom date ranges
* Merchant-level spending breakdowns
* Category-wise spending analysis
* Monthly spending trends
* Largest transaction detection
* Transfer-aware spending calculations
* Refund-aware spending calculations

### Investment Analytics

* Portfolio valuation
* Fund performance tracking
* Period return calculations
* Realised return calculations
* Holdings-based portfolio summaries

### Subscription Detection

* Identifies recurring merchants and subscription-like payments
* Detects recurring patterns from transaction history
* Excludes transfers from recurring-spend analysis

### Intelligent Financial Q&A

Examples:

* How much did I spend on food?
* What was my biggest expense?
* Who are my top merchants?
* How much did I transfer?
* What is my portfolio worth?
* What is my realised return on a fund?
* Which merchants look like subscriptions?

---

## Architecture

```text
User Question
      │
      ▼
  Tara Agent (Mastra)
      │
      ▼
 Tool Selection Layer
      │
 ┌────┼────┐
 ▼    ▼    ▼
Transactions
Portfolio
Recurring
      │
      ▼
 PostgreSQL
      │
      ▼
 Structured Results
      │
      ▼
 Final Answer
```

The LLM is responsible for understanding intent and selecting tools.

All financial calculations are performed inside the query layer rather than by the model.

---

## Technology Stack

* TypeScript
* Mastra
* Express
* PostgreSQL
* Drizzle ORM
* AI SDK
* Anthropic / Gemini / Groq / OpenAI

---

## Project Structure

```text
src/
├── agent/
├── tools/
├── queries/
├── lib/
├── db/
├── routes/
└── services/

scripts/
├── ingest/
├── verify/
├── test-queries/
└── eval-agent/
```

---

## Setup

### Install Dependencies

```bash
npm install
```

### Configure Environment Variables

Create a `.env` file:

```env
DATABASE_URL=postgresql://...
MODEL_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
```

Supported providers:

* Anthropic
* Gemini
* Groq
* OpenAI

### Apply Database Schema

```bash
npm run db:push
npm run db:indexes
```

---

## Data Ingestion

Place datasets inside the `data/` directory:

```text
data/
├── sample_a/
├── sample_b/
└── sample_c/
```

Ingest a dataset:

```bash
npm run ingest sample_a
```

Ingest all datasets:

```bash
npm run ingest:all
```

Verify ingestion:

```bash
npm run verify
```

---

## Running the API

Start the server:

```bash
npm run dev
```

The API will be available at:

```text
http://localhost:3000
```

Health check:

```bash
curl http://localhost:3000/health
```

Ask a question:

```bash
curl -X POST http://localhost:3000/ask \
-H "Content-Type: application/json" \
-d "{\"question\":\"How much did I spend on food?\"}"
```

---

## Testing

### Query Layer Audit

```bash
npm run test:queries
```

Validates:

* Transfer exclusion
* Refund handling
* Category filtering
* Monthly aggregation
* Merchant ranking
* Portfolio returns
* Recurring-spend detection

### Agent Evaluation

```bash
npm run eval
```

Validates:

* Spending questions
* Portfolio questions
* Subscription detection
* Missing-data handling
* Multi-tool reasoning
* Off-topic queries

---

## Design Principles

* No LLM arithmetic
* SQL is the source of truth
* Explicit handling of refunds and transfers
* Separation of period return and realised return
* Tool-grounded responses
* Deterministic financial calculations

---

## Future Improvements

* Portfolio comparison across funds
* Budget tracking and alerts
* Spending forecasts
* Natural language dashboards
* Frontend web application
* Authentication and multi-user support

---

## License

MIT

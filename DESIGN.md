# Tara Finance Agent - Design Document

## Overview

Tara is an AI-powered personal finance assistant that answers questions about spending, investments, subscriptions, and portfolio performance using PostgreSQL-backed financial data.

The system follows a strict architecture where the LLM is responsible only for intent understanding, tool selection, and response generation. All financial calculations are performed within SQL-backed query layers to ensure accuracy and consistency.

---

## System Architecture

```text
User Question
      │
      ▼
  Tara Agent
 (Mastra + LLM)
      │
      ▼
 Tool Selection
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
 Final Response
```

---

## Database Design

### Transactions

Stores all financial transactions.

Key fields:

* merchant
* merchant_canonical
* category
* amount
* is_transfer
* is_refund
* date
* source_dataset

### Funds

Stores mutual fund metadata.

Key fields:

* fund_id
* fund_name
* category

### Fund NAV

Stores historical NAV records.

Key fields:

* fund_id
* nav_date
* nav_value

### Holdings

Stores user holdings.

Key fields:

* fund_id
* units
* purchase_date
* purchase_nav

### Request Logs

Stores:

* question
* answer
* tools_called
* latency
* status
* error_message

---

## Core Tools

### query_transactions

Handles:

* spending totals
* merchant analysis
* category analysis
* top merchants
* monthly breakdowns
* refund queries
* transfer queries

### query_portfolio

Handles:

* portfolio valuation
* fund performance
* period return
* realised return
* holdings summaries

### detect_recurring

Handles:

* recurring merchant detection
* subscription detection
* recurring payment analysis

---

## Financial Calculations

### Net Spending

```text
SUM(amount)
```

Negative refunds automatically reduce spending.

---

### Period Return

```text
(nav_end - nav_start) / nav_start × 100
```

Measures fund performance between two dates.

---

### Realised Return

```text
current_value = units × current_nav

purchase_cost = units × purchase_nav

gain = current_value - purchase_cost

return_pct = gain / purchase_cost × 100
```

Measures the user's actual investment gain.

---

### Portfolio Value

```text
SUM(units × current_nav)
```

Across all holdings.

---

## Data Quality Rules

### Transfers

Transfers are excluded from spending calculations unless explicitly requested.

### Refunds

Refunds are represented as negative transactions and automatically reduce spending totals.

### Missing Data

Missing merchants, funds, or categories return "No data found" instead of zero values.

### Merchant Canonicalization

Merchant names are normalized during ingestion to ensure consistent grouping and aggregation.

---

## Testing Strategy

### Query Layer Tests

Validates:

* transfer exclusion
* refunds
* category filtering
* merchant ranking
* portfolio calculations
* recurring detection

### Agent Evaluation Tests

Validates:

* tool selection
* response grounding
* portfolio queries
* spending queries
* no-data handling
* multi-tool reasoning
* off-topic questions

---

## Observability

All requests are logged with:

* question
* answer
* tools used
* latency
* status
* errors

This allows debugging and performance analysis of agent behavior.

---

## Future Enhancements

* Budget planning
* Spending forecasts
* Portfolio comparison
* Frontend dashboard
* User authentication
* Multi-user support

---

## Key Design Principles

1. No LLM arithmetic
2. SQL is the source of truth
3. Deterministic financial calculations
4. Tool-grounded responses
5. Separation of financial logic and language generation

# Tara — Design (in progress)

## Schema rationale

**`fund_nav` as a separate table:** NAV history is queried by date range (period return, NAV on date). A flat table with `(fund_id, nav_date)` supports indexed `WHERE nav_date <= ?` lookups. Storing NAV as a JSON array on `funds` would require full scans.

**`merchant_canonical` at ingest:** Canonicalisation is deterministic (`normalise.ts`). Storing it makes merchant filters indexable and reproducible across runs.

## Ingest model

- Multiple datasets coexist: each row has `source_dataset` (`sample_a`, `sample_b`, …).
- Re-ingesting a dataset **replaces only that dataset** (delete + upsert); others are untouched.
- `npm run ingest:all` discovers any `data/sample_*` directory with the three JSON files.

## Formulas (Phase 3+)

```
Net spend:        SUM(amount) WHERE is_transfer = false (refunds are negative amounts)
Period return:    (nav_end - nav_start) / nav_start × 100
Realised return:  (units × current_nav - units × purchase_nav) / (units × purchase_nav) × 100
```

_Phase 3–8 sections (tools, failure modes, deploy) to be completed per roadmap._

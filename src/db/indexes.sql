-- Supplemental indexes (Drizzle schema defines core B-tree indexes)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_tx_canonical_trgm ON transactions USING GIN(merchant_canonical gin_trgm_ops);

-- Restore analysis_lots.scored_at (last score time). Idempotent-ish for MariaDB.
-- SSOT: DB/schema.sql · issue_lot_tables.sql

-- Run once on live DB (skip ADD if column already exists):
-- ALTER TABLE analysis_lots ADD COLUMN scored_at DATETIME NULL COMMENT '마지막 채점 시각' AFTER created_at;
-- ALTER TABLE analysis_lots ADD INDEX idx_analysis_scored (scored_at);

ALTER TABLE analysis_lots
  ADD COLUMN IF NOT EXISTS scored_at DATETIME NULL COMMENT '마지막 채점 시각' AFTER created_at;

-- Index: ignore error if already present on older MariaDB without IF NOT EXISTS for indexes
-- ALTER TABLE analysis_lots ADD INDEX idx_analysis_scored (scored_at);

UPDATE analysis_lots
SET scored_at = COALESCE(scored_at, created_at)
WHERE scored_at IS NULL AND (probability IS NOT NULL OR spc_status IS NOT NULL OR risk_reason IS NOT NULL);

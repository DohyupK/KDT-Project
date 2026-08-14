-- Migrate lots → analysis_lots (structure only; no row copy).
-- User truncates/reloads data separately after this runs.
-- Agent does not execute against remote DB.

CREATE TABLE IF NOT EXISTS analysis_lots (
  lot_id                   VARCHAR(64)  NOT NULL PRIMARY KEY,
  probability              DOUBLE       NULL,
  spc_status               VARCHAR(32)  NULL,
  risk_level               VARCHAR(10)  NOT NULL DEFAULT '안정',
  risk_reason              VARCHAR(255) NULL,
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scored_at                DATETIME     NULL COMMENT '마지막 채점 시각',
  CONSTRAINT fk_analysis_lots_lot
    FOREIGN KEY (lot_id) REFERENCES lots(lot_id)
    ON DELETE CASCADE,
  INDEX idx_analysis_risk (risk_level),
  INDEX idx_analysis_scored (scored_at)
);

-- Drop analysis / audit columns from lots when present (MariaDB 10.3+).
-- Re-run safely if a column is already gone (ignore errno 1091).

ALTER TABLE lots DROP COLUMN IF EXISTS defect_prob;
ALTER TABLE lots DROP COLUMN IF EXISTS spc_status;
ALTER TABLE lots DROP COLUMN IF EXISTS risk_level;
ALTER TABLE lots DROP COLUMN IF EXISTS risk_reason;
ALTER TABLE lots DROP COLUMN IF EXISTS scored_at;
ALTER TABLE lots DROP COLUMN IF EXISTS created_at;
ALTER TABLE lots DROP COLUMN IF EXISTS updated_at;
ALTER TABLE lots DROP COLUMN IF EXISTS residual_margin;
ALTER TABLE lots DROP COLUMN IF EXISTS clf_model_version;
ALTER TABLE lots DROP COLUMN IF EXISTS residual_model_version;
ALTER TABLE lots DROP COLUMN IF EXISTS spc_limit_version;

-- Optional after migrate (user):
-- TRUNCATE TABLE analysis_lots;
-- TRUNCATE TABLE issues;  -- if clearing ops too; respect FKs
-- DELETE FROM lots;

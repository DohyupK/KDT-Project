-- Migrate LOTS → ANALYSIS_LOTS (structure only; no row copy).
-- User truncates/reloads data separately after this runs.
-- Agent does not execute against remote DB.

CREATE TABLE IF NOT EXISTS ANALYSIS_LOTS (
  lot_id                   VARCHAR(64)  NOT NULL PRIMARY KEY,
  probability              DOUBLE       NULL,
  spc_status               VARCHAR(32)  NULL,
  risk_level               VARCHAR(10)  NOT NULL DEFAULT '안정',
  risk_reason              VARCHAR(255) NULL,
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scored_at                DATETIME     NULL COMMENT '마지막 채점 시각',
  CONSTRAINT fk_analysis_lots_lot
    FOREIGN KEY (lot_id) REFERENCES LOTS(lot_id)
    ON DELETE CASCADE,
  INDEX idx_analysis_risk (risk_level),
  INDEX idx_analysis_scored (scored_at)
);

-- Drop analysis / audit columns from LOTS when present (MariaDB 10.3+).
-- Re-run safely if a column is already gone (ignore errno 1091).

ALTER TABLE LOTS DROP COLUMN IF EXISTS defect_prob;
ALTER TABLE LOTS DROP COLUMN IF EXISTS spc_status;
ALTER TABLE LOTS DROP COLUMN IF EXISTS risk_level;
ALTER TABLE LOTS DROP COLUMN IF EXISTS risk_reason;
ALTER TABLE LOTS DROP COLUMN IF EXISTS scored_at;
ALTER TABLE LOTS DROP COLUMN IF EXISTS created_at;
ALTER TABLE LOTS DROP COLUMN IF EXISTS updated_at;
ALTER TABLE LOTS DROP COLUMN IF EXISTS residual_margin;
ALTER TABLE LOTS DROP COLUMN IF EXISTS clf_model_version;
ALTER TABLE LOTS DROP COLUMN IF EXISTS residual_model_version;
ALTER TABLE LOTS DROP COLUMN IF EXISTS spc_limit_version;

-- Optional after migrate (user):
-- TRUNCATE TABLE ANALYSIS_LOTS;
-- TRUNCATE TABLE ISSUES;  -- if clearing ops too; respect FKs
-- DELETE FROM LOTS;

-- Recommended-weight ensemble scratch (KEEP; do not drop without approval).
-- Filled by ai-service/scripts/score_recommended_to_temp3.py
-- Inference order: capacity → residual_li → probability → quality_defect

CREATE TABLE IF NOT EXISTS `temp3` (
  lot_id          VARCHAR(64)  NOT NULL PRIMARY KEY,
  quality_defect  TINYINT(1)   NOT NULL,
  capacity        DOUBLE       NULL,
  residual_li     DOUBLE       NULL,
  probability     DOUBLE       NULL,
  spc             VARCHAR(16)  NULL
);

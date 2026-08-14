-- Restructure ANALYSIS_LOTS (idempotent-ish for live DB).
-- Prefer: npm run migrate:analysis-LOTS-restructure
-- Preserves rows. If both defect_prob and probability exist, merge then drop defect_prob.

-- Optional mock clear (uncomment if needed):
-- TRUNCATE TABLE ANALYSIS_LOTS;

-- If only defect_prob:
-- ALTER TABLE ANALYSIS_LOTS CHANGE COLUMN defect_prob probability DOUBLE NULL;

-- If both present:
-- UPDATE ANALYSIS_LOTS SET probability = COALESCE(probability, defect_prob)
--   WHERE probability IS NULL AND defect_prob IS NOT NULL;
-- ALTER TABLE ANALYSIS_LOTS DROP COLUMN IF EXISTS defect_prob;

ALTER TABLE ANALYSIS_LOTS DROP COLUMN IF EXISTS defect_prob;
ALTER TABLE ANALYSIS_LOTS DROP COLUMN IF EXISTS clf_model_version;
ALTER TABLE ANALYSIS_LOTS DROP COLUMN IF EXISTS residual_model_version;
ALTER TABLE ANALYSIS_LOTS DROP COLUMN IF EXISTS spc_limit_version;
-- scored_at kept (last score time) — see alter_analysis_lots_add_scored_at.sql / schema.sql
ALTER TABLE ANALYSIS_LOTS DROP COLUMN IF EXISTS updated_at;
-- spc_chart_json is kept (dashboard SPC snapshot). Do not drop.
ALTER TABLE ANALYSIS_LOTS DROP INDEX IF EXISTS idx_analysis_scored;

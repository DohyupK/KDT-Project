-- Restructure analysis_lots (idempotent-ish for live DB).
-- Prefer: npm run migrate:analysis-lots-restructure
-- Preserves rows. If both defect_prob and probability exist, merge then drop defect_prob.

-- Optional mock clear (uncomment if needed):
-- TRUNCATE TABLE analysis_lots;

-- If only defect_prob:
-- ALTER TABLE analysis_lots CHANGE COLUMN defect_prob probability DOUBLE NULL;

-- If both present:
-- UPDATE analysis_lots SET probability = COALESCE(probability, defect_prob)
--   WHERE probability IS NULL AND defect_prob IS NOT NULL;
-- ALTER TABLE analysis_lots DROP COLUMN IF EXISTS defect_prob;

ALTER TABLE analysis_lots DROP COLUMN IF EXISTS defect_prob;
ALTER TABLE analysis_lots DROP COLUMN IF EXISTS clf_model_version;
ALTER TABLE analysis_lots DROP COLUMN IF EXISTS residual_model_version;
ALTER TABLE analysis_lots DROP COLUMN IF EXISTS spc_limit_version;
-- scored_at kept (last score time) — see alter_analysis_lots_add_scored_at.sql / schema.sql
ALTER TABLE analysis_lots DROP COLUMN IF EXISTS updated_at;
ALTER TABLE analysis_lots DROP COLUMN IF EXISTS spc_chart_json;

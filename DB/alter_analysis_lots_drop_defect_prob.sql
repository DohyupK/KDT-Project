-- Drop legacy analysis_lots.defect_prob (SSOT is probability).
-- Prefer: npm run migrate:analysis-drop-defect-prob
-- Merges any NULL probability from defect_prob first.

UPDATE analysis_lots
SET probability = COALESCE(probability, defect_prob)
WHERE probability IS NULL AND defect_prob IS NOT NULL;

ALTER TABLE analysis_lots DROP COLUMN IF EXISTS defect_prob;

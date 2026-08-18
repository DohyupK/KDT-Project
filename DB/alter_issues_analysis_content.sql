-- ISSUES.analysis_content: past-issue diagnosis (API_LLM on complete).
-- Drop AI_LIBRARY_ANALYSIS.lot_id (user-row analysis only).
-- Run on live MariaDB. Idempotent via migrate script.

ALTER TABLE ISSUES
  ADD COLUMN analysis_content TEXT NULL COMMENT 'API_LLM diagnosis after completed_at';

DELETE FROM AI_LIBRARY_ANALYSIS WHERE lot_id IS NOT NULL;

ALTER TABLE AI_LIBRARY_ANALYSIS
  DROP CONSTRAINT chk_ai_library_analysis_owner;

ALTER TABLE AI_LIBRARY_ANALYSIS
  DROP FOREIGN KEY fk_ai_library_analysis_lot;

ALTER TABLE AI_LIBRARY_ANALYSIS
  DROP INDEX uq_ai_library_analysis_lot;

ALTER TABLE AI_LIBRARY_ANALYSIS
  DROP COLUMN lot_id;

ALTER TABLE AI_LIBRARY_ANALYSIS
  MODIFY COLUMN user_id VARCHAR(50) NOT NULL,
  MODIFY COLUMN name VARCHAR(50) NOT NULL;

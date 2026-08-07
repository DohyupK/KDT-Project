-- Restructure handover_history (2026-08-07).
-- Target = DB/schema.sql: handover_content, created_at, archived_at (last);
-- no situation / event_date / snapshot_json.
-- Prefer: npm run migrate:handover-restructure (empty → DROP+CREATE).
-- Agent does not auto-run against remote DB.

-- Rename registration timestamp (if still on old name).
-- ALTER TABLE handover_history
--   CHANGE COLUMN archived_at created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록 시각';

-- Rename body column (if still on old name).
-- ALTER TABLE handover_history
--   CHANGE COLUMN situation handover_content VARCHAR(255) NOT NULL COMMENT '인수인계 내용(본문)';

-- Drop leftovers (safe when both old+new coexist).
ALTER TABLE handover_history DROP INDEX IF EXISTS idx_handover_date;
ALTER TABLE handover_history DROP COLUMN IF EXISTS situation;
ALTER TABLE handover_history DROP COLUMN IF EXISTS event_date;
ALTER TABLE handover_history DROP COLUMN IF EXISTS snapshot_json;

-- Completion timestamp after created_at (NULL until complete).
ALTER TABLE handover_history
  ADD COLUMN IF NOT EXISTS archived_at DATETIME NULL COMMENT '완료 시각 (완료 버튼 시 NOW)' AFTER created_at;

UPDATE handover_history
SET archived_at = created_at
WHERE action = '완료' AND archived_at IS NULL;

ALTER TABLE handover_history ADD INDEX IF NOT EXISTS idx_handover_created (created_at);

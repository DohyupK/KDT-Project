-- Decouple handover_history from issues (2026-08-08).
-- Prefer: npm run migrate:handover-decouple-issues

ALTER TABLE handover_history DROP FOREIGN KEY fk_handover_issue;
ALTER TABLE handover_history DROP INDEX IF EXISTS idx_handover_issue;
ALTER TABLE handover_history DROP COLUMN IF EXISTS issue_id;

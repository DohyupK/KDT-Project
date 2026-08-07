-- Drop handover_history.snapshot_json (shift times no longer persisted).
ALTER TABLE handover_history DROP COLUMN IF EXISTS snapshot_json;

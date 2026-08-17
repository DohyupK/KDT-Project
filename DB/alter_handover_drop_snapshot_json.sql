-- Drop HANDOVER_HISTORY.snapshot_json (shift times no longer persisted).
ALTER TABLE HANDOVER_HISTORY DROP COLUMN IF EXISTS snapshot_json;

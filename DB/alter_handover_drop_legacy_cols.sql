-- Drop legacy HANDOVER_HISTORY columns (2026-08-08).
-- lot_id, risk_level, cause, manager (+ fk_handover_lot / idx_handover_lot).
-- Prefer: npm run migrate:handover-drop-legacy-cols

ALTER TABLE HANDOVER_HISTORY DROP FOREIGN KEY fk_handover_lot;
ALTER TABLE HANDOVER_HISTORY DROP INDEX IF EXISTS idx_handover_lot;
ALTER TABLE HANDOVER_HISTORY DROP COLUMN IF EXISTS lot_id;
ALTER TABLE HANDOVER_HISTORY DROP COLUMN IF EXISTS risk_level;
ALTER TABLE HANDOVER_HISTORY DROP COLUMN IF EXISTS cause;
ALTER TABLE HANDOVER_HISTORY DROP COLUMN IF EXISTS manager;

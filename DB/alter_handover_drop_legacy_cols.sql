-- Drop legacy handover_history columns (2026-08-08).
-- lot_id, risk_level, cause, manager (+ fk_handover_lot / idx_handover_lot).
-- Prefer: npm run migrate:handover-drop-legacy-cols

ALTER TABLE handover_history DROP FOREIGN KEY fk_handover_lot;
ALTER TABLE handover_history DROP INDEX IF EXISTS idx_handover_lot;
ALTER TABLE handover_history DROP COLUMN IF EXISTS lot_id;
ALTER TABLE handover_history DROP COLUMN IF EXISTS risk_level;
ALTER TABLE handover_history DROP COLUMN IF EXISTS cause;
ALTER TABLE handover_history DROP COLUMN IF EXISTS manager;

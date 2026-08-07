-- Align live lots to CSV column names; keep row values.
-- Child FKs (analysis_lots / issues / handover_history).lot_id → lots(id).
-- ID string values unchanged (e.g. LOT-…, ISS-yyMMdd-###).

SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE analysis_lots DROP FOREIGN KEY fk_analysis_lots_lot;
ALTER TABLE issues DROP FOREIGN KEY fk_issues_lot;
ALTER TABLE handover_history DROP FOREIGN KEY fk_handover_lot;

ALTER TABLE lots DROP COLUMN IF EXISTS imported_at;
ALTER TABLE lots CHANGE COLUMN lot_id id VARCHAR(64) NOT NULL;
ALTER TABLE lots CHANGE COLUMN recorded_at `timestamp` DATETIME NOT NULL;
ALTER TABLE lots DROP COLUMN IF EXISTS residual_li;

ALTER TABLE analysis_lots
  ADD CONSTRAINT fk_analysis_lots_lot
  FOREIGN KEY (lot_id) REFERENCES lots(id)
  ON DELETE CASCADE;

ALTER TABLE issues
  ADD CONSTRAINT fk_issues_lot
  FOREIGN KEY (lot_id) REFERENCES lots(id);

ALTER TABLE handover_history
  ADD CONSTRAINT fk_handover_lot
  FOREIGN KEY (lot_id) REFERENCES lots(id);

SET FOREIGN_KEY_CHECKS = 1;

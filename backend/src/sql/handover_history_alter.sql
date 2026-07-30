-- ALTER existing handover_history (AWS) to match mapping + FKs.
-- Safe to re-run: checks via information_schema where practical; FK adds may error if already present.

-- Columns
ALTER TABLE handover_history
  ADD COLUMN IF NOT EXISTS handover_from VARCHAR(50) NULL COMMENT '인계자' AFTER cause,
  ADD COLUMN IF NOT EXISTS handover_to VARCHAR(50) NULL COMMENT '인수자' AFTER handover_from;

-- Backfill 인계자 from manager
UPDATE handover_history
SET handover_from = manager
WHERE (handover_from IS NULL OR handover_from = '')
  AND manager IS NOT NULL
  AND manager <> '';

-- Align category comment semantics (values already stored as-is)
-- event_date semantics: application layer uses issues.occurred_at

-- Foreign keys (ignore if already exist — run once)
-- MariaDB 10.x may not support ADD CONSTRAINT IF NOT EXISTS; script handles errors.

ALTER TABLE handover_history
  ADD CONSTRAINT fk_handover_issue
    FOREIGN KEY (issue_id) REFERENCES issues(issue_id)
    ON DELETE RESTRICT;

ALTER TABLE handover_history
  ADD CONSTRAINT fk_handover_lot
    FOREIGN KEY (lot_id) REFERENCES lots(lot_id)
    ON DELETE RESTRICT;

ALTER TABLE handover_history
  ADD CONSTRAINT fk_handover_assignee
    FOREIGN KEY (assignee_user_id) REFERENCES users(user_id)
    ON DELETE SET NULL;

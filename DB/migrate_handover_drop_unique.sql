-- Allow multiple HANDOVER_HISTORY rows per issue_id.
-- FK currently rides on uk_handover_issue — drop/recreate FK around the UNIQUE drop.
-- Run manually against MariaDB (kdt_project) if script is not used.

ALTER TABLE HANDOVER_HISTORY DROP FOREIGN KEY fk_handover_issue;

ALTER TABLE HANDOVER_HISTORY DROP INDEX uk_handover_issue;

ALTER TABLE HANDOVER_HISTORY ADD INDEX idx_handover_issue (issue_id);

ALTER TABLE HANDOVER_HISTORY
  ADD CONSTRAINT fk_handover_issue
  FOREIGN KEY (issue_id) REFERENCES ISSUES(issue_id)
  ON DELETE RESTRICT;

-- Optional (ignore if exists)
-- ALTER TABLE HANDOVER_HISTORY ADD INDEX idx_handover_action (action(32));

-- Legacy rows archived with category='완료'
UPDATE HANDOVER_HISTORY
SET action = '완료'
WHERE category = '완료'
  AND (action IS NULL OR action <> '완료');

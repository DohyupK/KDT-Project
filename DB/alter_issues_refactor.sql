-- ISSUES refactor: empty table, drop status/risk_level, rename columns.
-- Prefer: npm run migrate:ISSUES-refactor (idempotent TS).

DELETE FROM ISSUES;

ALTER TABLE ISSUES DROP INDEX IF EXISTS idx_issues_status;
ALTER TABLE ISSUES DROP INDEX IF EXISTS idx_issues_risk;
ALTER TABLE ISSUES DROP INDEX IF EXISTS idx_issues_occurred;

ALTER TABLE ISSUES DROP COLUMN IF EXISTS status;
ALTER TABLE ISSUES DROP COLUMN IF EXISTS risk_level;

-- MariaDB: CHANGE if old names still present (run once)
-- ALTER TABLE ISSUES CHANGE COLUMN title issue_content VARCHAR(255) NOT NULL;
-- ALTER TABLE ISSUES CHANGE COLUMN occurred_at created_at DATETIME NOT NULL;
-- ALTER TABLE ISSUES MODIFY COLUMN created_at DATETIME NOT NULL AFTER completed_at;
-- ALTER TABLE ISSUES ADD INDEX IF NOT EXISTS idx_issues_created (created_at);

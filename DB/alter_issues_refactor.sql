-- issues refactor: empty table, drop status/risk_level, rename columns.
-- Prefer: npm run migrate:issues-refactor (idempotent TS).

DELETE FROM issues;

ALTER TABLE issues DROP INDEX IF EXISTS idx_issues_status;
ALTER TABLE issues DROP INDEX IF EXISTS idx_issues_risk;
ALTER TABLE issues DROP INDEX IF EXISTS idx_issues_occurred;

ALTER TABLE issues DROP COLUMN IF EXISTS status;
ALTER TABLE issues DROP COLUMN IF EXISTS risk_level;

-- MariaDB: CHANGE if old names still present (run once)
-- ALTER TABLE issues CHANGE COLUMN title issue_content VARCHAR(255) NOT NULL;
-- ALTER TABLE issues CHANGE COLUMN occurred_at created_at DATETIME NOT NULL;
-- ALTER TABLE issues MODIFY COLUMN created_at DATETIME NOT NULL AFTER completed_at;
-- ALTER TABLE issues ADD INDEX IF NOT EXISTS idx_issues_created (created_at);

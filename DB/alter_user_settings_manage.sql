-- Per-user in-house admin flag. Set O/X in MariaDB (not Setting UI).
-- Run on live DB once. Default X.

ALTER TABLE USER_SETTINGS
  ADD COLUMN IF NOT EXISTS manage CHAR(1) NOT NULL DEFAULT 'X'
    COMMENT 'O=in-house admin, X=regular';

-- Scratch table mirroring JUDGMENT_LOTS columns (no FK).
-- Used for voting reconnect verification / batch score dry-run.
-- Does NOT modify JUDGMENT_LOTS.

CREATE TABLE IF NOT EXISTS `temp` (
  lot_id          VARCHAR(64)  NOT NULL PRIMARY KEY,
  quality_defect  TINYINT(1)   NOT NULL,
  capacity        DOUBLE       NULL,
  residual_li     DOUBLE       NULL,
  probability     DOUBLE       NULL,
  spc             VARCHAR(16)  NULL
);

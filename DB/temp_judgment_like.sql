-- Scratch table mirroring judgment_lots columns (no FK).
-- Used for voting reconnect verification / batch score dry-run.
-- Does NOT modify judgment_lots.

CREATE TABLE IF NOT EXISTS `temp` (
  lot_id          VARCHAR(64)  NOT NULL PRIMARY KEY,
  quality_defect  TINYINT(1)   NOT NULL,
  capacity        DOUBLE       NULL,
  residual_li     DOUBLE       NULL,
  probability     DOUBLE       NULL,
  spc             VARCHAR(16)  NULL
);

-- Judgment outcomes: lot_id + quality_defect + capacity + residual_li + probability.
-- Sync with DB/schema.sql. FK → LOTS(id).
-- probability: 0~1 clf defect prob (API defectProb; UI %).

CREATE TABLE IF NOT EXISTS JUDGMENT_LOTS (
  lot_id          VARCHAR(64)  NOT NULL PRIMARY KEY,
  quality_defect  TINYINT(1)   NOT NULL,
  capacity        DOUBLE       NULL,
  residual_li     DOUBLE       NULL,
  probability     DOUBLE       NULL,
  spc             VARCHAR(16)  NULL,
  CONSTRAINT fk_judgment_lots_lot
    FOREIGN KEY (lot_id) REFERENCES LOTS(id)
    ON DELETE CASCADE
);

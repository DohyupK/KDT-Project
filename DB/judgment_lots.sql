-- Judgment outcomes: lot_id + quality_defect + capacity + residual_li.
-- Sync with DB/schema.sql. FK → lots(id).

CREATE TABLE IF NOT EXISTS judgment_lots (
  lot_id          VARCHAR(64)  NOT NULL PRIMARY KEY,
  quality_defect  TINYINT(1)   NOT NULL,
  capacity        DOUBLE       NULL,
  residual_li     DOUBLE       NULL,
  CONSTRAINT fk_judgment_lots_lot
    FOREIGN KEY (lot_id) REFERENCES lots(id)
    ON DELETE CASCADE
);

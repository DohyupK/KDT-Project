-- Primary lab/feeder results buffer (keep — not an orphan).
-- Plant feeder writes delayed quality_defect / residual_li; AI NULL-fills predictions.
-- App cascade then references these for analysis_lots / judgment_lots.

CREATE TABLE IF NOT EXISTS lot_results (
  seq             INT          NOT NULL PRIMARY KEY,
  lot_id          VARCHAR(64)  NOT NULL,
  quality_defect  TINYINT      NULL,
  residual_li     DOUBLE       NULL,
  measured_at     DATETIME     NULL,
  UNIQUE KEY uq_lot_results_lot_id (lot_id)
);

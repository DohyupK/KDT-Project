-- Primary lab/feeder results buffer (keep — not an orphan).
-- Plant feeder writes delayed quality_defect / residual_li; AI NULL-fills predictions.
-- App cascade then references these for ANALYSIS_LOTS / JUDGMENT_LOTS.

CREATE TABLE IF NOT EXISTS LOT_RESULTS (
  seq             INT          NOT NULL PRIMARY KEY,
  lot_id          VARCHAR(64)  NOT NULL,
  quality_defect  TINYINT      NULL,
  residual_li     DOUBLE       NULL,
  measured_at     DATETIME     NULL,
  UNIQUE KEY uq_lot_results_lot_id (lot_id)
);

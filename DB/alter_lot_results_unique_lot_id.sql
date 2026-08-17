-- Ensure one LOT_RESULTS row per lot_id (feeder stub + AI NULL-fill).
-- Run after deduping duplicate lot_id rows if any.

-- Optional dedupe keep min(seq):
-- DELETE lr FROM LOT_RESULTS lr
-- INNER JOIN (
--   SELECT lot_id, MIN(seq) AS keep_seq FROM LOT_RESULTS GROUP BY lot_id HAVING COUNT(*) > 1
-- ) d ON lr.lot_id = d.lot_id AND lr.seq <> d.keep_seq;

ALTER TABLE LOT_RESULTS
  ADD UNIQUE INDEX IF NOT EXISTS uq_lot_results_lot_id (lot_id);

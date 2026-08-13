-- Ensure one lot_results row per lot_id (feeder stub + AI NULL-fill).
-- Run after deduping duplicate lot_id rows if any.

-- Optional dedupe keep min(seq):
-- DELETE lr FROM lot_results lr
-- INNER JOIN (
--   SELECT lot_id, MIN(seq) AS keep_seq FROM lot_results GROUP BY lot_id HAVING COUNT(*) > 1
-- ) d ON lr.lot_id = d.lot_id AND lr.seq <> d.keep_seq;

ALTER TABLE lot_results
  ADD UNIQUE INDEX IF NOT EXISTS uq_lot_results_lot_id (lot_id);

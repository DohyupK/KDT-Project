-- Drop unused SPC / control orphan objects (2026-08-05+).
-- KEEP: SPC_LOT, SPC_LOT_results (plant_feeder).
-- KEEP: lot_results (feeder + AI NULL-fill buffer → analysis_lots).
-- KEEP (files, not MariaDB): control_bounds.json, spcPhase1Limits.json.

DROP VIEW IF EXISTS v_spc_charts;
DROP TABLE IF EXISTS lot_spc_results;
DROP TABLE IF EXISTS spc_limits;
DROP TABLE IF EXISTS control_bounds;

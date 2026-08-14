-- Drop unused SPC / control orphan objects (2026-08-05+).
-- KEEP: SPC_LOT, SPC_LOT_results (plant_feeder).
-- KEEP: LOT_RESULTS (feeder + AI NULL-fill buffer → ANALYSIS_LOTS).
-- KEEP (files, not MariaDB): control_bounds.json, spcPhase1Limits.json.

DROP VIEW IF EXISTS v_spc_charts;
DROP TABLE IF EXISTS lot_spc_results;
-- SPC_LIMITS is live (DB/spc_limits_and_standard.sql) — do not drop.
DROP TABLE IF EXISTS control_bounds;

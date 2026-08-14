-- Drop legacy cathode source tables (removed from app SSOT 2026-08-05).
-- Score/import now use operational `lots` + CSV files only.
-- Run manually against MariaDB when ready (agent does not execute remote DROP).

DROP TABLE IF EXISTS cathode_clf_data;
DROP TABLE IF EXISTS cathode_capacity_data;
DROP TABLE IF EXISTS cathode_residual_data;

-- Old names (pre rename samples → data)
DROP TABLE IF EXISTS cathode_clf_samples;
DROP TABLE IF EXISTS cathode_capacity_samples;
DROP TABLE IF EXISTS cathode_residual_samples;

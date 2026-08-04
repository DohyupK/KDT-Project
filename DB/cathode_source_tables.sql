-- Raw cathode CSV source tables.
-- Each dataset keeps its own missing-value pattern; process values are nullable.
-- These tables intentionally have no FK to operational `lots`.

CREATE TABLE IF NOT EXISTS cathode_clf_samples (
  lot_id            VARCHAR(64) NOT NULL PRIMARY KEY,
  recorded_at       DATETIME    NOT NULL,
  d50               DOUBLE      NULL,
  d90               DOUBLE      NULL,
  metal_impurity    DOUBLE      NULL,
  lithium_input     DOUBLE      NULL,
  additive_ratio    DOUBLE      NULL,
  process_time      DOUBLE      NULL,
  sintering_temp    DOUBLE      NULL,
  humidity          DOUBLE      NULL,
  tank_pressure     DOUBLE      NULL,
  operator_id       VARCHAR(32) NULL,
  quality_defect    TINYINT(1)  NOT NULL,
  imported_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cathode_clf_recorded (recorded_at),
  INDEX idx_cathode_clf_operator (operator_id),
  INDEX idx_cathode_clf_target (quality_defect)
);

CREATE TABLE IF NOT EXISTS cathode_capacity_samples (
  lot_id            VARCHAR(64) NOT NULL PRIMARY KEY,
  recorded_at       DATETIME    NOT NULL,
  d50               DOUBLE      NULL,
  d90               DOUBLE      NULL,
  metal_impurity    DOUBLE      NULL,
  lithium_input     DOUBLE      NULL,
  additive_ratio    DOUBLE      NULL,
  process_time      DOUBLE      NULL,
  sintering_temp    DOUBLE      NULL,
  humidity          DOUBLE      NULL,
  tank_pressure     DOUBLE      NULL,
  operator_id       VARCHAR(32) NULL,
  capacity          DOUBLE      NOT NULL,
  imported_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cathode_capacity_recorded (recorded_at),
  INDEX idx_cathode_capacity_operator (operator_id),
  INDEX idx_cathode_capacity_target (capacity)
);

CREATE TABLE IF NOT EXISTS cathode_residual_samples (
  lot_id            VARCHAR(64) NOT NULL PRIMARY KEY,
  recorded_at       DATETIME    NOT NULL,
  d50               DOUBLE      NULL,
  d90               DOUBLE      NULL,
  metal_impurity    DOUBLE      NULL,
  lithium_input     DOUBLE      NULL,
  additive_ratio    DOUBLE      NULL,
  process_time      DOUBLE      NULL,
  sintering_temp    DOUBLE      NULL,
  humidity          DOUBLE      NULL,
  tank_pressure     DOUBLE      NULL,
  operator_id       VARCHAR(32) NULL,
  residual_li       DOUBLE      NOT NULL,
  imported_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cathode_residual_recorded (recorded_at),
  INDEX idx_cathode_residual_operator (operator_id),
  INDEX idx_cathode_residual_target (residual_li)
);

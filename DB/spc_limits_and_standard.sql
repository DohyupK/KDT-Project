-- SPC limits (I-MR Phase I) + scalar risk thresholds (1-row standard)
-- Seed values match backend/config/spcPhase1Limits.json

CREATE TABLE IF NOT EXISTS spc_limits (
  param_key   VARCHAR(64)  NOT NULL PRIMARY KEY,
  label       VARCHAR(64)  NOT NULL,
  LCL_I       DOUBLE       NOT NULL,
  CL_I        DOUBLE       NOT NULL,
  UCL_I       DOUBLE       NOT NULL,
  CL_MR       DOUBLE       NOT NULL,
  UCL_MR      DOUBLE       NOT NULL
);

INSERT INTO spc_limits (param_key, label, LCL_I, CL_I, UCL_I, CL_MR, UCL_MR) VALUES
  ('d50', '입도(d50)', 2.688793, 4.493629, 6.298466, 0.678619, 2.217047),
  ('d90', '입도(d90)', 5.858492, 8.972006, 12.085519, 1.170681, 3.824615),
  ('metal_impurity', '금속이물', 0.002334, 0.023958, 0.045581, 0.008131, 0.026562),
  ('lithium_input', '리튬투입량', 1.047484, 2.514812, 3.982139, 0.551715, 1.802453),
  ('additive_ratio', '첨가제비율', 0.11734, 0.147568, 0.177796, 0.011366, 0.037132),
  ('process_time', '공정시간', 45.180799, 72.141397, 99.101995, 10.137185, 33.118183),
  ('sintering_temp', '소성온도', 724.051857, 800.37591, 876.699963, 28.697844, 93.755856),
  ('humidity', '습도', 26.581948, 50.23067, 73.879392, 8.89192, 29.049901),
  ('tank_pressure', '탱크압력', 90.81041, 100.049107, 109.287803, 3.47375, 11.348741)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  LCL_I = VALUES(LCL_I),
  CL_I = VALUES(CL_I),
  UCL_I = VALUES(UCL_I),
  CL_MR = VALUES(CL_MR),
  UCL_MR = VALUES(UCL_MR);

-- Single-row scalar thresholds for risk grade + residual USL (spare)
CREATE TABLE IF NOT EXISTS standard (
  id                    TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  defect_prob_caution   DOUBLE NOT NULL DEFAULT 0.20,
  defect_prob_severe    DOUBLE NOT NULL DEFAULT 0.40,
  residual_caution      DOUBLE NOT NULL DEFAULT 3000,
  residual_severe       DOUBLE NOT NULL DEFAULT 3500,
  spare                 DOUBLE NOT NULL DEFAULT 4000
);

INSERT INTO standard (id, defect_prob_caution, defect_prob_severe, residual_caution, residual_severe, spare)
VALUES (1, 0.20, 0.40, 3000, 3500, 4000)
ON DUPLICATE KEY UPDATE
  defect_prob_caution = VALUES(defect_prob_caution),
  defect_prob_severe = VALUES(defect_prob_severe),
  residual_caution = VALUES(residual_caution),
  residual_severe = VALUES(residual_severe),
  spare = VALUES(spare);

-- Mirror SPC lot label onto judgment_lots (이탈|주의|안정|-)
ALTER TABLE judgment_lots
  ADD COLUMN IF NOT EXISTS spc VARCHAR(16) NULL;

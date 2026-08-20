-- Slim process LOT + ANALYSIS_LOTS (scores). Sync with DB/schema.sql.
-- LOTS PK = id (CSV); child tables keep column name lot_id → REFERENCES LOTS(id).
-- Issue IDs: ISS-yyMMdd-001 daily sequence.

CREATE TABLE IF NOT EXISTS LOTS (
  id                VARCHAR(64)  NOT NULL PRIMARY KEY,
  `timestamp`       DATETIME     NOT NULL,
  d50               DOUBLE       NULL,
  d90               DOUBLE       NULL,
  metal_impurity    DOUBLE       NULL,
  lithium_input     DOUBLE       NULL,
  additive_ratio    DOUBLE       NULL,
  process_time      DOUBLE       NULL,
  sintering_temp    DOUBLE       NULL,
  humidity          DOUBLE       NULL,
  tank_pressure     DOUBLE       NULL,
  operator_id       VARCHAR(32)  NULL,
  INDEX idx_lots_recorded (`timestamp`)
);

CREATE TABLE IF NOT EXISTS ANALYSIS_LOTS (
  lot_id                   VARCHAR(64)  NOT NULL PRIMARY KEY,
  probability              DOUBLE       NULL COMMENT '불량확률(잠정/채점) 0~1',
  spc_status               VARCHAR(32)  NULL COMMENT '이탈|주의|안정|이탈, 주의',
  risk_level               VARCHAR(10)  NOT NULL DEFAULT '안정'
    COMMENT '심각|주의|안정',
  risk_reason              VARCHAR(255) NULL,
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scored_at                DATETIME     NULL COMMENT '마지막 채점 시각',
  CONSTRAINT fk_analysis_lots_lot
    FOREIGN KEY (lot_id) REFERENCES LOTS(id)
    ON DELETE CASCADE,
  INDEX idx_analysis_risk (risk_level),
  INDEX idx_analysis_scored (scored_at)
);

CREATE TABLE IF NOT EXISTS JUDGMENT_LOTS (
  lot_id          VARCHAR(64)  NOT NULL PRIMARY KEY,
  quality_defect  TINYINT(1)   NOT NULL,
  capacity        DOUBLE       NULL COMMENT 'mAh/g',
  residual_li     DOUBLE       NULL COMMENT '잔류리튬(ppm) · API residualLithium',
  probability     DOUBLE       NULL COMMENT '불량확률 0~1 · API defectProb',
  CONSTRAINT fk_judgment_lots_lot
    FOREIGN KEY (lot_id) REFERENCES LOTS(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ISSUES (
  issue_id          VARCHAR(32)  NOT NULL PRIMARY KEY COMMENT 'ISS-yyMMdd-001',
  lot_id            VARCHAR(64)  NOT NULL,
  issue_content     VARCHAR(255) NOT NULL COMMENT '이슈 내용 (risk_reason 2차 요약·후속 LLM)',
  action_content    TEXT         NULL COMMENT '조치 내용(목록 미노출)',
  assignee_user_id  VARCHAR(50)  NULL,
  completed_at      DATETIME     NULL COMMENT '처리날짜 (완료 시)',
  created_at        DATETIME     NOT NULL COMMENT '등록 시각',
  CONSTRAINT fk_issues_lot FOREIGN KEY (lot_id) REFERENCES LOTS(id),
  CONSTRAINT fk_issues_assignee FOREIGN KEY (assignee_user_id) REFERENCES USERS(user_id)
    ON DELETE SET NULL,
  INDEX idx_issues_lot (lot_id),
  INDEX idx_issues_created (created_at)
);

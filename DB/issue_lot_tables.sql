-- Slim process LOT + analysis_lots (scores). Sync with DB/schema.sql.
-- lots PK = id (CSV); child tables keep column name lot_id → REFERENCES lots(id).
-- Issue IDs: ISS-yyMMdd-001 daily sequence.

CREATE TABLE IF NOT EXISTS lots (
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

CREATE TABLE IF NOT EXISTS analysis_lots (
  lot_id                   VARCHAR(64)  NOT NULL PRIMARY KEY,
  probability              DOUBLE       NULL COMMENT '불량확률(잠정/채점) 0~1',
  spc_status               VARCHAR(32)  NULL COMMENT '이탈|주의|안정|이탈, 주의',
  risk_level               VARCHAR(10)  NOT NULL DEFAULT '안정'
    COMMENT '심각|주의|안정',
  risk_reason              VARCHAR(255) NULL,
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_analysis_lots_lot
    FOREIGN KEY (lot_id) REFERENCES lots(id)
    ON DELETE CASCADE,
  INDEX idx_analysis_risk (risk_level)
);

CREATE TABLE IF NOT EXISTS judgment_lots (
  lot_id          VARCHAR(64)  NOT NULL PRIMARY KEY,
  quality_defect  TINYINT(1)   NOT NULL,
  capacity        DOUBLE       NULL COMMENT 'mAh/g',
  residual_li     DOUBLE       NULL COMMENT '잔류리튬(ppm) · API residualLithium',
  probability     DOUBLE       NULL COMMENT '불량확률 0~1 · API defectProb',
  CONSTRAINT fk_judgment_lots_lot
    FOREIGN KEY (lot_id) REFERENCES lots(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS issues (
  issue_id          VARCHAR(32)  NOT NULL PRIMARY KEY COMMENT 'ISS-yyMMdd-001',
  lot_id            VARCHAR(64)  NOT NULL,
  occurred_at       DATETIME     NOT NULL,
  risk_level        VARCHAR(10)  NOT NULL COMMENT '심각|주의|안정',
  status            VARCHAR(20)  NOT NULL DEFAULT '접수'
    COMMENT '접수|분석 중|조치 중|완료',
  title             VARCHAR(255) NOT NULL COMMENT '이슈 내용',
  action_content    TEXT         NULL COMMENT '조치 내용(목록 미노출)',
  assignee_user_id  VARCHAR(50)  NULL,
  completed_at      DATETIME     NULL COMMENT '처리날짜 (완료 시)',
  CONSTRAINT fk_issues_lot FOREIGN KEY (lot_id) REFERENCES lots(id),
  CONSTRAINT fk_issues_assignee FOREIGN KEY (assignee_user_id) REFERENCES users(user_id)
    ON DELETE SET NULL,
  INDEX idx_issues_status (status),
  INDEX idx_issues_lot (lot_id),
  INDEX idx_issues_occurred (occurred_at),
  INDEX idx_issues_risk (risk_level)
);

CREATE TABLE IF NOT EXISTS handover_history (
  history_id        BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  handover_content  VARCHAR(255) NOT NULL COMMENT '인수인계 내용(본문)',
  action            TEXT         NULL COMMENT '완료 플래그: NULL=pending, ''완료''=Knowledge 표시',
  handover_from     VARCHAR(50)  NULL COMMENT '인계자 ← users.name',
  handover_to       VARCHAR(50)  NULL COMMENT '인수자(선택)',
  assignee_user_id  VARCHAR(50)  NULL,
  category          VARCHAR(32)  NULL COMMENT '특이사항/전달사항/주의사항',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록 시각',
  archived_at       DATETIME     NULL COMMENT '완료 시각 (완료 버튼 시 NOW)',
  CONSTRAINT fk_handover_assignee
    FOREIGN KEY (assignee_user_id) REFERENCES users(user_id)
    ON DELETE SET NULL,
  INDEX idx_handover_created (created_at),
  INDEX idx_handover_action (action(32))
);

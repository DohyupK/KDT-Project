-- Issue / LOT / handover (shared ops data). Requires users table.
-- Risk Top = query on lots (no separate top table).
-- issue_analyses removed. handover_history kept for later.

CREATE TABLE IF NOT EXISTS lots (
  lot_id            VARCHAR(64)  NOT NULL PRIMARY KEY,
  recorded_at       DATETIME     NOT NULL,
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
  quality_defect    TINYINT(1)   NOT NULL DEFAULT 0,
  defect_prob       DOUBLE       NULL COMMENT '불량확률(잠정/채점)',
  residual_lithium  DOUBLE       NULL COMMENT '잔여리튬(잠정/채점)',
  spc_status        VARCHAR(32)  NULL COMMENT 'SPC 상태(잠정/채점)',
  risk_level        VARCHAR(10)  NOT NULL DEFAULT '낮음'
    COMMENT '높음|중간|낮음',
  risk_reason       VARCHAR(255) NULL,
  scored_at         DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lots_recorded (recorded_at),
  INDEX idx_lots_risk (risk_level)
);

CREATE TABLE IF NOT EXISTS issues (
  issue_id          VARCHAR(32)  NOT NULL PRIMARY KEY COMMENT 'ISS-yyMMdd-seq',
  lot_id            VARCHAR(64)  NOT NULL,
  occurred_at       DATETIME     NOT NULL,
  risk_level        VARCHAR(10)  NOT NULL COMMENT '높음|중간|낮음',
  status            VARCHAR(20)  NOT NULL DEFAULT '접수'
    COMMENT '접수|분석 중|조치 중|완료',
  title             VARCHAR(255) NOT NULL COMMENT '이슈 내용',
  action_content    TEXT         NULL COMMENT '조치 내용(목록 미노출)',
  assignee_user_id  VARCHAR(50)  NULL,
  completed_at      DATETIME     NULL COMMENT '처리날짜 (완료 시)',
  CONSTRAINT fk_issues_lot FOREIGN KEY (lot_id) REFERENCES lots(lot_id),
  CONSTRAINT fk_issues_assignee FOREIGN KEY (assignee_user_id) REFERENCES users(user_id)
    ON DELETE SET NULL,
  INDEX idx_issues_status (status),
  INDEX idx_issues_lot (lot_id),
  INDEX idx_issues_occurred (occurred_at),
  INDEX idx_issues_risk (risk_level)
);

CREATE TABLE IF NOT EXISTS handover_history (
  history_id        BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  issue_id          VARCHAR(32)  NOT NULL,
  lot_id            VARCHAR(64)  NOT NULL,
  risk_level        VARCHAR(10)  NOT NULL,
  situation         VARCHAR(255) NOT NULL COMMENT '인수인계 내용(본문)',
  action            TEXT         NULL COMMENT '완료 플래그: NULL=pending, ''완료''=Knowledge 표시',
  cause             VARCHAR(255) NULL,
  handover_from     VARCHAR(50)  NULL COMMENT '인계자 ← users.name',
  handover_to       VARCHAR(50)  NULL COMMENT '인수자(선택)',
  manager           VARCHAR(50)  NULL COMMENT '호환: handover_from과 동일',
  assignee_user_id  VARCHAR(50)  NULL,
  event_date        DATE         NOT NULL COMMENT '날짜 ← issues.occurred_at 일자',
  category          VARCHAR(32)  NULL COMMENT '특이사항/전달사항/주의사항',
  snapshot_json     JSON         NULL,
  archived_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_handover_issue
    FOREIGN KEY (issue_id) REFERENCES issues(issue_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_handover_lot
    FOREIGN KEY (lot_id) REFERENCES lots(lot_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_handover_assignee
    FOREIGN KEY (assignee_user_id) REFERENCES users(user_id)
    ON DELETE SET NULL,
  INDEX idx_handover_issue (issue_id),
  INDEX idx_handover_lot (lot_id),
  INDEX idx_handover_date (event_date),
  INDEX idx_handover_action (action(32))
);

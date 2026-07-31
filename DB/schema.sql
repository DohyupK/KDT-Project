CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(50) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  name       VARCHAR(50) NOT NULL,
  phone      VARCHAR(20) NOT NULL,
  email      VARCHAR(100) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Per-user Setting page UI prefs (font/theme/refresh). Control bounds stay in JSON file.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id               VARCHAR(50)  NOT NULL PRIMARY KEY,
  font_size             INT          NOT NULL DEFAULT 18,
  theme_mode            TINYINT      NOT NULL DEFAULT 1 COMMENT '0=dark, 1=light',
  refresh_interval      INT          NOT NULL DEFAULT 1 COMMENT 'minutes: 1/5/10/30',
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_settings_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE
);

-- LOT SSOT + scoring (Risk Top = query, no separate top table)
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
  defect_prob       DOUBLE       NULL,
  residual_lithium  DOUBLE       NULL,
  spc_status        VARCHAR(32)  NULL,
  risk_level        VARCHAR(10)  NOT NULL DEFAULT '낮음',
  risk_reason       VARCHAR(255) NULL,
  scored_at         DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lots_recorded (recorded_at),
  INDEX idx_lots_risk (risk_level)
);

CREATE TABLE IF NOT EXISTS issues (
  issue_id          VARCHAR(32)  NOT NULL PRIMARY KEY,
  lot_id            VARCHAR(64)  NOT NULL,
  occurred_at       DATETIME     NOT NULL,
  risk_level        VARCHAR(10)  NOT NULL,
  status            VARCHAR(20)  NOT NULL DEFAULT '접수',
  title             VARCHAR(255) NOT NULL,
  action_content    TEXT         NULL,
  assignee_user_id  VARCHAR(50)  NULL,
  completed_at      DATETIME     NULL,
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
  situation         VARCHAR(255) NOT NULL COMMENT '발생 상황 ← issues.title',
  action            TEXT         NULL COMMENT '대응/조치 ← action_content',
  cause             VARCHAR(255) NULL,
  handover_from     VARCHAR(50)  NULL COMMENT '인계자 ← 담당자 성명',
  handover_to       VARCHAR(50)  NULL COMMENT '인수자(선택)',
  manager           VARCHAR(50)  NULL COMMENT '호환: handover_from과 동일',
  assignee_user_id  VARCHAR(50)  NULL,
  event_date        DATE         NOT NULL COMMENT '날짜 ← issues.occurred_at 일자',
  category          VARCHAR(32)  NULL COMMENT '분류 ← 처리상태 status',
  snapshot_json     JSON         NULL,
  archived_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_handover_issue (issue_id),
  CONSTRAINT fk_handover_issue
    FOREIGN KEY (issue_id) REFERENCES issues(issue_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_handover_lot
    FOREIGN KEY (lot_id) REFERENCES lots(lot_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_handover_assignee
    FOREIGN KEY (assignee_user_id) REFERENCES users(user_id)
    ON DELETE SET NULL,
  INDEX idx_handover_lot (lot_id),
  INDEX idx_handover_date (event_date)
);

-- Inquiry board (attachments deferred)
CREATE TABLE IF NOT EXISTS inquiries (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  inquiry_code         VARCHAR(32)  NOT NULL,
  category             VARCHAR(64)  NOT NULL,
  visibility           VARCHAR(10)  NOT NULL DEFAULT '공개',
  status               VARCHAR(20)  NOT NULL DEFAULT '접수',
  title                VARCHAR(255) NOT NULL,
  content              TEXT         NOT NULL,
  author_user_id       VARCHAR(50)  NULL,
  author_name          VARCHAR(50)  NOT NULL,
  author_email         VARCHAR(100) NOT NULL,
  answer               TEXT         NULL,
  answered_at          DATETIME     NULL,
  answered_by_user_id  VARCHAR(50)  NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_inquiries_code (inquiry_code),
  CONSTRAINT fk_inquiries_author
    FOREIGN KEY (author_user_id) REFERENCES users(user_id)
    ON DELETE SET NULL,
  CONSTRAINT fk_inquiries_answerer
    FOREIGN KEY (answered_by_user_id) REFERENCES users(user_id)
    ON DELETE SET NULL,
  INDEX idx_inquiries_category (category),
  INDEX idx_inquiries_status (status),
  INDEX idx_inquiries_created (created_at),
  INDEX idx_inquiries_visibility (visibility)
);

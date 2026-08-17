CREATE TABLE IF NOT EXISTS USERS (
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
CREATE TABLE IF NOT EXISTS USER_SETTINGS (
  user_id               VARCHAR(50)  NOT NULL PRIMARY KEY,
  font_size             INT          NOT NULL DEFAULT 18,
  theme_mode            TINYINT      NOT NULL DEFAULT 1 COMMENT '0=dark, 1=light',
  refresh_interval      INT          NOT NULL DEFAULT 1 COMMENT 'minutes: 1/5/10/30',
  email_check           CHAR(1)      NOT NULL DEFAULT 'X' COMMENT 'O=심각 LOT 보고서 메일 수신, X=거부',
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_settings_user
    FOREIGN KEY (user_id) REFERENCES USERS(user_id)
    ON DELETE CASCADE
);

-- Header bell read/dismiss overlay per user (list still aggregated on frontend).
-- See also DB/user_header_notif_state.sql
CREATE TABLE IF NOT EXISTS USER_HEADER_NOTIF_STATE (
  user_id         VARCHAR(50)  NOT NULL PRIMARY KEY,
  read_ids        JSON         NOT NULL,
  dismissed_ids   JSON         NOT NULL,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_header_notif_state_user
    FOREIGN KEY (user_id) REFERENCES USERS(user_id)
    ON DELETE CASCADE
);

-- LOT process SSOT (CSV column names). Scores live in ANALYSIS_LOTS.
-- PK `id` is referenced by child tables as lot_id (FK name may differ).
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
  probability              DOUBLE       NULL,
  spc_status               VARCHAR(32)  NULL,
  risk_level               VARCHAR(10)  NOT NULL DEFAULT '안정',
  risk_reason              VARCHAR(255) NULL,
  spc_chart_json           JSON         NULL,
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scored_at                DATETIME     NULL COMMENT '마지막 채점 시각',
  CONSTRAINT fk_analysis_lots_lot
    FOREIGN KEY (lot_id) REFERENCES LOTS(id)
    ON DELETE CASCADE,
  INDEX idx_analysis_risk (risk_level),
  INDEX idx_analysis_scored (scored_at)
);

-- Judgment outcomes: clf quality_defect + reg capacity + residual_li + probability (0~1)
CREATE TABLE IF NOT EXISTS JUDGMENT_LOTS (
  lot_id          VARCHAR(64)  NOT NULL PRIMARY KEY,
  quality_defect  TINYINT(1)   NOT NULL,
  capacity        DOUBLE       NULL,
  residual_li     DOUBLE       NULL,
  probability     DOUBLE       NULL,
  spc             VARCHAR(16)  NULL,
  CONSTRAINT fk_judgment_lots_lot
    FOREIGN KEY (lot_id) REFERENCES LOTS(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS LOT_RECOMMENDED_ACTIONS (
  lot_id VARCHAR(64) NOT NULL PRIMARY KEY,
  summary VARCHAR(1024) NOT NULL DEFAULT '',
  steps_json JSON NOT NULL,
  sources_json JSON NOT NULL,
  drivers_json JSON NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ready',
  error_message VARCHAR(255) NULL,
  content_hash CHAR(40) NULL,
  generated_at DATETIME NOT NULL,
  CONSTRAINT fk_lot_recommended_actions_lot
    FOREIGN KEY (lot_id) REFERENCES LOTS(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Feeder + AI NULL-fill buffer (quality_defect / residual_li). Not dropped as orphan.
CREATE TABLE IF NOT EXISTS LOT_RESULTS (
  seq             INT          NOT NULL PRIMARY KEY,
  lot_id          VARCHAR(64)  NOT NULL,
  quality_defect  TINYINT      NULL,
  residual_li     DOUBLE       NULL,
  measured_at     DATETIME     NULL,
  UNIQUE KEY uq_lot_results_lot_id (lot_id)
);

CREATE TABLE IF NOT EXISTS ISSUES (
  issue_id          VARCHAR(32)  NOT NULL PRIMARY KEY,
  lot_id            VARCHAR(64)  NOT NULL,
  issue_content     VARCHAR(255) NOT NULL,
  action_content    TEXT         NULL,
  assignee_user_id  VARCHAR(50)  NULL,
  completed_at      DATETIME     NULL,
  created_at        DATETIME     NOT NULL,
  CONSTRAINT fk_issues_lot FOREIGN KEY (lot_id) REFERENCES LOTS(id),
  CONSTRAINT fk_issues_assignee FOREIGN KEY (assignee_user_id) REFERENCES USERS(user_id)
    ON DELETE SET NULL,
  INDEX idx_issues_lot (lot_id),
  INDEX idx_issues_created (created_at)
);

CREATE TABLE IF NOT EXISTS HANDOVER_HISTORY (
  history_id        BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  handover_content  VARCHAR(255) NOT NULL COMMENT '인수인계 내용(본문)',
  action            TEXT         NULL COMMENT '완료 플래그: NULL=pending, ''완료''=Knowledge 표시',
  handover_from     VARCHAR(50)  NULL COMMENT '인계자 ← USERS.name',
  handover_to       VARCHAR(50)  NULL COMMENT '인수자(선택)',
  assignee_user_id  VARCHAR(50)  NULL,
  category          VARCHAR(32)  NULL COMMENT '특이사항/전달사항/주의사항',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록 시각',
  archived_at       DATETIME     NULL COMMENT '완료 시각 (완료 버튼 시 NOW)',
  CONSTRAINT fk_handover_assignee
    FOREIGN KEY (assignee_user_id) REFERENCES USERS(user_id)
    ON DELETE SET NULL,
  INDEX idx_handover_created (created_at),
  INDEX idx_handover_action (action(32))
);

-- General-chat threads only. Security chat uses USER_SECURITY_*.
CREATE TABLE IF NOT EXISTS USER_CHAT_THREADS (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  user_id    VARCHAR(50)  NOT NULL,
  channel    VARCHAR(32)  NOT NULL DEFAULT 'general'
             COMMENT 'general',
  title      VARCHAR(255) NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_chat_threads_user
    FOREIGN KEY (user_id) REFERENCES USERS(user_id)
    ON DELETE CASCADE,
  INDEX idx_user_chat_threads_user_updated (user_id, updated_at),
  INDEX idx_user_chat_threads_channel (channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS USER_CHAT_MESSAGES (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  thread_id  CHAR(36)     NOT NULL,
  role       VARCHAR(16)  NOT NULL COMMENT 'user | assistant',
  content    TEXT         NOT NULL,
  mode       VARCHAR(64)  NULL,
  provider   VARCHAR(64)  NULL,
  sources    JSON         NULL COMMENT 'RAG sources for follow-up context',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_chat_messages_thread
    FOREIGN KEY (thread_id) REFERENCES USER_CHAT_THREADS(id)
    ON DELETE CASCADE,
  INDEX idx_user_chat_messages_thread_created (thread_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Security chat queue: AWS inserts user pending; PC worker writes assistant.
CREATE TABLE IF NOT EXISTS USER_SECURITY_THREADS (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  user_id    VARCHAR(50)  NOT NULL,
  title      VARCHAR(255) NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_security_threads_user
    FOREIGN KEY (user_id) REFERENCES USERS(user_id)
    ON DELETE CASCADE,
  INDEX idx_user_security_threads_user_updated (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS USER_SECURITY_MESSAGES (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  thread_id  CHAR(36)     NOT NULL,
  role       VARCHAR(16)  NOT NULL COMMENT 'user | assistant',
  content    TEXT         NOT NULL,
  status     VARCHAR(16)  NOT NULL DEFAULT 'done'
             COMMENT 'pending | processing | done | error',
  mode       VARCHAR(64)  NULL,
  provider   VARCHAR(64)  NULL,
  sources    JSON         NULL COMMENT 'RAG sources for follow-up context',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_security_messages_thread
    FOREIGN KEY (thread_id) REFERENCES USER_SECURITY_THREADS(id)
    ON DELETE CASCADE,
  INDEX idx_user_security_messages_thread_created (thread_id, created_at),
  INDEX idx_user_security_messages_pending (role, status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Inquiry board
CREATE TABLE IF NOT EXISTS INQUIRIES (
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
    FOREIGN KEY (author_user_id) REFERENCES USERS(user_id)
    ON DELETE SET NULL,
  CONSTRAINT fk_inquiries_answerer
    FOREIGN KEY (answered_by_user_id) REFERENCES USERS(user_id)
    ON DELETE SET NULL,
  INDEX idx_inquiries_category (category),
  INDEX idx_inquiries_status (status),
  INDEX idx_inquiries_created (created_at),
  INDEX idx_inquiries_visibility (visibility)
);

CREATE TABLE IF NOT EXISTS INQUIRY_ATTACHMENTS (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  inquiry_id     INT          NOT NULL,
  original_name  VARCHAR(255) NOT NULL,
  stored_name    VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(127) NOT NULL,
  size_bytes     INT          NOT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inquiry_attachments_inquiry
    FOREIGN KEY (inquiry_id) REFERENCES INQUIRIES(id)
    ON DELETE CASCADE,
  INDEX idx_inquiry_attachments_inquiry (inquiry_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Knowledge AI custom analysis answers only (prompt/docs are not persisted).
CREATE TABLE IF NOT EXISTS AI_LIBRARY_ANALYSIS (
  id                BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id           VARCHAR(50)  NOT NULL,
  name              VARCHAR(50)  NOT NULL,
  analysis_content  TEXT         NOT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_library_analysis_user
    FOREIGN KEY (user_id) REFERENCES USERS(user_id)
    ON DELETE CASCADE,
  INDEX idx_ai_library_analysis_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- OCR / empty-text sidecar: source image|scan PDF ↔ Markdown/*.md (path meta only).
CREATE TABLE IF NOT EXISTS TEXT_MATCH (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_path     VARCHAR(512) NOT NULL COMMENT 'repo-relative e.g. Documents/Public/a.pdf',
  md_path         VARCHAR(512) NOT NULL COMMENT 'repo-relative Markdown sidecar',
  clearance       VARCHAR(32)  NOT NULL,
  source_ext      VARCHAR(16)  NOT NULL,
  extract_method  VARCHAR(32)  NOT NULL DEFAULT 'ocr',
  source_sha1     CHAR(40)     NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'ready' COMMENT 'ready|failed|stale',
  error_message   VARCHAR(255) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_text_match_source (source_path),
  INDEX idx_text_match_md (md_path),
  INDEX idx_text_match_clearance (clearance)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Issue report mail log (n8n / Gmail API). HTML in mail_contents.
CREATE TABLE IF NOT EXISTS SEND_EMAIL (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lot_id        VARCHAR(64)  NOT NULL,
  user_id       VARCHAR(50)  NOT NULL,
  email         VARCHAR(100) NOT NULL COMMENT 'USERS.email snapshot at insert',
  mail_contents LONGTEXT     NOT NULL COMMENT 'LOT report HTML (not JSON/PDF)',
  send          CHAR(1)      NOT NULL DEFAULT 'X' COMMENT 'O=sent X=unsent/failed',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at       DATETIME     NULL,
  error         VARCHAR(255) NULL,
  CONSTRAINT fk_send_email_lot FOREIGN KEY (lot_id) REFERENCES LOTS(id),
  CONSTRAINT fk_send_email_user FOREIGN KEY (user_id) REFERENCES USERS(user_id),
  UNIQUE KEY uq_send_email_lot_user (lot_id, user_id),
  INDEX idx_send_email_send (send),
  INDEX idx_send_email_lot (lot_id),
  INDEX idx_send_email_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- See also DB/spc_limits_and_standard.sql (SPC_LIMITS, STANDARD, JUDGMENT_LOTS.spc)
-- See also DB/send_email.sql (ALTER USER_SETTINGS.email_check + SEND_EMAIL)

-- Issue report mail log + per-user opt-in (n8n / Gmail API).
-- email_check lives on user_settings (not FK-able from send_email).
-- Run: backend `npm run migrate:send-email`

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS email_check CHAR(1) NOT NULL DEFAULT 'X'
    COMMENT 'O=receive issue-report mail, X=opt-out';

CREATE TABLE IF NOT EXISTS send_email (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lot_id        VARCHAR(64)  NOT NULL,
  user_id       VARCHAR(50)  NOT NULL,
  email         VARCHAR(100) NOT NULL COMMENT 'users.email snapshot at insert',
  mail_contents LONGTEXT     NOT NULL COMMENT 'LOT report HTML (not JSON/PDF)',
  send          CHAR(1)      NOT NULL DEFAULT 'X' COMMENT 'O=sent X=unsent/failed',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at       DATETIME     NULL,
  error         VARCHAR(255) NULL,
  CONSTRAINT fk_send_email_lot FOREIGN KEY (lot_id) REFERENCES lots(id),
  CONSTRAINT fk_send_email_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  UNIQUE KEY uq_send_email_lot_user (lot_id, user_id),
  INDEX idx_send_email_send (send),
  INDEX idx_send_email_lot (lot_id),
  INDEX idx_send_email_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

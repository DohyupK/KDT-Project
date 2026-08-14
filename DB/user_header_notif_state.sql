-- Per-user header bell read/dismiss overlay (not the notification list itself).
-- Run: backend `npm run migrate:header-notif-state`

CREATE TABLE IF NOT EXISTS user_header_notif_state (
  user_id         VARCHAR(50)  NOT NULL PRIMARY KEY,
  read_ids        JSON         NOT NULL,
  dismissed_ids   JSON         NOT NULL,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_header_notif_state_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

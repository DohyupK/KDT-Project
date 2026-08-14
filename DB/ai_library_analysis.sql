-- Knowledge AI Library analysis answers (reply only; no prompt/docs).
CREATE TABLE IF NOT EXISTS AI_Library_analysis (
  id                BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id           VARCHAR(50)  NOT NULL,
  name              VARCHAR(50)  NOT NULL,
  analysis_content  TEXT         NOT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_library_analysis_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,
  INDEX idx_ai_library_analysis_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

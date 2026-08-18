-- Knowledge AI Library analysis answers (reply only; no prompt/docs).
-- XOR: user_id = 선택 항목 분석, lot_id = 과거 자료 LOT 진단 캐시.
CREATE TABLE IF NOT EXISTS AI_LIBRARY_ANALYSIS (
  id                BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id           VARCHAR(50)  NULL,
  name              VARCHAR(50)  NULL,
  lot_id            VARCHAR(64)  NULL COMMENT 'LOTS.id — past-issue diagnosis cache',
  analysis_content  TEXT         NOT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_library_analysis_user
    FOREIGN KEY (user_id) REFERENCES USERS(user_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_ai_library_analysis_lot
    FOREIGN KEY (lot_id) REFERENCES LOTS(id)
    ON DELETE CASCADE,
  CONSTRAINT chk_ai_library_analysis_owner CHECK (
    (user_id IS NOT NULL AND lot_id IS NULL)
    OR (user_id IS NULL AND lot_id IS NOT NULL)
  ),
  UNIQUE KEY uq_ai_library_analysis_lot (lot_id),
  INDEX idx_ai_library_analysis_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

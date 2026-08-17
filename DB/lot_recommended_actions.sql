-- AI recommended actions per LOT (summary + steps + QMS sources + ML drivers).
-- SSOT for dashboard 「조치 (AI 권고)」; ISSUES.action_content is separate (field record).

CREATE TABLE IF NOT EXISTS LOT_RECOMMENDED_ACTIONS (
  lot_id VARCHAR(64) NOT NULL PRIMARY KEY,
  summary VARCHAR(1024) NOT NULL DEFAULT '',
  steps_json JSON NOT NULL,
  sources_json JSON NOT NULL,
  drivers_json JSON NULL COMMENT 'defect/residual causes for UI + RAG input',
  status VARCHAR(16) NOT NULL DEFAULT 'ready',
  error_message VARCHAR(255) NULL,
  content_hash CHAR(40) NULL,
  generated_at DATETIME NOT NULL,
  CONSTRAINT fk_lot_recommended_actions_lot
    FOREIGN KEY (lot_id) REFERENCES LOTS(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- AI_LIBRARY_ANALYSIS: user 선택 분석 vs LOT 진단 캐시 분리.
-- user_id XOR lot_id. LOT당 진단 1행 (UNIQUE lot_id, NULL 허용).
-- Run on live MariaDB once.

ALTER TABLE AI_LIBRARY_ANALYSIS
  DROP FOREIGN KEY fk_ai_library_analysis_user;

ALTER TABLE AI_LIBRARY_ANALYSIS
  MODIFY COLUMN user_id VARCHAR(50) NULL,
  MODIFY COLUMN name VARCHAR(50) NULL;

ALTER TABLE AI_LIBRARY_ANALYSIS
  ADD COLUMN lot_id VARCHAR(64) NULL COMMENT 'LOTS.id — past-issue diagnosis cache';

ALTER TABLE AI_LIBRARY_ANALYSIS
  ADD CONSTRAINT fk_ai_library_analysis_user
    FOREIGN KEY (user_id) REFERENCES USERS(user_id)
    ON DELETE CASCADE,
  ADD CONSTRAINT fk_ai_library_analysis_lot
    FOREIGN KEY (lot_id) REFERENCES LOTS(id)
    ON DELETE CASCADE,
  ADD UNIQUE KEY uq_ai_library_analysis_lot (lot_id),
  ADD CONSTRAINT chk_ai_library_analysis_owner CHECK (
    (user_id IS NOT NULL AND lot_id IS NULL)
    OR (user_id IS NULL AND lot_id IS NOT NULL)
  );

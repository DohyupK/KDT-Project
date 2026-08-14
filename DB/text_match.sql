-- Apply on existing MariaDB when schema.sql full re-run is not used.
-- Source: Documents OCR sidecar pairing (ai-service text_match_store).

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

-- Inquiry board attachments (one row per file). Binaries live on disk, not in DB.
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

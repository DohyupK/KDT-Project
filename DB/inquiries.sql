-- Inquiry board table (see also DB/inquiry_attachments.sql)
CREATE TABLE IF NOT EXISTS inquiries (
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
    FOREIGN KEY (author_user_id) REFERENCES users(user_id)
    ON DELETE SET NULL,
  CONSTRAINT fk_inquiries_answerer
    FOREIGN KEY (answered_by_user_id) REFERENCES users(user_id)
    ON DELETE SET NULL,
  INDEX idx_inquiries_category (category),
  INDEX idx_inquiries_status (status),
  INDEX idx_inquiries_created (created_at),
  INDEX idx_inquiries_visibility (visibility)
);

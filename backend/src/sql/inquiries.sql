CREATE TABLE IF NOT EXISTS inquiries (
  id              VARCHAR(20)  NOT NULL PRIMARY KEY,
  category        VARCHAR(100) NOT NULL,
  title           VARCHAR(200) NOT NULL,
  author          VARCHAR(50)  NOT NULL,
  author_user_id  VARCHAR(50)  NULL,
  content         TEXT         NOT NULL,
  answer          TEXT         NOT NULL DEFAULT '',
  status          ENUM('접수', '답변완료') NOT NULL DEFAULT '접수',
  visibility      ENUM('공개', '비공개') NOT NULL DEFAULT '공개',
  answered_at     DATETIME     NULL,
  created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_inquiries_created (created_at),
  INDEX idx_inquiries_status (status)
);

CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(50) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  name       VARCHAR(50) NOT NULL,
  phone      VARCHAR(20) NOT NULL,
  email      VARCHAR(100) NOT NULL,
  font_size        INT NOT NULL DEFAULT 18,
  theme_mode       TINYINT(1) NOT NULL DEFAULT 1,
  language         VARCHAR(5) NOT NULL DEFAULT 'ko',
  refresh_interval INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inquiries (
  id            VARCHAR(20) PRIMARY KEY,
  user_id       VARCHAR(50) NULL,
  author_name   VARCHAR(50) NOT NULL,
  email         VARCHAR(100) NOT NULL,
  phone         VARCHAR(20) NULL,
  category      VARCHAR(50) NOT NULL,
  title         VARCHAR(200) NOT NULL,
  content       TEXT NOT NULL,
  is_private    TINYINT(1) NOT NULL DEFAULT 0,
  attachments   JSON NULL,
  status        VARCHAR(20) NOT NULL DEFAULT '대기',
  priority      VARCHAR(10) NOT NULL DEFAULT '보통',
  department    VARCHAR(50) NULL,
  reply_content TEXT NULL,
  reply_assignee VARCHAR(50) NULL,
  reply_status  VARCHAR(20) NULL,
  reply_internal_memo TEXT NULL,
  reply_admin_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  replied_at    DATETIME NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_inquiries_user (user_id),
  INDEX idx_inquiries_status (status),
  INDEX idx_inquiries_created (created_at)
);

CREATE TABLE IF NOT EXISTS issues (
  id            VARCHAR(20) PRIMARY KEY,
  occurred_at   DATETIME NOT NULL,
  lot           VARCHAR(50) NOT NULL,
  risk          VARCHAR(10) NOT NULL,
  status        VARCHAR(20) NOT NULL,
  title         VARCHAR(200) NOT NULL,
  assignee      VARCHAR(50) NOT NULL DEFAULT '미배정',
  action        TEXT NULL,
  completed     TINYINT(1) NOT NULL DEFAULT 0,
  anomaly       TEXT NOT NULL,
  process_data  JSON NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_issues_date (occurred_at),
  INDEX idx_issues_lot (lot),
  INDEX idx_issues_status (status),
  INDEX idx_issues_risk (risk)
);

CREATE TABLE IF NOT EXISTS knowledge_actions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  situation  TEXT NOT NULL,
  action     TEXT NOT NULL,
  cause      TEXT NOT NULL,
  manager    VARCHAR(50) NOT NULL,
  action_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_knowledge_actions_date (action_date)
);

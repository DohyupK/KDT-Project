-- Per-user Setting page preferences (linked to users.user_id)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id               VARCHAR(50)  NOT NULL PRIMARY KEY,
  font_size             INT          NOT NULL DEFAULT 18,
  theme_mode            TINYINT      NOT NULL DEFAULT 1 COMMENT '0=dark, 1=light',
  refresh_interval      INT          NOT NULL DEFAULT 1 COMMENT 'minutes: 1/5/10/30',
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_settings_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE
);

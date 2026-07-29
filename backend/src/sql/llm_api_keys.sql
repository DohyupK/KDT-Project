-- Encrypted LLM API keys (AES-GCM ciphertext; master key in backend/.env LLM_KEYS_ENCRYPTION_KEY)
CREATE TABLE IF NOT EXISTS llm_api_keys (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  display_name VARCHAR(255) NOT NULL,
  provider_kind VARCHAR(64) NOT NULL,
  company VARCHAR(64) NOT NULL,
  model VARCHAR(255) NOT NULL,
  base_url VARCHAR(512) NULL,
  key_last4 VARCHAR(8) NOT NULL,
  cost_score DOUBLE NOT NULL DEFAULT 1,
  ciphertext BLOB NOT NULL,
  iv BLOB NOT NULL,
  tag BLOB NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

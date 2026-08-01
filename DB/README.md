# Local / schema DB artifacts (not application source)

- **MariaDB DDL** for multi-turn chat: [`ai-service/user_chat_tables.sql`](./ai-service/user_chat_tables.sql)
- Apply: `python DB/ai-service/apply_user_chat_tables.py` (uses `ai-service/.env` or `backend/.env` `DB_*`)
- Existing ai-service SQLite keys remain at `ai-service/DB/llm_keys.sqlite` (legacy path; new local DBs prefer this tree)

Remote MariaDB (`DB_HOST` / `kdt_project`) holds `users`, `user_chat_*`, etc.

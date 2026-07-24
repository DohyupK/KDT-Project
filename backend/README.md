# backend

Express + MariaDB API for chat sessions, security keyword gate, and ai-service proxy.

## Setup

1. Create DB and apply schema:

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS kdt CHARACTER SET utf8mb4;"
mysql -u root -p kdt < src/sql/schema.sql
```

2. Copy env:

```bash
copy .env.example .env
```

- MariaDB 비밀번호가 없으면 `CHAT_STORE=sqlite`(기본)로 세션·유사질문 카운팅을 영속합니다.
- MariaDB 사용 시 `CHAT_STORE=mariadb` + `DB_PASSWORD` 설정 후 `schema.sql` 적용.

3. Run:

```bash
npm run dev
```

- Health: `GET http://127.0.0.1:3001/api/health`
- Chat: `POST http://127.0.0.1:3001/api/chat`

Frontend reaches this via Next rewrite `/api` → `:3001`.

## 기술 스택

- Express 5, TypeScript (tsx), MariaDB connector, CORS, dotenv

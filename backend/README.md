# backend

Express + MariaDB API for chat sessions, security keyword gate, ai-service proxy, and auth (login/register).

## Setup

1. Create DB and apply schemas:

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS kdt_project CHARACTER SET utf8mb4;"
mysql -u root -p kdt_project < ../DB/schema.sql
mysql -u root -p kdt_project < ../DB/chat_schema.sql
```

- `DB/schema.sql` (repo root): `users`, settings, lots, issues, handover, inquiries
- `DB/inquiries.sql`: inquiries only (or `npm run migrate:inquiries`)
- `DB/chat_schema.sql`: chat sessions/messages (when using MariaDB chat store)

2. Copy env:

```bash
copy .env.example .env
```

- MariaDB 비밀번호가 없으면 `CHAT_STORE=sqlite`(기본)로 세션·유사질문 카운팅을 영속합니다.
- 챗도 공용 MariaDB에 두려면 `CHAT_STORE=mariadb` + `DB/chat_schema.sql` 적용.
- LLM API 키(암호문)는 **`DB/data/llm_keys.sqlite`** (보안 탭). 복호화 마스터: `LLM_KEYS_ENCRYPTION_KEY`(16자 이상, Git 금지).
- SQLite 기본 경로: `DB/data/chat.sqlite`, `DB/data/control.sqlite`.
- Auth용: `JWT_SECRET`, `DB_*`, `CORS_ORIGIN` 또는 `CORS_ORIGINS` 설정.
- **팀 공용 DB (Lightsail Ubuntu + MariaDB):** [docs/guides/login-ubuntu-mariadb.md](../docs/guides/login-ubuntu-mariadb.md) · 기술스택 [docs/references/login-auth-tech-stack.md](../docs/references/login-auth-tech-stack.md). `.env`는 Git에 올리지 말고 단톡으로 `DB_*`만 공유.

3. Run:

```bash
npm run dev
```

- Health: `GET http://127.0.0.1:3001/api/health`
- Auth: `/api/auth/*` (login, register, profile, …)
- Chat: `POST http://127.0.0.1:3001/api/chat`

Frontend reaches this via Next rewrite `/api` → `:3001`.

## 기술 스택

- Express 5, TypeScript (tsx), MariaDB connector, CORS, dotenv
- Auth: bcryptjs, jsonwebtoken

## Auth API (요약)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/auth/check-id` | 아이디 중복 확인 |
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/login` | 로그인 (JWT) |
| POST | `/api/auth/find-id` | 아이디 찾기 |
| POST | `/api/auth/verify-reset` | 비밀번호 재설정 본인확인 |
| POST | `/api/auth/reset-password` | 비밀번호 재설정 |
| POST | `/api/auth/logout` | 로그아웃 (JWT) |
| GET/PUT | `/api/auth/profile` | 프로필 조회/수정 (JWT) |
| DELETE | `/api/auth/account` | 회원탈퇴 (JWT) |

관련 코드:

- `src/routes/auth.routes.ts`
- `src/controllers/auth.controller.ts`
- `src/services/auth.service.ts`
- `src/middleware/auth.middleware.ts`
- `src/db/connection.ts`
- `../DB/schema.sql`

## Inquiry API (요약)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/inquiries` | 목록·필터·페이지 (JWT). query: category, status, startDate, endDate, q, page, pageSize |
| POST | `/api/inquiries` | 문의 접수 (JWT). body: category, visibility, title, content |
| GET | `/api/inquiries/:id` | 상세 (`:id` = inquiry_code, JWT). 비공개는 작성자·관리자만 |
| POST/PATCH/PUT | `/api/inquiries/:id/answer` | 관리자 답변 upsert. body: `{ content }`. `ADMIN_USER_IDS` 필요 |

- 테이블: `../DB/schema.sql` / `../DB/inquiries.sql` · `npm run migrate:inquiries`
- 목업 시드: `../DB/inquiries_seed.sql` · `npm run seed:inquiries`
- 코드: `src/routes/inquiry.routes.ts`, `controllers/inquiry.controller.ts`, `services/inquiry.service.ts`
- 첨부 업로드는 후속 (미구현)

## Issue API (요약)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/issues` | 미완료 높음·중간 이슈 목록. query: search, date, lotId, riskLevel, status |
| GET | `/api/issues/:issueId` | 기본 상세와 담당자·조치 내용 조회 |
| PUT | `/api/issues/:issueId` | 처리 상태·조치 내용·완료 여부 저장 (JWT) |

- 담당자는 저장 요청 JWT의 `userId`를 `issues.assignee_user_id`에 기록합니다.
- 목업 기본 데이터 8건: `../DB/issues_seed.sql` · `npm run seed:issues`
- 시드는 기존 LOT·이슈를 덮어쓰지 않으며, 목업 담당자와 이름이 같은 실제 사용자가 있을 때만 FK를 연결합니다.
- SPC 상세 분석, 잔류 Li·여유·불량 확률, 라이브러리 테이블 이관은 후속 범위입니다.
- 상세 계약: `../docs/references/issue-lot-api.md`

## 변경·설치 이력 (2026-07-24)

### 로컬 작업 요약

1. 로그인 관련 코드를 `C:\Projects\KDT-auth-backup-20260724`에 백업  
   - FE/BE auth 소스, `users` dump (`users-dump.sql`), 로컬 `.env` 백업
2. `DohyupK/KDT-Project`의 `feature` 브랜치를 clone → 당시 `KDT-Project-fresh`
3. 백업한 로그인 기능을 fresh에 이식하고 `/api/auth`를 `src/app.ts`에 연결
4. DB `kdt_project.users` 스키마 적용 (기존 테스트 계정 유지)
5. 스모크: `GET /api/health`, `GET /api/auth/check-id` 정상
6. **폴더 정리 (요청 2번)**  
   - 옛 충돌 상태 로컬 `C:\Projects\KDT-Project` 삭제  
   - `KDT-Project-fresh` 내용을 `C:\Projects\KDT-Project`로 이동(리네임 동등 처리)  
   - 빈 `C:\Projects\KDT-Project-fresh` 디렉터리가 IDE 잠금으로 남을 수 있음 → 수동 삭제 가능
7. GitHub fork 삭제/재생성/push는 **사용자 직접** 진행 (에이전트 미수행)

### 설치된 프로그램

- GitHub CLI (`gh`) — `winget install GitHub.cli` (버전 확인 예: 2.96.0)  
  - 경로 예: `C:\Program Files\GitHub CLI\gh.exe`  
  - 참고: fork 작업은 사용자가 GitHub 웹에서 진행

### 주요 경로

| 항목 | 경로 |
|------|------|
| 현재 작업 루트 | `C:\Projects\KDT-Project` |
| 로그인 백업 | `C:\Projects\KDT-auth-backup-20260724` |
| Auth / LOT / 이슈 스키마 | `DB/schema.sql` |
| Chat 스키마 | `DB/chat_schema.sql` |
| SQLite 런타임 | `DB/data/*.sqlite` |
| 로컬 env (커밋 금지) | `backend/.env` |

### 환경 변수 (auth 관련)

- `JWT_SECRET` — 필수
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (기본 DB명 예: `kdt_project`)
- `CORS_ORIGINS` 또는 `CORS_ORIGIN` (예: `http://localhost:3000`)
- `PORT` (기본 `3001`)

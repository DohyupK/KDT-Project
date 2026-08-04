# Backend — API 패키지

Express API: 세션 · 보안 게이트 · ai-service 프록시 · auth · 이슈/문의 · 제어/outcome.

| 보고 싶은 것 | 파일 |
|--------------|------|
| 저장소 전체 지도 · 실행 · **기술 스택** | [`../README.md`](../README.md) |
| DB 스키마 | [`../DB/schema.sql`](../DB/schema.sql) · [`../DB/chat_schema.sql`](../DB/chat_schema.sql) |
| Auth 기술 메모 | [`../docs/references/login-auth-tech-stack.md`](../docs/references/login-auth-tech-stack.md) |

---

## 한 줄 역할

브라우저와 ai-service 사이의 **게이트웨이** — JWT auth, 챗/보안 프록시, CRUD(이슈·문의), LLM 키·제어 로그.

---

## 기능 요약

| 기능 | 경로 prefix | 비고 |
|------|-------------|------|
| Health | `GET /api/health` | |
| Auth | `/api/auth/*` | 로그인·가입·프로필·탈퇴 등 JWT |
| Chat 프록시 | `POST /api/chat` | 보안 키워드 게이트 → ai-service `/chat` |
| Security chat | `/api/security-chat`, `/stream` | SSE·JSON 패스스루 · 클라우드 폴백 없음 |
| Chat threads | `/api/chat-threads` 등 | 멀티턴 스레드 복원 |
| LLM keys | `/api/llm-keys` | 보안 탭 키 → `DB/data/llm_keys.sqlite` 암호 저장 |
| Control / outcome | `/api/control/*` | 승인·되돌리기·outcome (하드웨어 미연동 스텁 가능) |
| Settings | `/api/settings/control-bounds` | 제어 한계치 |
| Issues | `/api/issues` | 목록·상세·조치 저장 |
| Inquiries | `/api/inquiries` | 문의·관리자 답변 |

---

## 세부 설계

### 구조

- 진입: `src/index.ts` · 앱 조립: `src/app.ts`
- 라우트 → 컨트롤러 → 서비스 분리 (`src/routes` · `controllers` · `services`)
- 루트 `.env` 로드 (`loadRootEnv`) · **시크릿 커밋 금지**
- Frontend는 Next rewrite `/api` → `:3001`로 접근
- ai-service URL: `AI_SERVICE_URL` 또는 `http://127.0.0.1:8800`

### DB · 스토어

- DB명은 **루트 `.env`의 `DB_*`** 기준 (예: `kdt` / `kdt_project`)
- 스키마: `../DB/schema.sql` (users, lots, issues, inquiries, …) · `../DB/chat_schema.sql`
- 채팅 세션 기본: `CHAT_STORE=sqlite` → `DB/data/chat.sqlite` (MariaDB 없이도 챗 가능)
- `CHAT_STORE=mariadb`일 때 chat 스키마 적용
- LLM 키: `DB/data/llm_keys.sqlite` · 마스터 `LLM_KEYS_ENCRYPTION_KEY`
- 제어 로그: `DB/data/control.sqlite` 등

### Auth API

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

코드: `src/routes/auth.routes.ts` · `controllers/auth.controller.ts` · `services/auth.service.ts` · `middleware/auth.middleware.ts`

### Inquiry API

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/inquiries` | 목록·필터·페이지 (JWT) |
| POST | `/api/inquiries` | 문의 접수 (JWT) |
| GET | `/api/inquiries/:id` | 상세 (`inquiry_code`, JWT) |
| POST/PATCH/PUT | `/api/inquiries/:id/answer` | 관리자 답변 · `ADMIN_USER_IDS` |

시드: `npm run seed:inquiries` · 첨부 업로드는 후속.

### Issue API

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/issues` | 미완료 높음·중간 목록 |
| GET | `/api/issues/:issueId` | 상세·담당자·조치 |
| PUT | `/api/issues/:issueId` | 상태·조치 저장 (JWT → assignee) |

상세 계약: [`../docs/references/issue-lot-api.md`](../docs/references/issue-lot-api.md)  
시드: `npm run seed:issues`

---

## 실행 방법

**권장:** 저장소 루트에서 `npm run dev`  
→ [로컬 실행 — 챗봇](../README.md#로컬-실행--챗봇)

### DB (최초, MariaDB 사용 시)

```bash
# DB명은 루트 .env 의 DB_NAME 과 동일하게
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS kdt CHARACTER SET utf8mb4;"
mysql -u root -p kdt < ../DB/schema.sql
mysql -u root -p kdt < ../DB/chat_schema.sql
```

### 개별 기동

```bash
cd backend
npm install
npm run dev
```

- Health: `GET http://127.0.0.1:3001/api/health`
- Env: `JWT_SECRET`, `DB_*`, `CORS_ORIGIN`/`CORS_ORIGINS`, `PORT`(기본 3001), `LLM_KEYS_ENCRYPTION_KEY`
- 팀 공용 DB 가이드: [`../docs/guides/login-ubuntu-mariadb.md`](../docs/guides/login-ubuntu-mariadb.md)

---

## 기술 스택

모노레포 스택 SSOT: [루트 README — 기술 스택](../README.md#기술-스택-모노레포)

---

## 관련 메모 (2026-07-24 auth 이식)

로컬 백업·fresh 이식·`gh` 설치 등 일화는 [`../docs/work-log/`](../docs/work-log/)를 본다.  
Auth 관련 env: `JWT_SECRET`, `DB_*`, `CORS_*`, `PORT`.

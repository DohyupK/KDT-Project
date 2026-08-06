# Backend — API 패키지

Express API: 세션 · 보안 게이트 · ai-service 프록시 · auth · 이슈/문의 · 제어/outcome.

| 보고 싶은 것 | 파일 |
|--------------|------|
| 저장소 전체 지도 · 실행 · **기술 스택** | [`../README.md`](../README.md) |
| DB 스키마 | [`../DB/schema.sql`](../DB/schema.sql) · [`../DB/chat_schema.sql`](../DB/chat_schema.sql) |
| Auth 기술 메모 | [`../docs/references/login-auth-tech-stack.md`](../docs/references/login-auth-tech-stack.md) |

---

## 한 줄 역할

- `DB/schema.sql` (repo root): `users`, settings, `lots` (공정), `analysis_lots` (채점), `judgment_lots` (품질·용량·잔류), issues, handover, inquiries
- `DB/inquiries.sql`: inquiries only (or `npm run migrate:inquiries`)
- `DB/chat_schema.sql`: chat sessions/messages (when using MariaDB chat store)

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
- 스키마: `../DB/schema.sql` (users, lots, analysis_lots, issues, inquiries, …) · `../DB/chat_schema.sql`
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

### Issue / LOT / Dashboard API

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/issues` | 미완료 심각·주의 이슈 목록. query: search, date, lotId, riskLevel, status |
| GET | `/api/issues/:issueId` | 기본 상세와 담당자·조치 내용 조회 |
| PUT | `/api/issues/:issueId` | 처리 상태·조치 내용·완료 여부 저장 (JWT) |
| GET | `/api/lots/risk-top` | 심각·주의 LOT Top |
| POST | `/api/lots/import` | CSV 공정값 적재 (`?score=1` 시 채점) |
| POST | `/api/lots/score` | AI+SPC 재채점 (JWT) |
| GET | `/api/dashboard/*` | LOT 위험·생산추이·상세·CSV·SHAP |

```bash
cd backend
# 잘못된 전량 채점 롤백 (analysis_lots + judgment_lots.residual_li)
npm run rollback:score-lots
# ai-service(:8800) ready 후 lots 공정 → analysis_lots 재채점
npm run score:lots
npm run score:lots -- --limit=100 --concurrency=4
# QC CSV로 lots 재적재 (residual 제외 · 자식 id 유지)
npm run reload:lots-qc
# SPC_LOT → lots 미러 + 신규/미채점 score (judgment NULL만 AI)
npm run sync:spc-lots
npm run sync:spc-lots -- --skip-score
```

- 위험등급: `심각` \| `주의` \| `안정` · SPC: `이탈` \| `주의` \| `안정` \| `이탈, 주의`
- 여유량 = `4000 - residual_li` (API `residualLithium` · DB `judgment_lots.residual_li`)
- **테이블:** `lots` PK=`id` (공정만) · 채점=`analysis_lots` · 판정=`judgment_lots` (`quality_defect`·`capacity`·`residual_li`·`probability`) · 자식 FK `lot_id` → `lots.id`
- **이슈 ID:** `ISS-yyMMdd-001` 일별 순번 유지
- **채점·판정 쓰기 (운영):**
  - 입력: `lots` 공정값 → ai-service **`Promise.all`로 3헤드 병렬** (`/predict` · `/predict-capacity` · `/predict-residual`) — 학습 순서(clf→reg→residual)와 무관
  - `analysis_lots`: AI+SPC 점수 **UPSERT**(재채점 시 갱신)
  - `judgment_lots`: `quality_defect`·`capacity`·`residual_li`·`probability`는 **NULL일 때만** 채움 (`COALESCE` · 이미 값이 있으면 유지)
  - `probability` ← `/predict` 앙상블 **불량확률** (0~1) · `quality_defect` ← 같은 응답의 임계값 판정(0/1) · 용량·잔류는 각 회귀 헤드
  - 모델 원리·임계값: [`../ai-service/README.md`](../ai-service/README.md) 「추론·불량확률」
- LOT CSV 적재: `POST /api/lots/import` (`id`/`timestamp`/공정 → `lots`)
- QC 재적재: `npm run reload:lots-qc` · `../DB/reload_lots_from_qc_csv.sql`
- **SPC 싱크 주기:** 기동 시 즉시 1회 + **60초 폴링** (`spcLotSyncPoller` · `SPC_SYNC_ENABLED` 기본 on · `SPC_SYNC_INTERVAL_MS=60000` · `0`/off면 비활성) · 틱마다 `SPC_LOT`→`lots` 미러 + `scored_at` NULL 미채점 score(상한) · 수동 `npm run sync:spc-lots`
- 구조 SQL: `../DB/align_lots_csv_column_names.sql` · `../DB/migrate_lots_to_analysis_lots.sql`
- 상세 계약: `../docs/references/issue-lot-api.md`
- 챗봇 인수인계: `../docs/references/chatbot-handoff-2026-08-04.md`

- 담당자는 저장 요청 JWT의 `userId`를 `issues.assignee_user_id`에 기록합니다.
- 목업 기본 데이터 8건: `../DB/issues_seed.sql` · `npm run seed:issues`
- 판정 테이블: `../DB/judgment_lots.sql` · `npm run seed:judgment-lots` (clf+reg CSV ∩ lots → `judgment_lots`)

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
| Auth users 스키마 | `backend/schema.sql` |
| Chat 스키마 | `backend/src/sql/schema.sql` |
| 로컬 env (커밋 금지) | 모노레포 루트 `.env` |

### 환경 변수 (auth 관련)

- `JWT_SECRET` — 필수
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (기본 DB명 예: `kdt_project`)
- `CORS_ORIGINS` 또는 `CORS_ORIGIN` (예: `http://localhost:3000`)
- `PORT` (기본 `3001`)

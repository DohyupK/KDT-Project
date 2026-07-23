# 2026-07-23 작업 기록 — 전체 페이지 백엔드 연동 검증

## 요약

| 항목 | 결과 |
|------|------|
| **총 테스트** | 34 |
| **PASS** | 32 |
| **FAIL** | 0 |
| **SKIP** | 2 (의도적 mock/로컬 UI) |
| **실행 스크립트** | `scripts/verify-integration.mjs` |

## 페이지별 결과

| 페이지 | API 연동 | 검증 결과 | 비고 |
|--------|----------|-----------|------|
| **Login** | ✅ | PASS 5/5 | register, login, profile, check-id, find-id |
| **Setting** | ✅ | PASS 3/3 | settings GET/PUT, profile PUT |
| **Inquiry** | ✅ | PASS 1/1 | POST /inquiries |
| **Management** | ✅ | PASS 7/7 | mails, defects, inquiries+reply 교차 검증 |
| **Main** | ✅ | PASS 1/1 | GET /main/overview |
| **Dashboard** | ⚠️ 부분 | PASS 2/2 + SKIP 1 | KPI·차트 API ✅ / 담당자·자동발송 mock |
| **Issue** | ⚠️ 부분 | PASS 3/3 + SKIP 1 | 이슈 CRUD ✅ / 인수인계 노트·PDF·CSV 로컬 |
| **Knowledge** | ✅ | PASS 8/8 | documents, actions CRUD, report |
| **Frontend** | ✅ | PASS 1/1 | `/api` → `:3001` 프록시 |

## 교차 시나리오

1. `POST /api/inquiries` → `INQ-002` 생성
2. `GET /api/inquiries` → Management 목록에 포함 (`cross=true`)
3. `PUT /api/inquiries/:id/reply` → 상태 `완료` 반영

## SKIP (API 미구현 — UI mock/로컬)

- **Dashboard**: `STAFF_MEMBERS`, 자동 전송 설정, 리포트 이메일 전송
- **Issue**: 인수인계 특이사항 노트, PDF/CSV 다운로드

## 검증 중 조치 (Auth DB)

초기 검증 시 Auth API 500 발생 원인:

1. `backend/.env` DB 비밀번호 미설정 → `DB_PASSWORD=1234` 적용
2. `cathode_ai_simple_db`에 기존 `users` 테이블 스키마 충돌 → **`kdt_project` DB 신규 생성** + `schema.sql` 적용
3. 백엔드 프로세스 재시작 (`.env` 반영)

## MOCK 환경 (`backend/.env`)

```
MOCK_SETTINGS=true
MOCK_INQUIRIES=true
MOCK_MAIN=true
MOCK_DASHBOARD=true
MOCK_ISSUES=true
MOCK_KNOWLEDGE=true
MOCK_MANAGEMENT_MAIL=true
MOCK_MANAGEMENT_DEFECT=true
```

Auth·Settings(저장 시)는 `kdt_project` MariaDB 사용. 나머지는 mock fallback 또는 DB 집계 혼합.

## 재실행 방법

```bash
# 터미널 1
cd backend && npm run dev

# 터미널 2
cd frontend && npm run dev

# 터미널 3
node scripts/verify-integration.mjs
```

## 결론

**UI에 있는 핵심 기능 기준으로 모든 페이지 백엔드 연동이 정상 동작**함을 API 레벨에서 확인했습니다. Dashboard·Issue의 일부 UI는 mock/로컬로 남아 있으며, 이는 work-log에 문서화된 의도적 범위입니다.

## 상세 테스트 목록

| Page | Test | Status |
|------|------|--------|
| Common | GET /health | PASS |
| Login | GET /auth/check-id | PASS |
| Login | POST /auth/register | PASS |
| Login | POST /auth/login | PASS |
| Login | GET /auth/profile | PASS |
| Login | POST /auth/find-id | PASS |
| Setting | GET /settings | PASS |
| Setting | PUT /settings | PASS |
| Setting | PUT /auth/profile | PASS |
| Inquiry | POST /inquiries | PASS |
| Management | GET /management/mails | PASS |
| Management | PATCH mail read | PASS |
| Management | GET /inquiries | PASS |
| Management | PUT inquiry reply | PASS |
| Management | GET /management/defects | PASS |
| Management | GET defect-settings | PASS |
| Management | PUT defect-settings | PASS |
| Main | GET /main/overview | PASS |
| Dashboard | GET /dashboard/summary | PASS |
| Dashboard | GET summary filtered | PASS |
| Dashboard | STAFF/auto-send/report | SKIP |
| Issue | GET /issues | PASS |
| Issue | GET handover/summary | PASS |
| Issue | PUT /issues/:id | PASS |
| Issue | handoverNotes/PDF/CSV | SKIP |
| Knowledge | GET /knowledge/documents | PASS |
| Knowledge | GET document detail | PASS |
| Knowledge | GET /knowledge/actions | PASS |
| Knowledge | POST /knowledge/actions | PASS |
| Knowledge | PUT /knowledge/actions/:id | PASS |
| Knowledge | DELETE /knowledge/actions/:id | PASS |
| Knowledge | GET /knowledge/report | PASS |
| Knowledge | POST report/refresh | PASS |
| Frontend | proxy /api -> 3001 | PASS |

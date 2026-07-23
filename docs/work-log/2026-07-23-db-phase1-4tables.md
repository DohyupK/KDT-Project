# 2026-07-23 작업 기록 — DB Phase 1 (4테이블 최소 설계)

## 요약

| 항목 | 결과 |
|------|------|
| **목표** | `users`·`inquiries`·`issues`·`knowledge_actions` 4테이블만 DB 사용 |
| **검증** | `node scripts/verify-integration.mjs` → **PASS 32 / FAIL 0 / SKIP 2** |
| **스키마 적용** | HeidiSQL 수동 (Agent는 `apply-schema.mjs`·DROP TABLE 미실행) |
| **커밋** | 없음 (요청에 따라 생략) |

## DB 테이블 (4개)

| 테이블 | 역할 | 비고 |
|--------|------|------|
| **users** | 회원 + 설정 | `user_settings` 흡수: `font_size`, `theme_mode`, `language`, `refresh_interval` |
| **inquiries** | 문의 CRUD + 답변 | `reply_*`, `replied_at` 컬럼 통합 유지 |
| **issues** | 이슈 조회·수정 | DB 비어 있으면 mock seed INSERT (최초 1회) |
| **knowledge_actions** | 상황 대처 CRUD | DB 비어 있으면 mock seed INSERT (최초 1회) |

## DB에 만들지 않는 것

| 항목 | 처리 |
|------|------|
| `user_settings` | 삭제·미사용 → `users` 컬럼으로 통합 |
| `knowledge_documents` | `buildInitialDocuments()` 시드 + 메모리 GET |
| `cathode_*`, `daily_defect_rates` | Phase 1 범위 외 (Main/Dashboard mock 유지) |

## Backend 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `backend/schema.sql` | 4테이블 DDL (HeidiSQL용과 동일) |
| `backend/.env`, `.env.example` | MOCK 플래그 Phase 1 값 반영 |
| `backend/src/services/settings.service.ts` | `users` 컬럼 SELECT/UPDATE, `deleteUserSettings`는 메모리만 |
| `backend/src/services/auth.service.ts` | 회원탈퇴 시 `users`만 DELETE (설정 컬럼 동시 삭제) |
| `backend/src/services/knowledge.service.ts` | documents DB 쿼리 제거, actions만 DB + 빈 DB 시 seed INSERT |
| `backend/src/services/issue.service.ts` | 빈 DB 시 mock seed INSERT |
| `backend/src/services/inquiry.service.ts` | 실DB 모드 ID 생성·`replied_at` datetime 형식 보정 (검증 통과용) |

## MOCK 환경 (`backend/.env`)

```
MOCK_SETTINGS=false
MOCK_INQUIRIES=false
MOCK_ISSUES=false
MOCK_KNOWLEDGE=false
MOCK_MAIN=true
MOCK_DASHBOARD=true
MOCK_MANAGEMENT_MAIL=true
MOCK_MANAGEMENT_DEFECT=true
```

- **Auth·Settings·Inquiry·Issue·Knowledge(actions)** → MariaDB `kdt_project`
- **Knowledge(documents/report)·Main·Dashboard·Management** → mock/시드

## Frontend

- API 스키마·타입 변경 없음 (응답 형태 유지)

## 검증 결과 (페이지별)

| 페이지 | 결과 | 비고 |
|--------|------|------|
| **Login** | PASS 5/5 | register, login, profile, check-id, find-id |
| **Setting** | PASS 3/3 | settings GET/PUT (`fontSize=16` DB 반영), profile PUT |
| **Inquiry** | PASS 1/1 | POST /inquiries (실DB `INQ-003`) |
| **Management** | PASS 7/7 | mails, defects, inquiries+reply 교차 (`status=완료`) |
| **Issue** | PASS 3/3 | 8건, handover, PUT assignee |
| **Knowledge** | PASS 8/8 | documents(시드), actions CRUD, report |
| **Main/Dashboard** | PASS 3/3 + SKIP 1 | mock KPI |
| **Frontend** | PASS 1/1 | `/api` → `:3001` 프록시 |

## HeidiSQL 적용 안내

1. `kdt_project` DB 선택
2. `backend/schema.sql` 내용을 참고해 4테이블 생성/갱신
3. 기존 `user_settings`·`knowledge_documents` 테이블은 Phase 1에서 사용하지 않음 (DROP은 사용자 판단)
4. `users`에 설정 컬럼 4개가 없으면 HeidiSQL에서 `ALTER TABLE`로 추가

```sql
-- users 설정 컬럼 예시 (이미 schema.sql에 포함)
ALTER TABLE users
  ADD COLUMN font_size INT NOT NULL DEFAULT 18,
  ADD COLUMN theme_mode TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN language VARCHAR(5) NOT NULL DEFAULT 'ko',
  ADD COLUMN refresh_interval INT NOT NULL DEFAULT 1;
```

## 재실행 방법

```bash
# 터미널 1
cd backend && npm run dev

# 터미널 2
cd frontend && npm run dev

# 터미널 3
node scripts/verify-integration.mjs
```

## 제약 준수

- inquiries ↔ issues 병합 없음
- knowledge documents/actions 단일 테이블 병합 없음
- `apply-schema.mjs`·DROP TABLE·마이그레이션 스크립트 Agent 미실행
- cathode CSV·import_csv.py·Main/Dashboard 실DB 전환 제외

## 결론

4테이블 최소 설계가 backend 코드·MOCK 설정·검증 스크립트 기준으로 반영되었고, Login / Setting / Inquiry / Management(문의) / Issue / Knowledge 영역이 **실DB(또는 actions/issues seed) + mock 혼합**으로 정상 동작함을 확인했습니다.

# 2026-07-23 작업 기록 — Knowledge 페이지 백엔드 연동

## 완료

### Backend
- `knowledge_documents`, `knowledge_actions` 테이블 DDL (`schema.sql`)
- `GET /api/knowledge/documents` — 과거 자료 목록 (manager, date, keyword 필터)
- `GET /api/knowledge/documents/:id` — 문서 상세
- `GET /api/knowledge/actions` — 상황 대처 이력 목록
- `POST /api/knowledge/actions` — 이력 등록
- `PUT /api/knowledge/actions/:id` — 이력 수정
- `DELETE /api/knowledge/actions/:id` — 이력 삭제
- `GET /api/knowledge/report` — AI 데일리 레포트
- `POST /api/knowledge/report/refresh` — 레포트 재갱신
- `MOCK_KNOWLEDGE=true` in-memory fallback

### Frontend
- `knowledgeApi.ts` — 전체 API 클라이언트
- `types/index.ts` — Knowledge 관련 타입
- `knowledge/page.tsx` — API 연동, 로딩/에러 UI
  - 과거 자료 9건 + 필터
  - 상황 대처 CRUD
  - AI 레포트 조회·재생성

## 검증
1. 로그인 후 `/knowledge` 접속
2. 과거 자료 탭 — 9건 + 상세
3. 상황 대처 탭 — 등록/수정/삭제
4. AI 레포트 탭 — 재생성
5. `MOCK_KNOWLEDGE=true`로 DB 없이 동작

## 참고
- 페이지별 1차 백엔드 연동 완료 (Login ~ Knowledge)
- Management 메일·불량률 탭은 선택적 2차 연동

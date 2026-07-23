# 2026-07-23 작업 기록 — Management 페이지 백엔드 연동

## 완료

### Backend
- `inquiries` 테이블 확장: `priority`, `department`, 답변 필드(`reply_*`, `replied_at`)
- `GET /api/inquiries` — 전체 문의 목록 (관리자, JWT)
- `GET /api/inquiries/:id` — 문의 상세
- `PUT /api/inquiries/:id/reply` — 답변 등록 (상태 → `완료`)
- `PATCH /api/inquiries/:id/status` — 상태 변경
- `MOCK_INQUIRIES=true` in-memory fallback 유지

### Frontend
- `managementApi.ts` — 문의 목록·상세·답변·상태 API 클라이언트
- `types/index.ts` — `InquiryReply`, 확장 `Inquiry` 타입
- `management/page.tsx` 문의/답변 탭 API 연동:
  - 마운트·탭 전환 시 문의 목록 로드
  - 답변 등록 → API 호출 후 목록 갱신
  - 메일·불량률 탭은 기존 mock 유지

## API 스펙

### PUT /api/inquiries/:id/reply
```json
{
  "content": "답변 내용",
  "assignee": "담당자명",
  "priority": "보통",
  "internalMemo": "내부 메모",
  "adminConfirmed": true
}
```

### PATCH /api/inquiries/:id/status
```json
{
  "status": "진행중"
}
```

## 검증 흐름
1. 로그인 후 `/inquiry`에서 문의 접수
2. `/management` → 문의/답변 관리 탭에서 목록 확인
3. 문의 선택 → 답변 등록 → 상태 `완료` 반영

## 참고
- `backend/.env`에 `MOCK_INQUIRIES=true` 설정 시 DB 없이 테스트 가능
- MariaDB 사용 시 `schema.sql` 재실행 또는 ALTER로 신규 컬럼 추가 필요
- 메일·불량률 모니터링 API는 추후 연동 예정

## 2차 연동 (2026-07-23-management-phase2-backend.md)
- 메일·불량률 탭 API 연동 완료

## 다음 페이지
- **Main / Dashboard / Issue / Knowledge** — 생산 DB 연동

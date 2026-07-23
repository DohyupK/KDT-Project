# 2026-07-22 작업 기록 — Inquiry 페이지 백엔드 연동

## 완료

### Backend
- `POST /api/inquiries` — 문의 접수 (JWT 필요)
- `GET /api/inquiries/mine` — 내 문의 목록 조회
- `inquiries` 테이블 DDL (`schema.sql` — users, user_settings, inquiries 통합)
- `MOCK_INQUIRIES=true` 시 DB 없이 in-memory fallback

### Frontend
- `inquiryApi.ts` — createInquiry, getMyInquiries
- `inquiry/page.tsx` — API 연동, 로그인 사용자 프로필 표시, console.log 제거
- 미로그인 시 안내 배너 + 제출 버튼 비활성화

## API 스펙

### POST /api/inquiries
```json
{
  "category": "시스템 오류 제보",
  "title": "문의 제목",
  "content": "문의 내용",
  "isPrivate": false,
  "attachments": ["file.png"],
  "authorName": "홍길동",
  "email": "user@example.com",
  "phone": "010-1234-5678"
}
```

## 참고
- 첨부 파일은 **파일명만** 저장 (실제 업로드/storage는 추후)
- Management 페이지 연동 시 `getAllInquiries` API 추가 예정

## 다음 페이지
- **Management** — 문의 목록·답변 API 연동

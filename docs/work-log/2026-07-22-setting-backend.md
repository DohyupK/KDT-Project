# 2026-07-22 작업 기록 — Setting 페이지 백엔드 연동

## 완료

### Backend
- `GET /api/settings` — 사용자 UI 설정 조회 (JWT 필요)
- `PUT /api/settings` — 사용자 UI 설정 저장
- `user_settings` 테이블 DDL (`schema.sql` 추가)
- `MOCK_SETTINGS=true` 시 DB 없이 in-memory fallback

### Frontend
- `settingsApi.ts` — settings API 클라이언트
- `lib/userSettings.ts` — 폰트/테마 적용 유틸 분리
- `setting/page.tsx` 전면 연동:
  - 계정 정보 (성명·아이디 readOnly, 연락처·비밀번호 수정)
  - 회원탈퇴 모달 (`authApi.withdrawAccount`)
  - UI 설정 API 저장 (localStorage 제거)
  - 미로그인 시 안내 배너 + 저장 비활성화

## API 매핑

| 기능 | API |
|------|-----|
| 프로필 조회 | `GET /api/auth/profile` |
| 연락처·비밀번호 수정 | `PUT /api/auth/profile` |
| 회원탈퇴 | `DELETE /api/auth/account` |
| UI 설정 조회/저장 | `GET/PUT /api/settings` |

## 다음 페이지
- **Inquiry** — 문의 접수 API 연동

## 참고
- 계정 API는 MariaDB `users` 테이블 필요
- UI 설정은 `MOCK_SETTINGS=true`로 DB 없이 테스트 가능 (로그인 JWT 필요)

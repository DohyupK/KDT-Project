# 2026-07-23 작업 기록 — 로그인 아이디 찾기·비밀번호 재설정 수정

## 요약

문답지 확정 요구사항 반영: 아이디 찾기 전체 노출, 비밀번호 재설정 시 SMS/임시비밀번호 없이 화면에서 직접 변경.

## 변경 사항

### Backend
- `auth.service.ts`
  - `findUserId`: `maskUserId` 제거 → `user_id` 전체 반환
  - `resetPassword`: `newPassword` 수신·검증 후 bcrypt 해시 저장, `generateTempPassword`/콘솔 출력 제거
  - 응답: `{ message: '비밀번호가 변경되었습니다.' }`
- `auth.controller.ts`: `resetPassword` body에 `newPassword` 필수 검증

### Frontend
- `types/index.ts`: `ResetPasswordRequest`에 `newPassword` 추가
- `login/page.tsx`
  - 비밀번호 재설정 폼: 새 비밀번호·확인 필드, Eye 토글, 회원가입과 동일 규칙 검증
  - 안내 문구: "본인 확인 후 새 비밀번호를 설정해주세요."
  - 성공 시 입력값 초기화 → 로그인 탭 이동 + "비밀번호가 변경되었습니다. 로그인해주세요." 표시

### API 스펙
```json
POST /api/auth/reset-password
{
  "name": "홍길동",
  "phone": "010-1234-5678",
  "userId": "myid",
  "newPassword": "NewPass1!"
}
```

## 수동 테스트 (API)

| # | 시나리오 | 결과 |
|---|----------|------|
| 1 | 회원가입 → find-id | 전체 아이디 반환 (`findreset_test_*`) |
| 2 | reset-password(newPassword) → login | 새 비밀번호로 로그인 성공 |
| 3 | 잘못된 name/phone/userId | 404 "일치하는 회원 정보를 찾을 수 없습니다." |

## 제외 (계획대로)
- SMS/이메일 실발송 API
- 로그인·회원가입·UI 레이아웃 전반 변경

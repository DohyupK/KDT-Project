# 2026-07-22 작업 기록 — Login 백엔드 API 연동

## 완료

### Backend (`backend/`)
- Express + TypeScript 서버 구조 생성 (`src/index.ts`, 포트 3001)
- MariaDB 연결 (`src/db/connection.ts`)
- Auth API 구현:
  - `GET /api/auth/check-id` — 아이디 중복 확인
  - `POST /api/auth/register` — 회원가입
  - `POST /api/auth/login` — 로그인 (JWT)
  - `POST /api/auth/find-id` — 아이디 찾기
  - `POST /api/auth/reset-password` — 비밀번호 재설정 (임시 비밀번호 콘솔 출력)
  - `POST /api/auth/logout` — 로그아웃
  - `GET/PUT /api/auth/profile` — 프로필 조회·수정
  - `DELETE /api/auth/account` — 회원탈퇴
- `schema.sql`, `.env.example` 추가
- bcryptjs + jsonwebtoken 사용

### Frontend (`frontend/`)
- `localStorage` fallback (`kdt-registered-user-ids`) 제거
- `src/lib/authStorage.ts` — JWT·사용자 세션 저장
- `src/api/axios.ts` — Authorization interceptor, 401 redirect
- `src/api/authApi.ts` — Phase 2 API 추가 (profile, withdraw)
- `src/types/index.ts` — 응답 타입 추가
- `src/app/login/page.tsx` — API 연동, 서버 에러 메시지 표시
- `src/components/layout/AppShell.tsx` — 로그인 상태 표시, 로그아웃 메뉴

## 실행 방법

1. MariaDB에서 `backend/schema.sql` 실행
2. `backend/.env.example` → `backend/.env` 복사 후 DB 정보 입력
3. Backend: `cd backend && npm run dev` (포트 3001)
4. Frontend: `cd frontend && npm run dev` (포트 3000)

## 참고
- 비밀번호 재설정 SMS 미연동 — 임시 비밀번호는 백엔드 콘솔에 출력
- MariaDB 미기동 시 auth API는 500 응답

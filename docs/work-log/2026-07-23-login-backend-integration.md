# 2026-07-23 작업 기록 — Login FE·BE·DB 연동 (EX 이식)

## 요약

EX 프로젝트의 로그인(인증) 모듈을 KDT-Project로 **독립 이식**했습니다.  
기존 KDT 컴ponent 기반 로그인 UI는 제거하고, EX 단일 `login/page.tsx` 방식으로 교체했습니다.

## 변경 사항

### Frontend (`frontend/`)

| 항목 | 내용 |
|------|------|
| **제거** | `components/auth/*`, `store/authStore.ts`, `types/auth.ts`, `lib/auth/validation.ts`, `login/layout.tsx`, `login/profile/` |
| **추가** | EX 스타일 `app/login/page.tsx` (로그인·회원가입·ID찾기·비밀번호 재설정) |
| **추가** | `lib/authStorage.ts`, `api/authApi.ts` (mock fallback 없음), `api/axios.ts` (401 redirect) |
| **추가** | `components/layout/UserAuthMenu.tsx` — Main 헤더 로그인/로그아웃 |
| **수정** | `types/index.ts` — Auth 타입 추가 |
| **수정** | `main/page.tsx` — ProfileLink → UserAuthMenu |

### Backend (`backend/`)

| 파일 | 역할 |
|------|------|
| `src/index.ts` | Express 서버 (포트 3001), `/api/health`, `/api/auth` |
| `src/db/connection.ts` | MariaDB pool |
| `src/routes/auth.routes.ts` | Auth 라우트 |
| `src/controllers/auth.controller.ts` | 컨트롤러 |
| `src/services/auth.service.ts` | bcrypt + JWT + users CRUD |
| `src/middleware/auth.middleware.ts` | Bearer JWT 검증 |
| `src/middleware/errorHandler.ts` | AppError |
| `src/utils/validation.ts` | phone/password 검증 |
| `schema.sql` | `users` 테이블 DDL |
| `.env.example` | DB·JWT·CORS 설정 |

### API 스펙

- `GET /api/auth/check-id?userId=`
- `POST /api/auth/register`, `/login`, `/find-id`, `/verify-reset`, `/reset-password`
- `POST /api/auth/logout` (인증)
- `GET/PUT /api/auth/profile` (인증)
- `DELETE /api/auth/account` (인증)

## EX 독립성

- KDT-Project 코드에 `C:\Projects\EX` 경로 참조 **없음**
- EX 폴더 삭제 후에도 KDT만으로 동작 가능

## 실행 방법

```bash
# 1. MariaDB — HeidiSQL에서 kdt_project DB 생성 후 schema.sql 실행

# 2. Backend
cd backend
# .env.example → .env (DB_PASSWORD, JWT_SECRET 설정)
npm run dev

# 3. Frontend
cd frontend
npm run dev
```

## 수동 테스트 체크리스트

- [ ] 회원가입 (아이디 중복 확인)
- [ ] 로그인 → `/main` 이동
- [ ] Main 헤더 사용자명·로그아웃
- [ ] ID 찾기 (전체 아이디 노출)
- [ ] 비밀번호 재설정 (newPassword 직접 입력)
- [ ] Setting 페이지 프로필/탈퇴 (후속 — setting은 아직 localStorage)

## 참고

- `GET /api/health` → `{ status: 'ok' }` 확인됨
- MariaDB 미연결 시 auth API는 500 응답 (`.env` DB 설정 필요)
- GlobalChatbot·ai-service 코드는 변경하지 않음

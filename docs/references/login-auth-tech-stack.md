# 로그인 · Auth · 공용 MariaDB — 기술스택 · 패키지 기록

이 문서는 로그인 페이지 FE/BE 연동과 Lightsail Ubuntu MariaDB 공용 DB 작업에 쓰는 기술·패키지를 정리합니다.  
연동 절차는 [login-ubuntu-mariadb.md](../guides/login-ubuntu-mariadb.md)를 보세요.

## 계층별 역할

| 계층 | 기술 | 역할 |
|------|------|------|
| 프론트엔드 | Next.js (App Router), React | `/login` UI, 회원가입·중복확인·로그인 요청 |
| HTTP 클라이언트 | axios | `frontend/src/api/authApi.ts` → `/api/auth/*` |
| 프록시 | Next.js `rewrites` | 브라우저 `/api` → `http://localhost:3001/api` |
| 백엔드 | Express 5, TypeScript, tsx | `/api/auth` 라우트, 비즈니스 로직 |
| DB 접속 | `mariadb` (npm) | `backend/src/db/connection.ts` 커넥션 풀 |
| DB 서버 | MariaDB (Ubuntu apt) | `kdt_project.users` 영속 저장 |
| 인프라 | Amazon Lightsail Instance | Ubuntu 서버 상시 기동 (공용 DB 위치) |
| 비밀번호 해시 | bcryptjs | 회원가입·로그인 검증 |
| 세션 토큰 | jsonwebtoken (JWT) | 로그인 후 인증 |
| 설정 | dotenv + `.env` | `DB_HOST`, `DB_USER`, `JWT_SECRET` 등 (Git 제외) |

## 프론트엔드 패키지 (`frontend/package.json`)

| 패키지 | 용도 (로그인 관련) |
|--------|-------------------|
| `next` | 앱 라우터, 개발 서버, API rewrite |
| `react` / `react-dom` | UI |
| `axios` | auth API 호출 |
| `typescript` | 타입 |

주요 경로:

- `frontend/src/app/login/page.tsx`
- `frontend/src/api/authApi.ts`
- `frontend/src/api/axios.ts`
- `frontend/src/lib/authStorage.ts`

## 백엔드 패키지 (`backend/package.json`)

| 패키지 | 용도 |
|--------|------|
| `express` | HTTP API |
| `mariadb` | MariaDB/MySQL 프로토콜 클라이언트 |
| `bcryptjs` | 비밀번호 해시·비교 |
| `jsonwebtoken` | JWT 발급·검증 |
| `dotenv` | `.env` 로드 |
| `cors` | `CORS_ORIGIN` (localhost:3000) |
| `tsx` | TypeScript 개발 실행 |

주요 경로:

- `backend/src/routes/auth.routes.ts`
- `backend/src/controllers/auth.controller.ts`
- `backend/src/services/auth.service.ts`
- `backend/src/db/connection.ts`
- `backend/schema.sql` (`users` 테이블)

## Auth API (요약)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/auth/check-id` | 아이디 중복 확인 |
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/login` | 로그인 |
| POST | `/api/auth/find-id` | 아이디 찾기 |
| POST | `/api/auth/verify-reset` | 비밀번호 재설정 신원 확인 |
| POST | `/api/auth/reset-password` | 비밀번호 재설정 |
| GET/PUT | `/api/auth/profile` | 프로필 (인증 필요) |
| DELETE | `/api/auth/account` | 회원 탈퇴 |

## 인프라 · 운영 도구

| 도구 | 용도 |
|------|------|
| Amazon Lightsail | Ubuntu 인스턴스 (DB 서버) |
| Lightsail 브라우저 SSH | 서버 접속·MariaDB 설치·SQL |
| `mysql` / MariaDB CLI | SSH 안 또는 PC에서 원격 접속 |
| HeidiSQL 등 (선택) | GUI로 원격 DB 조회 (필수는 아님) |
| GitHub | **코드만** 공유 (`.env` 금지) |

## 환경 변수 (`backend/.env`)

| 변수 | 의미 |
|------|------|
| `DB_HOST` | Ubuntu 공인 IP (로컬만 쓸 때는 `127.0.0.1`) |
| `DB_PORT` | 기본 `3306` |
| `DB_USER` / `DB_PASSWORD` | 앱 DB 계정 (예: `kdt`) |
| `DB_NAME` | `kdt_project` |
| `JWT_SECRET` | JWT 서명 비밀 |
| `CORS_ORIGIN` | 프론트 origin (`http://localhost:3000`) |
| `CHAT_STORE` | 챗 세션 저장 (`sqlite` / `mariadb` / `memory`) — 로그인 `users`와는 별 설정 |

템플릿: `backend/.env.example` (비밀번호 비움).

## 용어 정리

| 말 | 의미 |
|----|------|
| MariaDB 서버 | Ubuntu에 설치한 DB 엔진 |
| `mariadb` npm | Node가 DB에 붙는 **클라이언트** 라이브러리 (MySQL과도 호환) |
| Lightsail Create database | 관리형 MySQL/PostgreSQL 상품 — 이 가이드의 Ubuntu+MariaDB 방식과 **다름** |

## 로컬 실행 · 패키지 설치

백엔드 로그인(auth)은 아래 npm 패키지가 **`node_modules`에 실제로 설치**되어 있어야 합니다.

| 패키지 | 역할 | 미설치 시 |
|--------|------|-----------|
| `bcryptjs` | 비밀번호 해시 | `ERR_MODULE_NOT_FOUND: Cannot find package 'bcryptjs'` |
| `jsonwebtoken` | JWT | 동일 계열 모듈 오류 |
| `mariadb` | DB 접속 | DB 관련 모듈 오류 |
| `express`, `dotenv`, `cors`, `tsx` | 서버 기동 | 기동 실패 |

`package.json`에만 있고 `npm install`을 안 한 경우(예: auth 커밋 pull 직후) 위 오류가 납니다.

```powershell
cd C:\Projects\KDT-Project\backend
npm install
npm run dev
```

성공 시: `[backend] listening on http://127.0.0.1:3001`

조원도 Git pull 후 **backend에서 `npm install` 한 번** 실행할 것.

## 변경 기록

| 날짜 | 내용 |
|------|------|
| 2026-07-28 | 초안. 로그인 공용 Ubuntu MariaDB 연동에 쓰는 스택·패키지 정리. |
| 2026-07-28 | `bcryptjs` 미설치(`ERR_MODULE_NOT_FOUND`) 원인·`npm install` 절차 기록. backend에 의존성 재설치 완료. |
| 2026-07-28 | User 작명: 로그인 영속 테이블 `users`, 로그인 식별자 컬럼 `user_id` (`backend/schema.sql`). 설정·대화용 신규 테이블은 이번 범위 밖. |
| 2026-07-28 | 테마: Setting이 저장한 `kdt-user-settings` / `system_settings_config`(localStorage)를 `/login`·`UserAuthMenu`가 `readStoredUiSettings`·`useUiSettings`로 반영. 다크(0)/라이트(1). |
| 2026-07-28 | FE 패키지: `next` / `eslint-config-next` **16.2.12**. `allowScripts`: frontend `sharp`·`unrs-resolver`, backend `esbuild`. |
| 2026-07-28 | AWS Lightsail MariaDB 연동: 로컬 `backend/.env`의 `DB_HOST` 등 (Git 제외). 절차는 `docs/guides/login-ubuntu-mariadb.md`. |
| 2026-07-28 | `backend/src/db/connection.ts` 커넥션 풀을 lazy 초기화로 변경 — `dotenv` 로드 후 `DB_*` 반영 (ESM import 순서 이슈 방지). |

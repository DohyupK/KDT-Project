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
| DB 서버 | MariaDB (Ubuntu apt) | `users`, `user_settings`, `chat_*`, `optimization_events` 등 |
| 인프라 | Amazon Lightsail Instance | Ubuntu 상시 기동. **16GB(`my-server-16gb`)**: 앱+DB. vLLM은 이 PC GPU 터널 |
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
- `frontend/src/lib/authStorage.ts` (`kdt-auth-token` / `kdt-auth-user`, `AUTH_CHANGED_EVENT`)
- `frontend/src/components/layout/UserAuthMenu.tsx` — 헤더 프로필 · 로그아웃
- `frontend/src/components/layout/PersonalInfoModal.tsx` — **내 정보 팝업** (이메일·연락처·비밀번호)
- `frontend/src/app/(shell)/setting/page.tsx` — 시스템 설정만 (개인정보 UI 없음)

### 내 정보 UX (고정)

| 항목 | 내용 |
|------|------|
| 진입 | 헤더 프로필 → 「내 정보」 |
| UI | 모달 팝업 (`PersonalInfoModal`). `/setting`으로 이동하지 않음 |
| API | `GET/PUT /api/auth/profile` |
| 편집 | 이메일·연락처·비밀번호 / 아이디·성명 읽기 전용 |
| 설정 페이지 | 폰트·테마·새로고침·알림·LLM 키. 공정 한계치는 API만 (`/api/settings/control-bounds`) |

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
- `DB/schema.sql` (`users` 테이블)

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
| Amazon Lightsail | Ubuntu. 16GB는 앱 서버, 구 2GB는 이관 전 DB/Grafana일 수 있음 |
| Lightsail 브라우저 SSH | 서버 접속·MariaDB 설치·SQL |
| `mysql` / MariaDB CLI | SSH 안 또는 PC에서 원격 접속 |
| HeidiSQL 등 (선택) | GUI로 원격 DB 조회 (필수는 아님) |
| GitHub | **코드만** 공유 (`.env` 금지) |

## 환경 변수 (모노레포 루트 `.env`)

| 변수 | 의미 |
|------|------|
| `DB_HOST` | 서버 안 앱: `127.0.0.1`. 이 PC→원격 DB: Ubuntu 공인 IP |
| `DB_PORT` | 기본 `3306` |
| `DB_USER` / `DB_PASSWORD` | 앱 DB 계정 (예: `kdt`) |
| `DB_NAME` | `kdt_project` |
| `JWT_SECRET` | JWT 서명 비밀 |
| `CORS_ORIGIN` | 프론트 origin (`http://localhost:3000`) |
| `CHAT_STORE` | 챗·제어 저장 (`mariadb` 권장 / `sqlite` / `memory`) — 로그인 `users`와 같은 `DB_*` |
| `LLM_KEYS_ENCRYPTION_KEY` | LLM API 키 AES-GCM 마스터(16자+, Git 금지). 암호문은 `DB/data/llm_keys.sqlite` |

키 목록 안내는 [`docs/references/LLM 튜닝.md`](./LLM%20튜닝.md) §4 · 본 문서. 패키지별 `.env.example` 없음.

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
cd backend
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
| 2026-07-28 | User 작명: 로그인 영속 테이블 `users`, 로그인 식별자 컬럼 `user_id` (`DB/schema.sql`). |

| 2026-07-28 | 테마: Setting이 저장한 `kdt-user-settings` / `system_settings_config`(localStorage)를 `/login`·`UserAuthMenu`가 `readStoredUiSettings`·`useUiSettings`로 반영. 다크(0)/라이트(1). |
| 2026-07-28 | FE 패키지: `next` / `eslint-config-next` **16.2.12**. `allowScripts`: frontend `sharp`·`unrs-resolver`, backend `esbuild`. |
| 2026-07-28 | AWS Lightsail MariaDB 연동: 로컬 루트 `.env`의 `DB_HOST` 등 (Git 제외). 절차는 `docs/guides/login-ubuntu-mariadb.md`. |
| 2026-07-28 | `backend/src/db/connection.ts` 커넥션 풀을 lazy 초기화로 변경 — `dotenv` 로드 후 `DB_*` 반영 (ESM import 순서 이슈 방지). |
| 2026-07-29 | Setting 개인 설정: 테이블 `user_settings` · API `GET\|PUT /api/auth/settings`, `POST /api/auth/settings/reset` (JWT). 공정 한계치는 기존 `GET\|PUT /api/settings/control-bounds` + `control_bounds.json` 유지. |
| 2026-07-31 | 「내 정보」를 설정 페이지 섹션에서 분리 → 헤더 프로필 모달(`PersonalInfoModal`). 설정 페이지는 시스템 환경만. 규칙: `.cursor/rules/kdt-project.mdc`. |
| 2026-08-13 | 헤더 알림 팝오버 「이메일 자동 발신」 토글. `GET\|PUT /api/auth/settings`의 `emailCheck` ↔ `user_settings.email_check` (`O`/`X`, 로그인 계정만 UPDATE). |
| 2026-08-14 | 16GB 앱 서버 + 로컬 GPU 터널. `DB_HOST`는 같은 기계면 127.0.0.1. Grafana는 `NEXT_PUBLIC_GRAFANA_HOST`. 절차 [`aws-lightsail-gpu-tunnel.md`](../guides/aws-lightsail-gpu-tunnel.md). |
| 2026-08-18 | `USER_SETTINGS.manage` (`O`/`X`, 기본 X). DB에서만 지정. 라이브러리 메뉴·비공개 문의·이슈 담당자 목록. PUT `/api/auth/settings`는 `manage`를 쓰지 않음. |

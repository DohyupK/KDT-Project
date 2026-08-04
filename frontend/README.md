# Frontend — 화면(UI) 패키지

이 폴더는 **웹 화면**만 담당합니다. (Next.js App Router)

| 보고 싶은 것 | 파일 |
|--------------|------|
| 저장소 전체 지도 · 실행 · **기술 스택** | [`../README.md`](../README.md) |
| 지금 프로젝트 방향 | [`../docs/direction.md`](../docs/direction.md) |
| 날짜별 작업 기록 | [`../docs/work-log/`](../docs/work-log/) |
| AI용 FE 추가 규칙 | [`AGENTS.md`](./AGENTS.md) |

---

## 한 줄 역할

양극재 품질 AI 예측 시스템의 **브라우저 UI** — LOT·품질·관리·설정·챗봇·로그인.

---

## 기능 요약

| 기능 | 경로 / 진입 | 비고 |
|------|-------------|------|
| Main | `/main` | LOT·요약 홈 |
| Dashboard | `/dashboard` | 차트·지표 |
| Management | `/management` | 제어·한계치·승인 흐름 |
| Setting | `/setting` | **시스템 환경만** (폰트·테마·새로고침·알림·제어 한계치) |
| Issue | `/issue` | 이슈 목록·상세·조치 |
| Knowledge | `/knowledge` | 지식/문서 UI |
| Inquiry | `/inquiry` | 문의 목록·접수·답변 |
| Login | `/login` | 로그인·회원가입 등 auth UI |
| 보안 챗 | `/security` · Maximize | 전체화면 보안 오버레이 · SSE |
| 일반 챗 | AppShell → `GlobalChatbot` | 우하단 플로팅 · `POST /api/chat` |
| 내 정보 | 헤더 프로필 → 모달 | `PersonalInfoModal` · `/setting#personal`로 가지 않음 |

---

## 세부 설계

### 라우팅 · 레이아웃

- App Router: `src/app/(shell)/` — 공통 `AppShell`(사이드바·헤더). Login·`/security`는 셸 밖.
- `/` → `/main` 리다이렉트.
- 페이지 ↔ API 모듈 분리: `src/app/**/page.tsx` · `src/api/*Api.ts` · `src/types`.

### 프록시 · 연동

- `next.config.ts` rewrite: `/api/*` → `http://localhost:3001`, `/ai/*` → `http://127.0.0.1:8800`
- 일반 챗: `src/api/aiApi.ts` 등 → backend → ai-service
- Auth 프로필: `GET/PUT /api/auth/profile` · 저장 후 `saveAuthSession` + `AUTH_CHANGED_EVENT`
- `AppData.fillThreshold` 필드명·의미 변경 금지

### 설정 vs 개인정보

- `/setting` = 시스템 환경만
- 「내 정보」= `PersonalInfoModal` (이메일·연락처·비밀번호 편집, 아이디·성명 읽기 전용)

### 폴더 구조

```
frontend/
├── src/
│   ├── app/
│   │   ├── (shell)/       # AppShell (사이드바·헤더)
│   │   ├── login/
│   │   ├── security/
│   │   └── page.tsx       # / → /main
│   ├── components/        # layout · chat · …
│   ├── api/
│   ├── data/
│   ├── types/
│   └── assets/
├── AGENTS.md
└── package.json
```

| 주소 | 파일 |
|------|------|
| `/` | `src/app/page.tsx` → `/main` |
| `/main` | `src/app/(shell)/main/page.tsx` |
| `/dashboard` | `src/app/(shell)/dashboard/page.tsx` |
| `/login` | `src/app/login/page.tsx` |
| `/issue` | `src/app/(shell)/issue/page.tsx` |
| `/inquiry` | `src/app/(shell)/inquiry/page.tsx` |
| `/knowledge` | `src/app/(shell)/knowledge/page.tsx` |
| `/management` | `src/app/(shell)/management/page.tsx` |
| `/setting` | `src/app/(shell)/setting/page.tsx` |
| `/security` | 보안 챗 전체화면 |

---

## 실행 방법

**권장:** 저장소 루트에서 `npm run dev`  
→ [로컬 실행 — 챗봇](../README.md#로컬-실행--챗봇) (frontend + backend + ai-service)

UI만 단독:

```bash
cd frontend
npm install
npm run dev
```

브라우저: [http://localhost:3000](http://localhost:3000)

| 명령 | 설명 |
|------|------|
| `npm run dev` | 개발 서버 (이 패키지만) |
| `npm run build` | 프로덕션 빌드 |
| `npm run lint` | 린트 |

챗봇·로그인·이슈 등 API 연동은 backend(:3001) · ai-service(:8800)가 필요합니다.

---

## 기술 스택

모노레포 스택 SSOT: [루트 README — 기술 스택](../README.md#기술-스택-모노레포)

---

## 진행 상황 · 다음에 할 일

- [x] Next.js + 페이지 라우트 · AppShell
- [x] Main / Dashboard / Management / Setting / Issue / Knowledge / Inquiry UI
- [x] 전역 챗봇 · `/api`·`/ai` rewrite · 보안 탭
- [x] Login · auth API 연동 · 내 정보 모달
- [ ] LOT → chat features 자동 주입 고도화

---

## 개발 기록

상세는 루트 일지(README에는 링크만).

- [2026-07-15 프로젝트 생성 및 초기 구성](../docs/work-log/2026-07-15.md)
- [2026-07-21 React(Vite) → Next.js 마이그레이션](../docs/work-log/2026-07-21.md)
- [2026-07-22 docs·룰·스킬·README/AGENTS 정리](../docs/work-log/2026-07-22.md)
- [2026-07-23 ai-service ML·챗봇 연동·LLM·시나리오 스모크](../docs/work-log/2026-07-23.md)
- [2026-07-24 API키·LLM·LOT·What-if·한계치·Undo·보안vLLM](../docs/work-log/2026-07-24.md)
- [2026-07-31 Documents·Prisma·멀티턴 B](../docs/work-log/2026-07-31.md)

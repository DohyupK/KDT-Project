# Frontend — 화면(UI) 패키지

이 폴더는 **웹 화면만** 담당합니다. (Next.js App Router)

저장소 전체(서버·AI·문서·AI 규칙 구조)를 보려면 위로 돌아가세요.

| 보고 싶은 것 | 파일 |
|--------------|------|
| 저장소 전체 지도 | [`../README.md`](../README.md) |
| 지금 프로젝트 방향 | [`../docs/direction.md`](../docs/direction.md) |
| 날짜별 작업 기록 | [`../docs/work-log/`](../docs/work-log/) |
| AI용 FE 추가 규칙 | [`AGENTS.md`](./AGENTS.md) |

---

## 이 패키지가 하는 일

양극재 품질 AI 예측 시스템의 **프론트엔드**입니다.  
사용자는 브라우저에서 LOT·품질·관리·설정 화면을 사용합니다.

이미 화면이 있는 페이지: **Main**, **Management**, **Setting**  
이름만 있는 페이지: Dashboard, Login, Issue, Knowledge, Inquiry

---

## 실행 방법

Node.js LTS 권장.

```bash
npm install
npm run dev
```

브라우저: [http://localhost:3000](http://localhost:3000)

| 명령 | 설명 |
|------|------|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run lint` | 린트 |

---

## 기술 스택

- Next.js (App Router)
- React, TypeScript
- Tailwind CSS
- Zustand, Axios, Recharts, Lucide React, Day.js

서버(API)는 루트의 `backend/`에서 다룰 예정이며, 개발 중에는 `next.config.ts`의 `/api` 프록시를 사용합니다.

---

## 폴더 구조 (frontend 안)

```
frontend/
├── src/
│   ├── app/           # 주소별 페이지 (/, /management, /setting …)
│   ├── api/           # 백엔드 호출용 모듈
│   ├── data/          # 가상·정적 데이터
│   ├── types/         # 공통 타입 (fillThreshold 등)
│   └── assets/        # 이미지 등
├── docs/              # 안내만 (본문 기록은 루트 ../docs/)
├── AGENTS.md          # FE용 AI 규칙 (짧게)
└── package.json
```

주요 주소:

| 주소 | 파일 |
|------|------|
| `/` | `src/app/page.tsx` |
| `/dashboard` | `src/app/dashboard/page.tsx` |
| `/login` | `src/app/login/page.tsx` |
| `/issue` | `src/app/issue/page.tsx` |
| `/inquiry` | `src/app/inquiry/page.tsx` |
| `/knowledge` | `src/app/knowledge/page.tsx` |
| `/management` | `src/app/management/page.tsx` |
| `/setting` | `src/app/setting/page.tsx` |

---

## 진행 상황

- [x] Next.js + TypeScript 구성
- [x] 8개 페이지 라우트 연결
- [x] API · 타입 · 데이터 뼈대
- [x] Main / Management / Setting UI
- [ ] Dashboard / Login / Issue / Knowledge / Inquiry UI
- [ ] 공통 레이아웃(사이드바·헤더) 정리
- [ ] backend API 연동

---

## 사용할 라이브러리 (참고)

**Dependencies:** axios, zustand, recharts, lucide-react, dayjs  

**DevDependencies:** tailwindcss, @tailwindcss/postcss, eslint, eslint-config-next, typescript  

(`next` / `react`는 프레임워크로 기술 스택에만 표기)

---

## 개발 기록

상세는 루트 일지를 봅니다. (README에는 링크만)

- [2026-07-15 프로젝트 생성 및 초기 구성](../docs/work-log/2026-07-15.md)
- [2026-07-21 React(Vite) → Next.js 마이그레이션](../docs/work-log/2026-07-21.md)
- [2026-07-22 docs·룰·스킬·README/AGENTS 정리](../docs/work-log/2026-07-22.md)

---

## 다음에 할 일 (Frontend)

- DashboardPage, LoginPage, IssuePage, KnowledgePage, InquiryPage UI
- 공통 Layout 추출
- Express backend 연동

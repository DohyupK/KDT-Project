# 양극재 품질 AI 예측 시스템

## 프로젝트 소개

양극재 품질 AI 예측 시스템의 프론트엔드 프로젝트입니다.

현재 React + TypeScript 기반으로 프로젝트 구조를 구성하고 있으며,
MainPage를 시작으로 화면 레이아웃 및 기능을 순차적으로 구현할 예정입니다.

---

## 기술 스택

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- Axios
- React Router DOM
- Recharts
- Lucide React
- Day.js

### Backend (예정)

- Express
- MariaDB

---

## 개발 환경

### Node.js

Node.js LTS 버전 사용

### 패키지 설치

```bash
npm install
```

### 개발 서버 실행

```bash
npm run dev
```

기본 개발 서버 주소

```
http://localhost:5173
```

---

## 현재 프로젝트 진행 상황

- [x] React + TypeScript(Vite) 프로젝트 생성
- [x] 기본 라이브러리 설치
- [x] 프로젝트 디렉토리 구조 생성
- [x] 8개 페이지 및 라우팅 뼈대 생성
- [x] API, 타입, 가상 데이터 뼈대 생성
- [x] Cursor 및 Codex 규칙·스킬 뼈대 생성
- [ ] MainPage 레이아웃 구현

---

## 설치된 라이브러리

### Dependencies

- axios
- zustand
- react-router-dom
- recharts
- lucide-react
- dayjs

### DevDependencies

- tailwindcss
- @tailwindcss/vite
- eslint
- prettier
- eslint-config-prettier
- eslint-plugin-prettier

---

## 프로젝트 구조

```
KDT-Project/
├── .agents/skills/       # Codex용 프로젝트/API 스킬
├── .cursor/
│   ├── rules/            # Cursor용 프로젝트/API 규칙
│   └── skills/           # Cursor용 프로젝트/API 스킬
├── docs/work-log/        # 날짜별 작업 기록
├── src/
│   ├── api/              # Express 백엔드 통신 모듈
│   ├── components/       # 재사용 UI 요소
│   ├── data/             # 가상 데이터
│   ├── pages/            # 8개 독립 페이지
│   ├── types/            # 공통 데이터 타입
│   └── App.tsx           # 페이지 라우팅
└── AGENTS.md             # Cursor·Codex 공통 프로젝트 규칙
```

※ 현재는 구조와 최소 뼈대만 구성되어 있으며 실제 UI와 API 로직은 구현 전입니다.

---

## 개발 기록

- [2026-07-15 프로젝트 생성 및 초기 구성](docs/work-log/2026-07-15.md)
  - 프로젝트와 라이브러리 초기 구성
  - 8개 페이지, 라우팅, API, 타입 및 데이터 뼈대 생성
  - Cursor와 Codex용 프로젝트 규칙 및 스킬 구조 생성
  - TypeScript 빌드 및 린트 검증 완료

---

## 개발 목표

- MainPage 구현
- DashboardPage 구현
- LoginPage 구현
- IssuePage 구현
- KnowledgePage 구현
- InquiryPage 구현
- ManagementPage 구현
- SettingPage 구현
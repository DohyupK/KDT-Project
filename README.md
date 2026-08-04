# 양극재 품질 AI 예측 시스템

[![Stack](https://img.shields.io/badge/monorepo-frontend%20%7C%20backend%20%7C%20ai--service-0B5FFF)](#이-저장소에-무엇이-있나)
[![Docs](https://img.shields.io/badge/docs-direction%20%2B%20work--log-2ea44f)](./docs/direction.md)

양극재 공정 **O/X · 용량 · 잔여 Li** 예측과 **일반/보안 챗봇**을 한 저장소에서 돌리는 모노레포입니다.  
화면(UI) · 서버(API) · AI 서비스를 폴더로 나눕니다.

---

## 처음 오셨다면 (5분 가이드)

| 순서 | 할 일 | 바로가기 |
|------|--------|----------|
| 1 | 지금 무엇을 만들고 있는지 | [`docs/direction.md`](./docs/direction.md) |
| 2 | 화면만 돌려보기 | [화면 실행](#화면-실행-frontend) · 기능·설계 [`frontend/README.md`](./frontend/README.md) |
| 3 | **챗봇까지** 실연동 | 루트에서 [`npm run dev`](#권장--한-번에-기동) ([로컬 실행 — 챗봇](#로컬-실행--챗봇)) |
| 4 | 보안 탭 · secure RAG | [`docs/references/secure-rag.md`](./docs/references/secure-rag.md) |
| 5 | (선택) 문서·AI 규칙 구조 | [문서와 AI 규칙](#문서와-ai-규칙-어떻게-나뉘나) |

**사람용 설명** → 이 README · `docs/`  
**AI용 짧은 규칙** → [`AGENTS.md`](./AGENTS.md)

---

## 이 저장소에 무엇이 있나

| 폴더 / 파일 | 하는 일 | 기능·설계 |
|-------------|---------|-----------|
| [`frontend/`](./frontend/) | UI · AppShell · GlobalChatbot · `/security` | [`frontend/README.md`](./frontend/README.md) |
| [`backend/`](./backend/) | Express API · 세션 · 게이트 · LLM 키 · 프록시 | [`backend/README.md`](./backend/README.md) |
| [`ai-service/`](./ai-service/) | FastAPI · predict · LangGraph · secure RAG | [`ai-service/README.md`](./ai-service/README.md) |
| [`docs/`](./docs/) | 방향 · 일지 · 계획 · 스키마 참조 | [일지](./docs/work-log/2026-08-02.md) |
| [`AGENTS.md`](./AGENTS.md) | AI 공통 bullet | — |

```text
KDT-Project/
├── package.json   ← 루트 npm run dev (3서비스)
├── docs/          ← 사람·팀 “전체” 문서
├── frontend/      ← 화면 (:3000)
├── backend/       ← 서버 (:3001)
├── ai-service/    ← AI (:8800)
├── AGENTS.md
├── .cursor/       ← Cursor 룰·스킬
└── .agents/       ← 에이전트 스킬
```

### 제품 한눈에

| 채널 | 경로 | 비고 |
|------|------|------|
| 일반 챗 | 우하단 GlobalChatbot → `POST /api/chat` | Groq/Gemini 등 **등록 키** · predict 헤드(clf·용량·잔여 Li) · what-if |
| 보안 챗 | Maximize 또는 `/security` → `POST /api/security-chat/stream` (SSE) · JSON `/api/security-chat` 병행 | **클라우드 폴백 없음** · 로컬 LLM(`:8001`) + Qdrant RAG · 기본은 문서 발췌(`SECURE_GENERATE=0`) |
| 진단 API | ai-service `/predict`, `/predict-capacity`, `/predict-residual` | 학습 산출물 `ai-service/models/` |

---

## 화면 실행 (frontend)

```bash
cd frontend
npm install
npm run dev
```

브라우저: [http://localhost:3000](http://localhost:3000)

페이지·기능·설계는 **[`frontend/README.md`](./frontend/README.md)**. 기술 스택은 아래 [모노레포 스택](#기술-스택-모노레포).

---

## 로컬 실행 — 챗봇

실연동은 **frontend · backend · ai-service** 를 켭니다.  
보안 RAG까지 쓰려면 **Qdrant(:6333)** 와 (요약 LLM 사용 시) **LM Studio / vLLM(:8001)** 도 필요합니다.

| 패키지 | 포트 | 역할 |
|--------|------|------|
| `ai-service/` | **8800** | FastAPI · predict · chat · security-chat |
| `backend/` | **3001** | Express · 세션 · 게이트 · 프록시 |
| `frontend/` | **3000** | Next.js · GlobalChatbot · 보안 오버레이 |
| (선택) Qdrant | **6333** | secure RAG 벡터 인덱스 |
| (선택) LM Studio 등 | **8001** | 보안 탭 OpenAI 호환 LLM |

### 0) DB (최초)

채팅 세션 기본은 **sqlite** (`CHAT_STORE=sqlite`)라 MariaDB 없이도 챗은 됩니다.  
MariaDB를 쓸 때만:

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS kdt CHARACTER SET utf8mb4;"
mysql -u root -p kdt < DB/chat_schema.sql
```

모노레포 루트 `.env`에 필요한 값 설정 (패키지별 `.env.example` 없음).  
**API 키·시크릿은 커밋하지 마세요.**

### 권장 — 한 번에 기동

최초 1회(패키지별 의존성 + 루트 orchestrator):

```bash
cd frontend && npm install
cd ../backend && npm install
cd ../ai-service && pip install -r requirements.txt
cd .. && npm install
```

이후 매번 저장소 루트에서:

```bash
npm run dev
```

`concurrently`가 ai-service(:8800) · backend(:3001) · frontend(:3000)를 함께 띄웁니다.  
UI: [http://localhost:3000](http://localhost:3000) · backend health: [http://127.0.0.1:3001/api/health](http://127.0.0.1:3001/api/health) · ai health: [http://127.0.0.1:8800/health](http://127.0.0.1:8800/health)

| 루트 명령 | 설명 |
|-----------|------|
| `npm run dev` | ai + backend + frontend 동시 (`concurrently -k`) |
| `npm run dev:ai` | ai-service만 (`python -m uvicorn` · CWD=`ai-service/`) |
| `npm run dev:backend` | backend만 (`npm --prefix backend run dev`) |
| `npm run dev:frontend` | frontend만 (`npm --prefix frontend run dev`) |

### 개별 기동 (선택)

패키지별로 따로 켤 때만:

```bash
# ai-service — CWD는 항상 ai-service/ (models/ 상대 경로)
cd ai-service
# 루트 .env: CHAT_USE_LLM=1 · CHAT_VLLM_* (보안) · SECURE_* (RAG)
# 보안 문서 인덱싱(승인 후): python ingest_secure.py
python -m uvicorn app.main:app --host 127.0.0.1 --port 8800

# backend
cd backend && npm run dev

# frontend
cd frontend && npm run dev
```

rewrite 변경 후 Next를 **한 번 재시작**합니다.

### 요청 흐름

**일반 챗**

```text
브라우저 :3000
  → POST /api/chat  (Next rewrite → backend :3001)
  → 보안 키워드? → security_redirect
  → 아니면 ai-service :8800/chat
  → LangGraph predict + LLM(등록 키) 또는 template
```

**보안 챗**

```text
Maximize / /security
  → POST /api/security-chat/stream → :8800/security-chat/stream (SSE)
  → (스모크) POST /api/security-chat → :8800/security-chat (JSON)
  → RAG (Qdrant + BM25 + RRF + CPU rerank)
  → SECURE_GENERATE=0 → 문서 발췌 + [출처:]
     또는 =1 → 로컬 LLM(:8001) 요약 (느리면 extractive 폴백)
```

| 항목 | 경로 |
|------|------|
| 일반 UI | `frontend/src/components/chat/GlobalChatbot.tsx` |
| 보안 UI | `frontend/src/components/chat/SecurityChatbot.tsx` |
| rewrite | `frontend/next.config.ts` — `/api`→`:3001`, `/ai`→`:8800` |
| 보안 RAG | [`docs/references/secure-rag.md`](./docs/references/secure-rag.md) |
| LLM·RAG 튜닝 총정리 | [`docs/references/LLM 튜닝.md`](./docs/references/LLM%20튜닝.md) |
| 챗봇 가이드 | [`docs/references/security-chatbot-guide.md`](./docs/references/security-chatbot-guide.md) |
| 스모크 | `cd ai-service && python scripts/smoke_secure_rag_e2e.py` |

우하단 챗봇 → 「샘플 LOT 진단」으로 predict 연동을 확인할 수 있습니다.

---

## 기술 스택 (모노레포)

**기술 스택의의 단일 출처(SSOT)는 이 섹션입니다.**  
기능·세부 설계·실행 절차는 각 패키지 README에 둡니다.  
**새 의존성 설치 시 이 목록을 반드시 갱신**합니다. (`.cursor/rules/ask-before-run.mdc`)

### root (dev orchestrator)
- concurrently — `npm run dev`로 frontend · backend · ai-service 동시 기동

### frontend
- **런타임:** Next.js (App Router), React, React DOM, TypeScript  
- **UI·상태:** Tailwind CSS, Zustand, Lucide React, Recharts, Day.js  
- **HTTP·데이터:** Axios, Prisma (`@prisma/client`) — MariaDB `user_chat_*` 참조  
- **개발:** ESLint, eslint-config-next, prisma CLI, `@tailwindcss/postcss`, `@types/*`  
→ 기능·설계: [`frontend/README.md`](./frontend/README.md)

### backend
- **런타임:** Express 5, TypeScript (tsx), Node  
- **인프라:** MariaDB connector, CORS, dotenv · 채팅/제어는 sqlite 병행 가능 (`CHAT_STORE`)  
- **Auth:** bcryptjs, jsonwebtoken  
- **개발:** typescript, tsx, `@types/express` 등  
→ 기능·설계: [`backend/README.md`](./backend/README.md)

### ai-service
- Python 3.11+, Polars, NumPy, scikit-learn, XGBoost, CatBoost, Optuna, SHAP, joblib, openpyxl  
- FastAPI, Uvicorn, Pydantic · LangGraph / LangChain  
- Secure RAG: qdrant-client, sentence-transformers, rank-bm25, torch, llama-index-core, llama-index-llms-openai, llama-index-vector-stores-qdrant, pypdf, openpyxl, watchdog, SQLAlchemy, PyMySQL  
  (bge-m3 / bge-reranker **CPU** · soft fallback · `FOLLOWUP_RE` · SSE `/security-chat/stream` · analytics `csv_lake`)  
→ [`ai-service/README.md`](./ai-service/README.md)

---

## AI 서비스 실행 (ai-service)

단독 기동·엔드포인트·학습 설계는 **[`ai-service/README.md`](./ai-service/README.md)**.  
전체 실연동은 위 [권장 — 한 번에 기동](#권장--한-번에-기동).

| 엔드포인트 | 설명 |
|------------|------|
| `GET /health` | 상태 · `registry_ready` 헤드 |
| `POST /predict` | O/X (clf) |
| `POST /predict-capacity` | 용량 (reg) |
| `POST /predict-residual` | 잔여 Li |
| `POST /chat` | 일반 LangGraph 챗 (backend 프록시) |
| `POST /security-chat` | 보안 · RAG (+ 선택 로컬 LLM) JSON |
| `POST /security-chat/stream` | 보안 · SSE (`meta`/`delta`/`replace`/`done`/`error`) |

---

## 문서와 AI 규칙, 어떻게 나뉘나

| 구분 | 누구 | 위치 | 무엇을 |
|------|------|------|--------|
| **루트 README** | 사람 | `/README.md` | 지도 · 실행 · **모노레포 기술 스택** |
| **루트 AGENTS** | AI | `/AGENTS.md` | 전 패키지 **짧은** 규칙 |
| **패키지 README** | 사람 | `frontend/` · `backend/` · `ai-service/` | 기능 · 세부 설계 · 실행 |
| **docs/** | 사람 (+ AI가 방향 확인) | `/docs/` | 방향 · 일지 · 계획 · 스키마 |

- **README** = 설명서  
- **AGENTS** = AI 수칙 (짧게)  
- **docs** = 업무 방향·일지 (상세)

---

## AI 룰·스킬이 실제로 어떻게 도나

```mermaid
flowchart TD
  start[작업 시작]
  global[전체 룰 항상 적용]
  direction[docs/direction.md 확인]
  work[frontend / backend / ai-service 작업]
  page[중요 페이지만 개별 룰·스킬]
  log[docs/work-log 기록]

  start --> global
  global --> direction
  direction --> work
  work --> page
  page --> log
```

| 종류 | 의미 | 예 |
|------|------|-----|
| **전체 룰** | 어디를 건드려도 | `main-project.mdc`, `docs-workflow.mdc`, `ask-before-run.mdc` |
| **전체 스킬** | 조율 | `project-control` |
| **개별 룰·스킬** | 특정 화면·API | Setting / Management · `*-api` |
| **docs** | 지금 방향·일자별 일지 | `direction.md`, `work-log/` |

### 자주 보는 파일

| 파일 | 역할 |
|------|------|
| [`docs/direction.md`](./docs/direction.md) | 지금 우선순위 |
| [`docs/work-log/2026-08-02.md`](./docs/work-log/2026-08-02.md) | SSE · analytics · soft fallback · **3단계** chunk/min_score · 스택 스냅샷 |
| [`docs/references/ai-service-feature-catalog.md`](./docs/references/ai-service-feature-catalog.md) | ai-service 기능 목록 (predict · 보안 RAG · analytics) |
| [`docs/work-log/2026-08-01.md`](./docs/work-log/2026-08-01.md) | 보안 RAG 자연 흐름 · SYS_RAG_EMPTY · 다문서 · 인덱스 |
| [`docs/references/LLM 튜닝.md`](./docs/references/LLM%20튜닝.md) | Secure RAG·SSE·analytics 기법·과정 총정리 (코드 SSOT) |
| [`docs/references/security-chatbot-guide.md`](./docs/references/security-chatbot-guide.md) | 챗봇 스택 · 기법 · ai-service 이용 |
| [`docs/work-log/2026-07-31.md`](./docs/work-log/2026-07-31.md) | Documents 경로 · PDF ingest · MariaDB 멀티턴 B |
| [`docs/work-log/2026-07-30.md`](./docs/work-log/2026-07-30.md) | 보안 RAG · E2E · 발췌 모드 |
| [`docs/references/secure-rag.md`](./docs/references/secure-rag.md) | 보안 RAG · env · 스모크 |
| [`docs/references/vllm-setup.md`](./docs/references/vllm-setup.md) | 로컬 LLM(:8001) 수동 기동 |
| [`.cursor/rules/`](./.cursor/rules/) | Cursor 룰 |

목차: [`docs/README.md`](./docs/README.md)

---

## 관련 문서

- 프론트: [`frontend/README.md`](./frontend/README.md)  
- 백엔드: [`backend/README.md`](./backend/README.md)  
- AI: [`ai-service/README.md`](./ai-service/README.md)  
- AI 규칙: [`AGENTS.md`](./AGENTS.md)  
- 작업 방향: [`docs/direction.md`](./docs/direction.md)

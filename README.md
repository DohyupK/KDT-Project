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
| 2 | **로컬 실행** — frontend + backend + ai-service | 저장소 루트 [`npm run dev`](#3-매번--한-번에-기동) · [로컬 실행](#로컬-실행-권장) |
| 3 | 보안 탭 · secure RAG | [`docs/references/secure-rag.md`](./docs/references/secure-rag.md) |
| 4 | (선택) 문서·AI 규칙 구조 | [문서와 AI 규칙](#문서와-ai-규칙-어떻게-나뉘나) |

**사람용 설명** → 이 README · `docs/`  
**AI용 짧은 규칙** → [`AGENTS.md`](./AGENTS.md)  
**기능·세부 설계** → 각 패키지 `README.md` · **실행 진입점·기술 스택** → 이 파일

---

## 이 저장소에 무엇이 있나

| 폴더 / 파일 | 하는 일 | 기능·설계 |
|-------------|---------|-----------|
| [`frontend/`](./frontend/) | UI · AppShell · GlobalChatbot · `/security` | [`frontend/README.md`](./frontend/README.md) |
| [`backend/`](./backend/) | Express API · 세션 · 게이트 · LLM 키 · 프록시 | [`backend/README.md`](./backend/README.md) |
| [`ai-service/`](./ai-service/) | FastAPI · predict · LangGraph · secure RAG | [`ai-service/README.md`](./ai-service/README.md) |
| [`docs/`](./docs/) | 방향 · 일지 · 계획 · 스키마 참조 | [일지](./docs/work-log/2026-08-13.md) |
| [`AGENTS.md`](./AGENTS.md) | AI 공통 bullet | — |

```text
KDT-Project/
├── package.json   ← 루트 npm run dev (ai :8800 · backend :3001 · frontend :3000)
├── docs/          ← 사람·팀 “전체” 문서
├── frontend/      ← 화면 (:3000)
├── backend/       ← 서버 (:3001)
├── ai-service/    ← AI (:8800) · 기동 시 Qdrant Docker 시도
├── AGENTS.md
├── .cursor/       ← Cursor 룰·스킬
└── .agents/       ← 에이전트 스킬
```

Docker로만 뜨는 것(레포 밖): **Qdrant** `kdt-qdrant` :6333 · **n8n** `kdt-n8n` :5678 (수동).

### 제품 한눈에

| 채널 | 경로 | 비고 |
|------|------|------|
| 일반 챗 | 우하단 GlobalChatbot → `POST /api/chat` | Groq/Gemini 등 **등록 키** · predict 헤드(clf·용량·잔여 Li) · what-if |
| 보안 챗 | Maximize 또는 `/security` → `POST /api/security-chat/stream` (SSE) · JSON `/api/security-chat` 병행 | **클라우드 폴백 없음** · 로컬 LLM(`:8001`) + Qdrant RAG · 기본은 문서 발췌(`SECURE_GENERATE=0`) |
| 진단 API | ai-service `/predict`, `/predict-capacity`, `/predict-residual` | 학습 산출물 `ai-service/models/` |

---

## 로컬 실행 (권장)

**실행 진입점은 저장소 루트 `npm run dev` 하나입니다.**  
바로 켜지는 것은 **frontend(:3000) + backend(:3001) + ai-service(:8800)** 뿐입니다.  
Qdrant는 ai-service가 Docker로 **같이 올리려고** 하고, **n8n · 로컬 LLM · MariaDB는 `npm run dev`가 켜지 않습니다.**

상세·다이어그램: [`docs/references/documents-watcher-qdrant.md`](./docs/references/documents-watcher-qdrant.md)

### 포트 · 누가 켜나 (현재 로컬)

| 포트 | 서비스 | `npm run dev` | 기동 주체 |
|------|--------|---------------|-----------|
| **3000** | Next.js UI | **켬** | `dev:frontend` · `/api`→`:3001`, `/ai`→`:8800` rewrite |
| **3001** | Express | **켬** | `dev:backend` (`AI_SERVICE_AUTOSTART=0` — ai 이중 기동 방지) · Documents 워처 자식 |
| **8800** | FastAPI ai-service | **켬** | `dev:ai` (uvicorn) |
| **6333** / **6334** | Qdrant HTTP / gRPC | **간접** | ai-service `QDRANT_AUTOSTART=1` → Docker `kdt-qdrant` (Docker Desktop 필요) |
| **5678** | n8n UI · 이슈메일 웹훅 | **안 켬** | 수동 `docker start kdt-n8n` |
| **8001** | 보안 챗 로컬 LLM | **안 켬** | LM Studio / vLLM **수동** |
| **3306** | MariaDB | **안 켬** | `.env` `DB_*` (원격 가능) |

Express 안에 n8n·Qdrant를 넣지 않는다. Qdrant는 **ai-service와 함께** Docker로 뜨고, n8n은 **메일 쓸 때만** 컨테이너를 따로 켠다.

| 루트 `npm run dev`가 하는 일 | 하지 않는 일 |
|------------------------------|--------------|
| concurrently: ai + backend + frontend | n8n(`kdt-n8n`) start |
| backend → Documents 워처 Python | MariaDB · :8001 LLM |
| ai → Qdrant `docker start`/`run` 시도 | n8n 워크플로·로그인 (컨테이너 데이터) |

### 0) 사전 요구

- Node.js LTS, npm  
- Python **3.11+**, `pip`  
- Docker (Qdrant 자동기동 · 이슈 메일이면 n8n `kdt-n8n`)  
- (선택) 로컬 LLM(:8001) · Tesseract OCR (`kor`+`eng`)  
- (이슈 메일) `docker start kdt-n8n` — 워크플로 Published, 웹훅 `/webhook/issue-report`

### 1) 루트 `.env`

패키지별 `.env` 없음. **모노레포 루트 `.env`만** 사용. **시크릿·API 키 커밋 금지.**

| 변수 | 용도 |
|------|------|
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | backend MariaDB (auth·이슈·문의 등). DB명은 **이 값 기준** |
| `DATABASE_URL` | ai-service 멀티턴 (`user_chat_*`). **`mysql+pymysql://user:pass@host:port/DB_NAME?charset=utf8mb4`** 권장. 비우면 `DB_*`로 동일 dialect 조합. bare `mysql://` 는 MySQLdb 오류 → 히스토리 안 남음 |
| `CHAT_STORE` | **backend Express 세션**만 (`sqlite` 기본 / `mariadb`). **챗 멀티턴 SSOT와 무관** |
| `AI_SERVICE_URL` | 기본 `http://127.0.0.1:8800` |
| `JWT_SECRET` | auth JWT |
| `LLM_KEYS_ENCRYPTION_KEY` | 보안 탭 API 키 암호 (16자+) |
| `CHAT_USE_LLM` · `CHAT_VLLM_*` · `SECURE_*` | 일반/보안 챗 · RAG |
| `ISSUE_REPORT_MAIL_*` · `N8N_*` · `GMAIL_*` · `GOOGLE_MAIL_*` | 이슈 보고서 메일 (n8n 웹훅 · Gmail). JSON 본문·토큰 커밋 금지 · 경로·키 이름만 |

**DB 스키마 (최초, MariaDB 사용 시)** — `DB_NAME`을 `.env`와 맞출 것:

```bash
# 예: DB_NAME=kdt_project
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS kdt_project CHARACTER SET utf8mb4;"
mysql -u root -p kdt_project < DB/schema.sql
mysql -u root -p kdt_project < DB/chat_schema.sql
# 멀티턴 테이블
python DB/ai-service/apply_user_chat_tables.py
```

팀 공용 DB: [`docs/guides/login-ubuntu-mariadb.md`](./docs/guides/login-ubuntu-mariadb.md)

### 2) 최초 1회 — 의존성

PowerShell에서는 `&&` 대신 **줄마다** 실행하거나 `;` 를 쓰세요.

```bash
cd frontend
npm install
cd ../backend
npm install
cd ../ai-service
pip install -r requirements.txt
cd ..
npm install
```

### 3) 매번 — 한 번에 기동

저장소 **루트** (`KDT-Project/`)에서:

```bash
npm run dev
```

`concurrently -k`가 ai · backend · frontend를 함께 띄웁니다. 다른 터미널에 frontend만 켜 둔 채 중복 기동하지 마세요.

| 루트 명령 | 설명 |
|-----------|------|
| `npm run dev` | ai + backend + frontend 동시 (**이걸 쓰세요**) |
| `npm run dev:ai` | ai-service만 (`python -m uvicorn` · CWD=`ai-service/`) |
| `npm run dev:backend` | backend만 |
| `npm run dev:frontend` | frontend만 (디버그용 · 단독 사용 금지) |

### 4) 기동 확인

| URL | 기대 |
|-----|------|
| [http://localhost:3000/main](http://localhost:3000/main) | UI 200 |
| [http://127.0.0.1:3001/api/health](http://127.0.0.1:3001/api/health) | backend ok |
| [http://127.0.0.1:8800/health](http://127.0.0.1:8800/health) | `registry_ready` · **`chat_history_db_ok`: true** (멀티턴 DB) |
| [http://127.0.0.1:6333/readyz](http://127.0.0.1:6333/readyz) | Qdrant (ai가 Docker로 올린 뒤) |
| [http://127.0.0.1:5678](http://127.0.0.1:5678) | n8n (메일을 쓸 때만 · `npm run dev`와 무관) |

`chat_history_db_ok`가 false면 채팅은 될 수 있어도 **히스토리가 MariaDB에 안 남습니다.** `DATABASE_URL` / `DB_*` · PyMySQL을 점검한 뒤 ai(또는 루트 `npm run dev`)를 재시작하세요.

### 5) 개별 기동 (디버그용)

세 터미널을 나눠야 할 때만. 프론트를 단독으로 켜면 `/api`가 `ECONNREFUSED :3001` 납니다 → **루트 `npm run dev`를 쓰세요.**

```bash
# 터미널 1 — CWD 항상 ai-service/
cd ai-service
python -m uvicorn app.main:app --host 127.0.0.1 --port 8800

# 터미널 2
cd backend
npm run dev

# 터미널 3
cd frontend
npm run dev
```

### 6) 안 될 때

| 증상 | 원인 | 조치 |
|------|------|------|
| `ECONNREFUSED :3001` / Failed to proxy `/api` | frontend만 기동 | 루트 `npm run dev` |
| `No module named 'MySQLdb'` · 채팅 히스토리 안 남음 · messages 404 | `DATABASE_URL=mysql://` (드라이버 잘못됨) | `mysql+pymysql://...` 로 바꾸거나 `DATABASE_URL` 비우고 `DB_*`만 · `/health`의 `chat_history_db_ok` 확인 |
| React Client Manifest 500 · multiple lockfiles | Turbopack이 모노레포 루트를 잡음 | `frontend/next.config.ts`의 `turbopack.root` 적용됨 · **루트 `npm run dev` 재시작** |
| 보안 RAG 빈약 / Qdrant 오류 | Qdrant·인덱스 없음 | Docker Desktop · `:6333` · ingest · [`secure-rag.md`](./docs/references/secure-rag.md) |
| 이슈 메일 `webhook_404` | n8n 꺼짐 · unpublished | `docker start kdt-n8n` · [`issue-report-n8n 계획`](./docs/plans/2026-08-13-issue-report-n8n.md) |
| 보안 요약 실패 | 로컬 LLM 없음 | LM Studio/vLLM(:8001) 또는 `SECURE_GENERATE=0` 발췌 모드 |

### 요청 흐름

**일반 챗**

```text
브라우저 :3000
  → POST /api/chat  (Next rewrite → backend :3001)
  → 보안 키워드? → security_redirect
  → 아니면 ai-service :8800/chat
  → MariaDB user_chat_* (멀티턴) + LangGraph + LLM(등록 키) 또는 template
```

**보안 챗**

```text
Maximize / /security
  → POST /api/security-chat/stream → :8800/security-chat/stream (SSE)
  → RAG (Qdrant + BM25 + RRF + CPU rerank)
  → SECURE_GENERATE=0 → 문서 발췌 + [출처:]
     또는 =1 → 로컬 LLM(:8001) 요약
```

| 항목 | 경로 |
|------|------|
| 일반 UI | `frontend/src/components/chat/GlobalChatbot.tsx` |
| 보안 UI | `frontend/src/components/chat/SecurityChatbot.tsx` |
| rewrite | `frontend/next.config.ts` — `/api`→`:3001`, `/ai`→`:8800` |
| 보안 RAG | [`docs/references/secure-rag.md`](./docs/references/secure-rag.md) |
| LLM·RAG 튜닝 | [`docs/references/LLM 튜닝.md`](./docs/references/LLM%20튜닝.md) |
| 챗봇 가이드 | [`docs/references/security-chatbot-guide.md`](./docs/references/security-chatbot-guide.md) |
| 일반 챗 · 페이지 컨텍스트 | [`docs/references/general-chatbot-page-context.md`](./docs/references/general-chatbot-page-context.md) |
| Documents 워처 · Qdrant · 포트 | [`docs/references/documents-watcher-qdrant.md`](./docs/references/documents-watcher-qdrant.md) |
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
- **업로드:** multer (문의 첨부)  
- **개발:** typescript, tsx, `@types/express`, `@types/multer` 등  
→ 기능·설계: [`backend/README.md`](./backend/README.md)

### ai-service
- Python 3.11+, Polars, NumPy, scikit-learn, XGBoost, CatBoost, Optuna, SHAP, joblib, openpyxl  
- FastAPI, Uvicorn, Pydantic · LangGraph / LangChain  
- Secure RAG: qdrant-client, sentence-transformers, rank-bm25, torch, llama-index-core, llama-index-llms-openai, llama-index-vector-stores-qdrant, pypdf, pymupdf, Pillow, pytesseract, openpyxl, watchdog, SQLAlchemy, PyMySQL
  (bge-m3 / bge-reranker **CPU** · soft fallback · `FOLLOWUP_RE` · SSE `/security-chat/stream` · analytics `csv_lake`)  
→ [`ai-service/README.md`](./ai-service/README.md)

---

## AI 서비스 실행 (ai-service)

단독 기동·엔드포인트·학습 설계는 **[`ai-service/README.md`](./ai-service/README.md)**.  
전체 실연동은 위 [한 번에 기동](#3-매번--한-번에-기동).

| 엔드포인트 | 설명 |
|------------|------|
| `GET /health` | 상태 · `registry_ready` · **`chat_history_db_ok`** (멀티턴 MariaDB) |
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
| **루트 README** | 사람 | `/README.md` | **실행 진입점** · 지도 · **모노레포 기술 스택** |
| **루트 AGENTS** | AI | `/AGENTS.md` | 전 패키지 **짧은** 규칙 |
| **패키지 README** | 사람 | `frontend/` · `backend/` · `ai-service/` | 기능 · 세부 설계 · 패키지별 실행 보충 |
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
| [`docs/guides/aws-lightsail-gpu-tunnel.md`](./docs/guides/aws-lightsail-gpu-tunnel.md) | Lightsail 16GB 앱 + 이 PC GPU 터널 · IP/DB 변경 목록 |
| [`docs/work-log/2026-08-14.md`](./docs/work-log/2026-08-14.md) | 16GB 이전 · Grafana 호스트 env · compose/nginx |
| [`docs/work-log/2026-08-13.md`](./docs/work-log/2026-08-13.md) | 이슈 보고서 n8n 메일 · 포트/`npm run dev` 기동 주체 |
| [`docs/work-log/2026-08-10.md`](./docs/work-log/2026-08-10.md) | N_FOLDS 5→6 · [모델 학습 방법 SSOT](./docs/references/model-training-methods.md) |
| [`docs/work-log/2026-08-08.md`](./docs/work-log/2026-08-08.md) | 메인 위험 LOT·당일 KPI 0.8 · 대시보드 생산 상세 · issues 리팩터 · 이슈 저장=완료/과거 자료 |
| [`docs/work-log/2026-08-06.md`](./docs/work-log/2026-08-06.md) | 생산 추이 · [model_quality](./Documents/Public/model_quality.md) · [blending](./Documents/Public/model-blending-correlation.md) |
| [`docs/work-log/2026-08-05.md`](./docs/work-log/2026-08-05.md) | lots/judgment/SPC 폴링 · 대시보드 residual 3컬럼 · 네모칸 후속 |
| [`docs/work-log/2026-08-04.md`](./docs/work-log/2026-08-04.md) | Documents READ-ONLY · 인수인계 DB · ISS-yyMMdd-001 자동발급 |
| [`docs/work-log/2026-08-02.md`](./docs/work-log/2026-08-02.md) | SSE · analytics · soft fallback · **3단계** chunk/min_score · 스택 스냅샷 |
| [`docs/references/ai-service-feature-catalog.md`](./docs/references/ai-service-feature-catalog.md) | ai-service 기능 목록 (predict · 보안 RAG · analytics) |
| [`ai-service/README.md`](./ai-service/README.md#성능-확인-clf--reg--residual) | ML 성능 확인 (metadata + `scripts/evaluate_models.py`) |
| [`docs/work-log/2026-08-01.md`](./docs/work-log/2026-08-01.md) | 보안 RAG 자연 흐름 · SYS_RAG_EMPTY · 다문서 · 인덱스 |
| [`docs/references/LLM 튜닝.md`](./docs/references/LLM%20튜닝.md) | Secure RAG·SSE·analytics 기법·과정 총정리 (코드 SSOT) |
| [`docs/references/security-chatbot-guide.md`](./docs/references/security-chatbot-guide.md) | 챗봇 스택 · 기법 · ai-service 이용 |
| [`docs/references/general-chatbot-page-context.md`](./docs/references/general-chatbot-page-context.md) | 일반 챗 응답·페이지 참조 로직 SSOT |
| [`docs/references/documents-watcher-qdrant.md`](./docs/references/documents-watcher-qdrant.md) | Documents 워처 · Qdrant 자동기동 · 포트 SSOT |
| [`docs/work-log/2026-07-31.md`](./docs/work-log/2026-07-31.md) | Documents 경로 · PDF ingest · MariaDB 멀티턴 B |
| [`docs/work-log/2026-07-30.md`](./docs/work-log/2026-07-30.md) | 보안 RAG · E2E · 발췌 모드 |
| [`docs/references/secure-rag.md`](./docs/references/secure-rag.md) | 보안 RAG · env · 스모크 |
| [`docs/references/vllm-setup.md`](./docs/references/vllm-setup.md) | 로컬 LLM(:8001) 수동 기동 · Lightsail 터널 |
| [`.cursor/rules/`](./.cursor/rules/) | Cursor 룰 |

목차: [`docs/README.md`](./docs/README.md)

---

## 관련 문서

- 프론트: [`frontend/README.md`](./frontend/README.md)  
- 백엔드: [`backend/README.md`](./backend/README.md)  
- AI: [`ai-service/README.md`](./ai-service/README.md)  
- AI 규칙: [`AGENTS.md`](./AGENTS.md)  
- 작업 방향: [`docs/direction.md`](./docs/direction.md)

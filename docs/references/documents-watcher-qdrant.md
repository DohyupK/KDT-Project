# Documents 워처 · Qdrant 기동 · 포트 (SSOT)

최종 갱신: 2026-08-14

이 문서는 **Documents OCR/`text_match` 워처**와 **Qdrant 자동 기동**, 그리고 모노레포 **포트·프로세스 소유권**을 정리한다.  
일반 챗 페이지 컨텍스트는 [`general-chatbot-page-context.md`](./general-chatbot-page-context.md), 보안 RAG 튜닝은 [`secure-rag.md`](./secure-rag.md).

---

## 1. 한 줄 요약

| 관심사 | 누가 기동하나 | 기본 on/off |
|--------|---------------|-------------|
| Documents 감시 · OCR · `text_match` · ingest 트리거 | **Express backend** 자식 Python | `DOCUMENT_WATCHER_AUTOSTART=1` |
| Qdrant 벡터 DB (:6333) | **ai-service** lifespan (Docker `kdt-qdrant`) | `QDRANT_AUTOSTART=1` |
| FastAPI chat/predict/RAG | **ai-service** (:8800) | `npm run dev:ai` 또는 backend `AI_SERVICE_AUTOSTART` |
| n8n 이슈 보고서 메일 (:5678) | **수동** Docker `kdt-n8n` — backend는 웹훅만 호출 | 컨테이너가 켜져 있어야 메일 발송 |
| OCR/변환 구현 코드 | `ai-service/agent/document_*.py` (로직은 AI 쪽, **프로세스 소유는 backend**) | — |

**Docker가 없으면?**  
→ **Qdrant·n8n 자동 기동은 불가**하다. Docker Desktop(또는 `docker` CLI)이 있어야 한다.  
→ 워처(OCR·md·`text_match`)는 Docker 없이 backend만으로 동작 가능하다. 다만 **ingest(벡터 인덱싱)는 Qdrant가 살아 있어야** 성공한다.  
→ 이슈 보고서 메일은 n8n 웹훅 URL이 있으면 **n8n 컨테이너가 살아 있어야** 한다.

---

## 2. 포트·프로세스 맵

```mermaid
flowchart LR
  subgraph fe [frontend :3000]
    Next[Next.js]
  end
  subgraph be [backend :3001]
    Express[Express]
    DocSup[documentWatcherSupervisor]
  end
  subgraph ai [ai-service :8800]
    FastAPI[FastAPI]
    QdrSup[qdrant_supervisor]
  end
  subgraph py [Python child]
    Watch[run_document_watcher.py]
  end
  subgraph vec [Qdrant :6333 / :6334]
    Qdr[kdt-qdrant Docker]
  end
  subgraph db [MariaDB :3306]
    TM[text_match]
    Chat[user_chat_*]
  end
  subgraph n8nbox [n8n :5678]
    N8n[kdt-n8n Docker]
  end

  Next -->|"/api rewrite"| Express
  Next -->|"/ai rewrite"| FastAPI
  Express --> DocSup --> Watch
  Watch -->|OCR md + text_match| TM
  Watch -->|ingest_secure| Qdr
  FastAPI --> QdrSup --> Qdr
  FastAPI --> Chat
  FastAPI --> Qdr
  Express -->|"issue-report webhook"| N8n
  N8n -->|"send-email-result"| Express
```

| 포트 | 서비스 | `npm run dev`가 켜나 | 기동 주체 |
|------|--------|----------------------|-----------|
| **3000** | Next.js UI | **예** | `dev:frontend` |
| **3001** | Express (auth · 게이트 · 프록시 · 폴러 · 메일 웹훅 호출) | **예** | `dev:backend` (`AI_SERVICE_AUTOSTART=0`) |
| **8800** | FastAPI ai-service | **예** | `dev:ai` (uvicorn) |
| **6333** | Qdrant HTTP | **간접** (ai lifespan) | Docker `kdt-qdrant` · `QDRANT_AUTOSTART=1` |
| **6334** | Qdrant gRPC | **간접** | 동일 컨테이너 |
| **5678** | n8n UI · 웹훅 | **아니오** | 수동 `docker start kdt-n8n` |
| **8001** | 로컬 vLLM / LM Studio (보안 챗) | **아니오** | **수동** |
| **3306** | MariaDB | **아니오** | 원격/로컬 `.env` `DB_*` |

루트 `npm run dev` = concurrently `ai` + `backend` + `frontend`만. Express·n8n·Qdrant를 **한 프로세스에 합치지 않는다.**  
backend가 ai를 또 띄우지 않도록 [`scripts/dev-backend.cjs`](../../scripts/dev-backend.cjs)가 `AI_SERVICE_AUTOSTART=0`을 넣는다.  
n8n Task Broker(`5679`)는 **컨테이너 내부** 포트이며 호스트에 열려 있지 않다.

Lightsail 16GB에서 앱을 돌릴 때 Qdrant·n8n은 레포 [`docker-compose.yml`](../../docker-compose.yml) (`127.0.0.1` 바인드). vLLM은 이 PC GPU + `ssh -R`. [`aws-lightsail-gpu-tunnel.md`](../guides/aws-lightsail-gpu-tunnel.md)

---

## 3. Documents 워처 (backend 소유)

### 3.1 왜 backend인가

요청 정책: **backend를 켜면 워처도 같이**.  
OCR·PDF 변환은 Python(`pypdf` / `pymupdf` / Tesseract)이라 구현은 `ai-service`에 두고, **프로세스 수명만 Express가 관리**한다.

### 3.2 파일

| 경로 | 역할 |
|------|------|
| [`backend/src/services/documentWatcherSupervisor.ts`](../../backend/src/services/documentWatcherSupervisor.ts) | `python scripts/run_document_watcher.py` spawn |
| [`backend/src/index.ts`](../../backend/src/index.ts) | listen 직후 `startDocumentWatcherSupervisor()` |
| [`ai-service/scripts/run_document_watcher.py`](../../ai-service/scripts/run_document_watcher.py) | 워처 데몬 (SIGINT/SIGTERM 대기) |
| [`ai-service/agent/document_watcher.py`](../../ai-service/agent/document_watcher.py) | watchdog 이벤트 · debounce · ingest coalesce |
| [`ai-service/agent/document_convert.py`](../../ai-service/agent/document_convert.py) | 네이티브 텍스트 판정 · OCR · md · `text_match` |
| [`ai-service/agent/text_match_store.py`](../../ai-service/agent/text_match_store.py) | MariaDB `text_match` CRUD |

FastAPI lifespan에서는 **더 이상 워처를 시작하지 않는다** ([`ai-service/app/main.py`](../../ai-service/app/main.py)).

### 3.3 환경 변수

| 변수 | 기본 | 의미 |
|------|------|------|
| `DOCUMENT_WATCHER_AUTOSTART` | `1` | backend가 데몬을 띄울지 |
| `SECURE_DOCS_WATCH` | 데몬이 `1`로 강제 | 워처 내부 enable |
| `SECURE_DOCS_WATCH_DEBOUNCE` | `4.0` | 파일 안정화 후 처리 지연(초) |
| `AI_SERVICE_CWD` | `…/ai-service` | Python cwd |
| `AI_SERVICE_PYTHON` / `TESSERACT_CMD` | (선택) | 인터프리터 · Tesseract 경로 |

끄기: 루트 `.env` 또는 backend 환경에 `DOCUMENT_WATCHER_AUTOSTART=0`.

### 3.4 동작 요약 (파일 드롭 시)

1. `Documents/<Clearance>/`에 pdf/txt/이미지 추가·변경  
2. debounce 후 `convert_file_to_md`  
   - **네이티브 텍스트 충분** → md 매칭 **안 만듦**, 원본 ingest 대상  
   - **비어 있음(스캔/이미지)** → OCR → `Markdown/<stem>.md` + `text_match` upsert  
3. 변경 있으면 `ingest_secure.run_ingest()` (Qdrant 필요) → 가능하면 BM25 핫리로드  
4. 원본 삭제 시 sidecar md + `text_match` 행 정리

정책 상세: [`Documents/README.md`](../../Documents/README.md).

### 3.5 Docker 없이도 되는 것 / 안 되는 것

| 단계 | Docker 필요? |
|------|----------------|
| 워처 기동 (backend) | 아니오 |
| OCR → `.md` 작성 | 아니오 (Tesseract + pip 패키지) |
| `text_match` MariaDB 기록 | 아니오 (DB만) |
| `ingest_secure` → Qdrant 인덱싱 | **예 — Qdrant 프로세스 필요** (자동 기동은 Docker) |

---

## 4. Qdrant (ai-service 소유)

### 4.1 자동 기동

[`ai-service/agent/qdrant_supervisor.py`](../../ai-service/agent/qdrant_supervisor.py)

1. `GET {QDRANT_URL}/readyz` 성공이면 종료  
2. `QDRANT_AUTOSTART=1`이면 Docker로  
   - 기존 컨테이너 `kdt-qdrant` 있으면 `docker start`  
   - 없으면 `docker run -d --name kdt-qdrant -p 6333:6333 -p 6334:6334 -v <storage>:/qdrant/storage qdrant/qdrant`  
3. ready 될 때까지 대기 (`QDRANT_READY_MS`, 기본 60s)

스토리지 기본 경로: **`DB/data/qdrant_storage/`** (git ignore).  
ai-service 종료 시 **Qdrant 컨테이너는 내리지 않는다** (다른 도구와 공유).

### 4.2 환경 변수

| 변수 | 기본 | 의미 |
|------|------|------|
| `QDRANT_AUTOSTART` | `1` | lifespan 자동 기동 |
| `QDRANT_URL` | `http://127.0.0.1:6333` | 클라이언트 URL |
| `QDRANT_STORAGE_DIR` | `DB/data/qdrant_storage` | 볼륨 호스트 경로 |
| `QDRANT_IMAGE` | `qdrant/qdrant` | 이미지 |
| `QDRANT_HTTP_PORT` / `QDRANT_GRPC_PORT` | `6333` / `6334` | 호스트 포트 |
| `QDRANT_READY_MS` | `60000` | ready 대기 |

### 4.3 “도커가 없어서 지금 불가”의 정확한 의미

| 상황 | 결과 |
|------|------|
| Docker Desktop **미실행** / `docker` CLI 실패 | `ensure_qdrant()` 실패 로그. **자동으로 :6333을 못 올림** |
| Docker 없이 Qdrant **바이너리·다른 호스트**를 이미 띄움 | `QDRANT_AUTOSTART=0`, `QDRANT_URL`만 맞으면 RAG/ingest **가능** (자동 기동만 스킵) |
| Docker는 있으나 이미지 pull 실패·포트 점유 | 로그 확인 후 `docker start kdt-qdrant` 또는 수동 `docker run …` |

즉 **“Docker 없으면 RAG가 원리상 불가능”이 아니라**,  
**현재 구현한 자동 기동 경로가 Docker 전용**이라, Docker가 없으면 **별도로 Qdrant를 미리 켜 두지 않는 한** ingest/보안 RAG가 막힌다.

수동 예시:

```bash
docker run -d --name kdt-qdrant -p 6333:6333 -p 6334:6334 ^
  -v "%CD%/DB/data/qdrant_storage:/qdrant/storage" qdrant/qdrant
```

그다음:

```bash
cd ai-service
python ingest_secure.py
```

---

## 5. n8n (메일 · 수동 Docker)

이슈 보고서 메일: backend가 `N8N_ISSUE_REPORT_WEBHOOK_URL`(기본 `http://127.0.0.1:5678/webhook/issue-report`)로 POST → n8n이 Gmail API → `POST :3001/api/internal/n8n/send-email-result`.  
계획: [`docs/plans/2026-08-13-issue-report-n8n.md`](../plans/2026-08-13-issue-report-n8n.md).

| 항목 | 내용 |
|------|------|
| 컨테이너 | `kdt-n8n` (호스트 볼륨 없음 · 지우면 로그인·워크플로 소실) |
| 호스트 포트 | **5678** (UI + production webhook) |
| `npm run dev` | **켜지 않음** |
| Express에 내장 | 불가. 기동만 backend에 붙이는 것은 미구현 |

메일 쓸 때: Docker Desktop + `docker start kdt-n8n` (워크플로 Published).  
웹훅 URL을 비우면 backend가 Gmail로 직접 보내 n8n 없이 동작 가능하다.

---

## 6. 권장 기동 순서

1. **Docker Desktop 실행** 후 루트 `docker compose up -d` (`kdt-qdrant` · `kdt-n8n`, 데이터 `DB/data/`)  
2. 루트 `npm run dev`  
   - ai → Qdrant ensure → uvicorn :8800  
   - backend → document watcher 자식 → Express :3001  
   - frontend :3000  
3. (최초/정리 후) 필요 시 `cd ai-service && python ingest_secure.py`  
4. 보안 챗 LLM이 필요하면 :8001 수동

Tesseract(Windows): `winget install UB-Mannheim.TesseractOCR`,  
`kor` 언어팩은 `%LOCALAPPDATA%\tesseract-tessdata\tessdata\` (Program Files 쓰기 권한 이슈 회피).  
선택: `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe`.

MariaDB `text_match`: [`DB/text_match.sql`](../../DB/text_match.sql) · `python DB/ai-service/apply_text_match.py`.

---

## 7. 장애 체크리스트

| 증상 | 확인 |
|------|------|
| `[qdrant] Docker not on PATH` / ensure_ok=False | Docker Desktop 실행 · PATH |
| ingest `ConnectError :6333` | Qdrant ready · `curl http://127.0.0.1:6333/readyz` |
| `[doc-watcher] script not found` | `AI_SERVICE_CWD` · ai-service 경로 |
| OCR fail / no kor | Tesseract · tessdata · `TESSERACT_CMD` |
| `[text_match] DB unavailable` | 루트 `.env` `DB_*` / `DATABASE_URL` |
| `:8800` EADDRINUSE | `dev:ai`와 backend `AI_SERVICE_AUTOSTART=1` 이중 기동 여부 |
| 이슈 메일 `webhook_404` | n8n 꺼짐 · 워크플로 unpublished · 경로 `issue-report` |

---

## 8. 관련 링크

- [`Documents/README.md`](../../Documents/README.md) — 변환 정책  
- [`secure-rag.md`](./secure-rag.md) — RAG · ingest · 환경  
- [`general-chatbot-page-context.md`](./general-chatbot-page-context.md) — 일반 챗 페이지 컨텍스트  
- [`docs/plans/2026-08-13-issue-report-n8n.md`](../plans/2026-08-13-issue-report-n8n.md) — 이슈 보고서 메일  
- [`docs/guides/aws-lightsail-docker.md`](../guides/aws-lightsail-docker.md) — Lightsail에 n8n·Qdrant  
- DDL: [`DB/text_match.sql`](../../DB/text_match.sql) · [`DB/schema.sql`](../../DB/schema.sql)

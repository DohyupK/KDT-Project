# 보안·일반 챗봇 가이드 (스택 · 기법 · ai-service 이용)

최종 갱신: 2026-08-02

양극재 품질 AI 모노레포의 **챗봇 두 계열**과 **ai-service** 이용법을 한곳에 정리한다.  
일지: [`docs/work-log/2026-08-02.md`](../work-log/2026-08-02.md) · [`2026-08-01`](../work-log/2026-08-01.md) · RAG 상세: [`secure-rag.md`](./secure-rag.md) · 기법 총정리: [`LLM 튜닝.md`](./LLM%20튜닝.md)

---

## 1. 챗봇 두 계열

| | 일반 챗 | 보안 챗 |
|--|---------|---------|
| UI | `GlobalChatbot` (셸 플로팅) | `/security` · Maximize → `SecurityChatbot` |
| API | `POST /api/chat` → ai-service `/chat` | `POST /api/security-chat/stream` (SSE) · JSON `/api/security-chat` 병행 |
| LLM | 보안 탭 등록 키 (Groq/Gemini 등) · Auto/수동 | **로컬만** `CHAT_VLLM_*` (:8001) · **클라우드 폴백 없음** |
| 지식 | 일반 Knowledge / 도구(predict·whatif) | **Secure RAG** (`Documents/` → Qdrant `secure_docs`) |
| 멀티턴 | MariaDB 스레드 (채널 구분) | 동일 DB · `channel=security` |

---

## 2. 기술 스택 (현재 동작 기준)

### 프론트

- Next.js (App Router) · TypeScript · React
- `SecurityChatbot` / `GlobalChatbot`
- axios · 출처 칩(`doc_id` dedupe) · 청크 패널

### 백엔드 (Express)

- 세션 · LLM 키 DB(암호화) · `/api/chat` · `/api/security-chat` · `/api/security-chat/stream` 프록시
- 스트림: `\n\n` 누적 파싱 후 `done`/`replace`에서 레거시 `chat_store`만 1회 저장 (MariaDB는 ai-service)
- 채팅 스레드 목록/복원 패스스루

### ai-service (FastAPI :8800)

| 영역 | 스택 |
|------|------|
| API | FastAPI · Uvicorn · Pydantic |
| 일반 Agent | LangGraph · LangChain · registry ready 헤드(clf/reg/residual) · whatif |
| Secure RAG | LangGraph `secure_graph` · Qdrant · BM25 · RRF · bge-m3 / bge-reranker-v2-m3 (**CPU**) · soft fallback |
| Analytics | Polars `scan_csv` · `data/csv_lake` · Smart Fallback→RAG |
| 문서 | LlamaIndex SentenceSplitter · pypdf · openpyxl · watchdog · 듀얼 엔진(convert / csv profile) |
| 멀티턴 | SQLAlchemy · PyMySQL · MariaDB |
| ML | Polars · XGBoost · CatBoost · Optuna · SHAP · `fillThreshold` 유지 |

### 외부 프로세스

- Qdrant `:6333`
- LM Studio / vLLM OpenAI 호환 `:8001` (보안 생성 시)

---

## 3. 적용한 기법 · 방법 (보안 RAG)

```text
analytics? → retrieve (쿼리 확장) → gate → generate | no_docs
                                    ↓
                          finalize_reply_sources
                          ([SYS_RAG_EMPTY_RESULT] hard override)
```

| 기법 | 방법 |
|------|------|
| Hybrid 검색 | Dense(Qdrant+bge-m3) + Sparse(BM25) + RRF |
| 메타 필터 | Self-Query(LI) 또는 `SECURE_SELF_QUERY=0` heuristic · 과도 필터 시 unfiltered 1회 |
| 다문서 다양성 | rerank 후 `doc_id`당 최대 2청크 · 점수 내림차순 |
| Rerank soft fallback | `min_score`(기본 0.15)로 0건이면 fused(RRF) 상위 1–2 · 로그 `max_score` |
| 검색량 | `node_retrieve`: `top_k=12` · `rerank_top_n=6` (`SecureRagEngine.retrieve` 기본값과 동일) |
| 청크 | ingest `SentenceSplitter` chunk_size=400 · overlap=50 |
| 자연 흐름 | 요약이어도 retrieve 스킵 없음 · 0건+짧은 follow-up/요약어 → prior |
| 쿼리 확장 | `FOLLOWUP_RE`만(그게/왜/자세히 등) · `그럼|그래서|…` 제외 · 도메인 명사 하드코딩 없음 |
| 출처 강제 | LLM `[출처:]` 제거 후 실제 sources title만 부착 |
| 빈 근거 통제 | 모델이 `[SYS_RAG_EMPTY_RESULT]` 포함 시 고정 문구 + `sources=[]` |
| 요약 | 발췌 컨텍스트 + 단답형 suffix (`SECURE_GENERATE=1`) |
| 짧은 설명 | `EXPLAIN_INSTRUCTION_SUFFIX` (≤24자 · not summary · hits≥1) |
| SSE | `meta`/`delta`/`replace`/`done`/`error` · SYS 토큰 partial-hold · disconnect 방어 |
| 발췌 모드 | `SECURE_GENERATE=0` → LLM 생략 · extractive |
| **정형 분석 (2단계)** | `is_analytics_intent` → Polars `csv_lake` · 실패 시 RAG smart fallback · mock 칩 `사내 CSV 데이터` |
| 듀얼 엔진 | PDF/TXT→MD · CSV/XLSX→lake+profile MD · debounce ingest · **ingest 후 BM25 핫리로드** |
| 서버 로그 | `RotatingFileHandler` 10MB×5 · `logs/ai-service.log` (`AI_SERVICE_LOG_FILE`) |
| FE 칩 | `doc_id` dedupe · 패널에 해당 문서 청크 전부 |

---

## 4. ai-service 이용 방법

### 4.1 기동 (챗봇 풀스택)

루트 README [로컬 실행 — 챗봇](../../README.md#로컬-실행--챗봇-터미널-3개) 참고.

```bash
# 1) Qdrant
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant

# 2) ai-service
cd ai-service
# .env: CHAT_USE_LLM, CHAT_VLLM_*, SECURE_*, DB_* (비밀은 커밋 금지)
uvicorn app.main:app --host 127.0.0.1 --port 8800

# 3) backend :3001 · frontend :3000
# 4) 보안 LLM 요약 시 LM Studio :8001
```

- Health: `GET http://127.0.0.1:8800/health`
- OpenAPI: `http://127.0.0.1:8800/docs`
- **CWD는 항상 `ai-service/`**

### 4.2 주요 엔드포인트

| 경로 | 용도 |
|------|------|
| `POST /predict` | clf O/X (`fillThreshold`) |
| `POST /predict-capacity` | reg 용량 |
| `POST /predict-residual` | residual |
| `POST /chat` | 일반 챗 · ready 헤드 자동 |
| `POST /security-chat` | 보안 RAG + 로컬 vLLM (JSON) |
| `POST /security-chat/stream` | 보안 SSE (+ analytics 의도 시 Polars 우회·RAG 폴백) |
| 스레드 API | 목록/메시지 복원 (Express 경유) |

### 4.3 보안 문서 ingest

```bash
cd ai-service
python ingest_secure.py
# 또는 옛 CSV 풀 MD 정리 후 재구축:
python scripts/rebuild_secure_rag_clean.py
```

- 문서 루트: 모노레포 `Documents/` (`SECURE_DOCS_DIR`)
- Watch: `SECURE_DOCS_WATCH=1` (수초 debounce 후 ingest)
- ingest 후 **ai-service 재시작** 권장 (BM25 캐시)

### 4.4 권장 env (보안)

```text
SECURE_SELF_QUERY=0
SECURE_GENERATE=1          # 요약 LLM 사용 시 (작은 양자화면 0 권장)
SECURE_VLLM_TIMEOUT=90
SECURE_RERANK_MIN_SCORE=0.15
CHAT_VLLM_BASE_URL=http://127.0.0.1:8001/v1
CHAT_VLLM_MODEL=<served-name>
```

### 4.5 스모크

```bash
cd ai-service
python scripts/smoke_secure_rag_e2e.py
```

### 4.6 학습 (승인 후)

```bash
python train_pipeline.py
python train_reg_pipeline.py
python train_residual_pipeline.py
```

---

## 5. 코드 맵

| 파일 | 역할 |
|------|------|
| `ai-service/agent/rag_engine.py` | hybrid · diversify rerank |
| `ai-service/agent/secure_llm/graph.py` | LangGraph retrieve/gate/generate |
| `ai-service/agent/secure_llm/prompts.py` | 시스템 프롬프트 · `[SYS_RAG_EMPTY_RESULT]` · 출처 |
| `ai-service/agent/api_llm/` | 일반 챗 · Public/Confidential RAG |
| `ai-service/ingest_secure.py` | Qdrant + BM25 재구축 |
| `frontend/.../SecurityChatbot.tsx` | 보안 UI · 칩 · 패널 |
| `frontend/.../GlobalChatbot.tsx` | 일반 챗 · Maximize→보안 |

---

## 6. 관련 문서

- [`secure-rag.md`](./secure-rag.md) — RAG 스키마·가드레일·스모크  
- [`vllm-setup.md`](./vllm-setup.md) — 로컬 LLM 기동  
- [`security-chat-skeleton.md`](./security-chat-skeleton.md) — 보안 채널 골격  
- [`docs/packages.md`](../packages.md#ai-service) — ML·실행  
- [`docs/work-log/2026-08-01.md`](../work-log/2026-08-01.md) — 당일 패치 일지  

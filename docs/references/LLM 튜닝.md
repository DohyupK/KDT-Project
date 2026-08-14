# LLM · Secure RAG 튜닝 총정리

최종 갱신: 2026-08-14  
**숫자·env·모듈 SSOT.** 코드: `ai-service/agent/*` · `app/main.py` · `ingest_secure.py`  
이용·라우팅: [`security-chatbot-guide.md`](./security-chatbot-guide.md) · ingest·가드레일·스모크: [`secure-rag.md`](./secure-rag.md)

---

## 0. 한눈에 보는 현재 기본값

| 영역 | 기본값 |
|------|--------|
| Chunk | `400` / overlap `50` (`SentenceSplitter`) |
| Retrieve | `top_k=12` · `rerank_top_n=6` |
| Rerank cut | `SECURE_RERANK_MIN_SCORE=0.15` |
| Soft fallback | fused 상위 ≤2 · 로그 `max_score` |
| Diversify | doc당 최대 2청크 |
| Embed / Rerank | `BAAI/bge-m3` · `BAAI/bge-reranker-v2-m3` · **CPU** |
| `SECURE_GENERATE` | `"0"` (발췌 기본) |
| vLLM | `:8001/v1` · `max_tokens=256` · `timeout=45` · `temperature=0.2` |
| EXPLAIN | ≤24자 · suffix · `max_tokens` 강제 256 |
| FOLLOWUP | 지시대명사만 (`그럼/그래서` 제외) |
| Analytics | Polars `csv_lake` · Smart Fallback→RAG |
| BM25 갱신 | 워처→`reload_bm25()` / CLI→**재시작** |
| 로그 | `logs/ai-service.log` · 10MB × 5 |

---

## 1. 목표 · 불변 제약

| 목표 | 내용 |
|------|------|
| 보안 챗 | 로컬 OpenAI 호환 LLM만 + Secure RAG. **클라우드 폴백 없음** |
| 일반 챗 | 보안 탭 API 키 · clf/reg/residual · whatif — 경로 분리 |

| 불변 | 위치 |
|------|------|
| `fillThreshold` 필드명 | clf / AppData |
| `SECURE_GENERATE` 분기 | `secure_graph.node_generate` |
| Guardrail C (unfiltered 재시도) | `rag_engine.retrieve` |
| Guardrail D (`min_score`) | `rag_engine._rerank` |
| embed/rerank CPU | `DEVICE="cpu"` |
| 모노레포 루트 `.env` 시크릿 미커밋 | 운영 |

---

## 2. 경로

라우팅·API: [`security-chatbot-guide.md`](./security-chatbot-guide.md). 그래프 노드는 §6.

---

## 3. 시계열 (적용 과정)

| 일자 | 핵심 |
|------|------|
| 07-30 | Secure RAG 골격 · Guardrail C/D · `SECURE_GENERATE=0` 발췌 안정화 (당시 min_score 0.05) |
| 07-31 | `Documents/` · MariaDB 멀티턴 · 듀얼 엔진(PDF→MD / CSV→lake) · watchdog |
| 08-01 | 자연 흐름 retrieve · SYS 토큰 hard override · diversify 2/doc · FE 칩 |
| 08-02 | **1단계** SSE+EXPLAIN · **2단계** analytics · soft fallback · FOLLOWUP 교정 · **3단계** 400/50·0.15·top_k=12 |
| 08-03 | BM25 `reload_bm25`+RLock · 워처 핫리로드 · RotatingFileHandler 10MB×5 |

---

## 4. 환경 변수 · 세팅 SSOT

**파일:** 모노레포 루트 `KDT-Project/.env` 만 사용 (gitignore). 패키지별 `.env` / `.env.example` 없음.

### 4.1 보안 LLM (vLLM)

| Env | 기본 | 비고 |
|-----|------|------|
| `CHAT_VLLM_BASE_URL` / `VLLM_BASE_URL` | `http://127.0.0.1:8001/v1` | |
| `CHAT_VLLM_MODEL` / `VLLM_MODEL` | `local-model` | |
| `SECURE_VLLM_TIMEOUT` | `45` | 초 |
| `SECURE_VLLM_MAX_TOKENS` | `256` | EXPLAIN/SUMMARY도 강제 256 |
| (하드코드) `temperature` | `0.2` | `secure_llm` |
| (하드코드) `max_retries` | `0` | |
| (하드코드) `api_key` | `"EMPTY"` | |

### 4.2 생성 모드

| Env | 기본 | 동작 |
|-----|------|------|
| `SECURE_GENERATE` | `"0"` | `0/false/no/off` → LLM 생략 · extractive / analytics 직반환 |
| | `"1"` | vLLM 생성 + SUMMARY/EXPLAIN suffix |

### 4.3 RAG · Qdrant · Self-Query

| Env | 기본 |
|-----|------|
| `QDRANT_URL` / `SECURE_QDRANT_URL` | `http://127.0.0.1:6333` |
| `SECURE_QDRANT_COLLECTION` | `secure_docs` |
| `SECURE_DOCS_DIR` | `<repo>/Documents` |
| `SECURE_EMBED_MODEL` | `BAAI/bge-m3` |
| `SECURE_RERANK_MODEL` | `BAAI/bge-reranker-v2-m3` |
| `SECURE_RERANK_MIN_SCORE` | **`0.15`** |
| `SECURE_SELF_QUERY` | `1` (`0`이면 heuristic만) |
| `SECURE_SELF_QUERY_TIMEOUT` | `20` |
| `SECURE_SELF_QUERY_MAX_TOKENS` | `256` |
| (하드코드) `DEVICE` | `cpu` |
| (하드코드) RRF `k` | `60` |
| (하드코드) diversify | doc당 2 |
| (코드) `retrieve` / `node_retrieve` | `top_k=12`, `rerank_top_n=6` |

경로:

- BM25: `ai-service/data/secure_rag/bm25_nodes.json`
- Lake: `ai-service/data/csv_lake/`

### 4.4 문서 워처 · 로그

| Env | 기본 |
|-----|------|
| `SECURE_DOCS_WATCH` | `1` |
| `SECURE_DOCS_WATCH_DEBOUNCE` | `4.0` 초 |
| Stable | 3회 × 0.4초 |
| `AI_SERVICE_LOG_FILE` | `ai-service/logs/ai-service.log` |
| Rotating | `maxBytes=10MB`, `backupCount=5`, `utf-8` |

### 4.5 멀티턴 DB · 히스토리

| Env | 기본 |
|-----|------|
| `CHAT_HISTORY_WINDOW` | `6` |
| `CHAT_HISTORY_MSG_MAX_CHARS` | `400` |
| `CHAT_HISTORY_MAX_CHARS` | `2000` |
| `CHAT_HISTORY_SEMANTIC_TOP_K` | `3` |
| `CHAT_HISTORY_QDRANT_COLLECTION` | `chat_history_collection` |
| `DB_*` / `DATABASE_URL` | MariaDB (미설정 시 soft-fail) |

### 4.6 Ingest

| 항목 | 값 |
|------|-----|
| Splitter | LlamaIndex `SentenceSplitter` |
| `chunk_size` / `overlap` | **400** / **50** |
| Upsert batch | 32 |
| Collection | delete → create (Cosine) |
| 메타 기본 | `category=SOP`, `security_level=internal` |
| 클린 재빌드 | `python scripts/rebuild_secure_rag_clean.py` |

**BM25 반영:** 워처 자동 ingest → `reload_bm25()` (재시작 불필요). CLI `ingest_secure.py` → **ai-service 재시작**.

---

## 5. 적용 코드 · 기법 (모듈별)

### 5.1 Hybrid RAG (`rag_engine.py`)

```text
SelfQuery/heuristic → dense(Qdrant+bge-m3) + BM25 → RRF → CrossEncoder
  → min_score 컷 → diversify(≤2/doc)
  → (전부 컷 시) soft_fallback fused[:2] + max_score 로그
```

- Guardrail C: fused empty + filters → unfiltered 1회  
- `reload_bm25()`: JSON 토큰화는 락 밖 · 덮어쓰기만 `_bm25_lock` · `_bm25_search`도 동일 락  
- 로그: `[secure-rag] bm25 reloaded n=...` · `[secure-rag] rerank soft_fallback n=... max_score=...`

### 5.2 의도 · 프롬프트 (`secure_prompts.py`)

| 심볼 | 값 |
|------|-----|
| `NO_DOC_TOKEN` | `[SYS_RAG_EMPTY_RESULT]` |
| `EMPTY_RAG_REPLY` | `제공된 사내 문서에서는 관련된 내용을 찾을 수 없습니다.` (SYS override) |
| `NO_DOCS_REPLY` | `사내 보안 문서에서 관련 정보를 찾을 수 없습니다.` (0건 gate) |
| `EXPLAIN_MAX_CHARS` | `24` |
| `FOLLOWUP_RE` | `그게/그거/왜/자세히/장단점/…` — **제외** `그럼\|그래서\|그러면\|관련\|이어서` |
| `ANALYTICS_INTENT_RE` | `통계\|평균\|예측\|예상\|불량률\|추이\|집계\|상관\|히스토그램` (`데이터` 제외) |
| Generate 컨텍스트 | `per_chunk=350`, `max_total=1600`, 상위 4 sources |
| `history_for_generate` | `max_chars=1000` |

**EXPLAIN_INSTRUCTION_SUFFIX:** 발췌만 · 공정·수치·조치 개조식 ≤3줄.  
**SUMMARY_INSTRUCTION_SUFFIX:** 숫자 생략 · 개조식 2~3문장.  
**ANALYTICS_GROUNDING_SUFFIX:** 집계만 근거 · 추측 금지.  
`finalize_reply_sources`: SYS 포함 시 hard override · 아니면 LLM `[출처:]` strip 후 실 title 부착.

### 5.3 Generate · 그래프 (`agent/secure_llm/graph.py`)

| 항목 | 동작 |
|------|------|
| Retrieve 호출 | `top_k=12`, `rerank_top_n=6` |
| Prior 폴백 | 0건 + (short follow-up **또는** 요약이고 ≤40자) + prior 있음 |
| 주제 전환 0건 | `no_docs` (엉뚱한 prior 금지) |
| `SECURE_GENERATE=0` | analytics→직반환 · summary→compressed extractive · else extractive |
| `=1` | vLLM · brief면 `max_tokens=256` · 빈 응답 1회 재시도 후 extractive |
| 라우팅 | `analytics` \| `retrieve` → gate → `generate` \| `no_docs` |

### 5.4 SSE (1단계)

| Event | 의미 |
|-------|------|
| `meta` | `analytics` / `retrieve` / `generate` |
| `delta` | 토큰 (SYS prefix hold 후) |
| `replace` | SYS 토큰 → `EMPTY_RAG_REPLY` + `sources=[]` |
| `done` | 최종 payload |
| `error` | 예외 |

DB: MariaDB=ai-service만. Express 레거시=`done`/`replace`만.

### 5.5 Analytics (2단계, `analytics_engine.py`)

| 항목 | 값 |
|------|-----|
| Lake | `data/csv_lake/**/*.csv` · Polars `scan_csv` · infer 5000 |
| 집계 | 수치 컬럼 ≤8 · mean/count |
| 실패 | `fallback_to_rag=True` (`empty_csv_lake` / `column_match_failed`) |
| 예측 | `models/xgb_model.json` try · 안내 문구 · **clf/fillThreshold 미사용** |
| 칩 | `title=사내 CSV 데이터`, `doc_id=csv_lake` |
| 가짜 CSV | **생성 안 함** |

### 5.6 워처 (`document_watcher.py`)

- PDF/TXT → MD → `run_ingest`  
- CSV/XLSX → lake + profile MD → ingest  
- ingest `code in (0, None)` → `get_engine().reload_bm25()` try/except  

### 5.7 로깅 (`app/main.py`)

- `RotatingFileHandler` 10MB×5 · `AI_SERVICE_LOG_FILE`  
- `train_pipeline.setup_logging()`의 `handlers.clear()` **이후** 재부착 · lifespan에서도 한 번 더  
- 이미 Rotating이 있으면 스킵 (`--reload` 중복 방지)

---

## 6. LangGraph 토폴로지

```text
START → route
          ├─ analytics → after → retrieve | generate
          └─ retrieve → gate → no_docs | generate | done
        → END
```

SSE는 동일 노드를 **수동 호출** (컴파일 그래프와 계약 동일).

---

## 7. 운영 체크리스트

Qdrant·포트: [`documents-watcher-qdrant.md`](./documents-watcher-qdrant.md) · ingest·스모크: [`secure-rag.md`](./secure-rag.md)

검증: 슬러리 SOP · `그럼 EDA…`(확장 오탐 없음) · 통계→analytics/RAG · SYS→replace · soft_fallback `max_score` · 핫리로드 로그.

---

## 8. 파일 인덱스

| 경로 | 역할 |
|------|------|
| `agent/rag_engine.py` · `doc_clearance.py` | Hybrid · clearance ACL · soft fallback · SelfQuery · `reload_bm25` |
| `agent/secure_llm/graph.py` | LangGraph · SSE · retrieve/generate/analytics |
| `agent/secure_llm/prompts.py` | 의도 RE · EXPLAIN/SUMMARY · finalize |
| `agent/secure_llm/llm.py` | vLLM 클라이언트 |
| `agent/api_llm/` | 클라우드 compose · predict/whatif · Public+Confidential RAG |
| `agent/analytics_engine.py` | csv_lake Polars |
| `agent/document_watcher.py` | 4등급 듀얼 엔진 · 핫리로드 트리거 |
| `ingest_secure.py` | chunk 400/50 · Qdrant rebuild · clearance 메타 |
| `app/main.py` | API · RotatingFileHandler |
| `scripts/rebuild_secure_rag_clean.py` | 클린 재인덱싱 |

---

## 9. 제약

- `fillThreshold` 개명 · 보안 채널 클라우드 폴백 · 가짜 CSV/outcome 금지  
- Guardrail C/D · Soft Fallback · SSE 버퍼 축소/삭제 금지  

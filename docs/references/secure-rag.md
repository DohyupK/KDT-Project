# 보안 탭 RAG (secure RAG)

최종 갱신: 2026-08-02 (3단계 chunk/min_score · soft fallback · SSE · analytics)

일반 Knowledge / 일반 `/chat` 과 **완전 분리**.  
경로: `SecurityChatbot` → `POST /api/security-chat/stream` (또는 JSON `/api/security-chat`) → `ai-service` → `compose_secure[_stream]` → analytics|retrieve → vLLM `:8001`.

운영·스택·이용 요약: [`security-chatbot-guide.md`](./security-chatbot-guide.md) · 기법 총정리: [`LLM 튜닝.md`](./LLM%20튜닝.md)

## 스택

| 단계 | 구현 |
|------|------|
| Orchestration | LangGraph `analytics`\|`retrieve` → `gate` → `generate` \| `no_docs` · SSE는 동일 노드 수동 실행 |
| Chunk / schema | LlamaIndex `SentenceSplitter` (**chunk_size=400**, **overlap=50**) |
| Dense | Qdrant `secure_docs` + `BAAI/bge-m3` (**CPU**) |
| Sparse | BM25 (`rank_bm25`, nodes in `data/secure_rag/bm25_nodes.json`) |
| Fusion | Reciprocal Rank Fusion (`k=60`) |
| Rerank | `BAAI/bge-reranker-v2-m3` CrossEncoder (**CPU**) · **doc당 최대 2청크** · soft fallback |
| Self-Query (A) | LI `VectorIndexAutoRetriever` 또는 `SECURE_SELF_QUERY=0` heuristic · unfiltered 재시도(C) 유지 |
| LLM | 로컬 vLLM only · 클라우드 폴백 **없음** |
| 빈 근거 | 모델 출력에 `[SYS_RAG_EMPTY_RESULT]` 포함 시 고정 문구 + `sources=[]` |

## 라우팅 정책 (2026-08-01)

- **자연 흐름:** 요약 의도여도 retrieve를 스킵하지 않음. 짧은 후속/요약어는 쿼리 확장; 0건이면 `prior_sources` 폴백; 주제 전환 0건은 `no_docs`.
- **출처:** LLM이 붙인 `[출처:]`를 지우고 실제 hits title만 강제 부착. 제어 토큰 시 출처·칩 제거.
- **요약:** RAG 발췌 + 단답형 suffix (`SECURE_GENERATE=1`). `=0`이면 extractive/compressed.

## 메타 스키마

`doc_id`, `title`, `category`, `process`, `security_level`(=`internal`), `source_path`, `chunk_index`

허용값:

- `category`: SOP · 매뉴얼 · 규정
- `process`: sintering · humidity · mixing · coating · lithium_input · metal_impurity

## Fixture (smoke)

모노레포 루트 `Documents/` — 6건 (구 `ai-service/data/secure_docs/`):

| doc_id | category | process |
|--------|----------|---------|
| sop-sintering-v1 | SOP | sintering |
| sop-humidity-v1 | 매뉴얼 | humidity |
| manual-mixing-v1 | 매뉴얼 | mixing |
| sop-coating-v1 | SOP | coating |
| rule-lithium-v1 | 규정 | lithium_input |
| manual-metal-v1 | 매뉴얼 | metal_impurity |

경로 오버라이드: `SECURE_DOCS_DIR` (기본 = `<repo>/Documents`).

## 환경 변수

모노레포 루트 `.env`에 설정 (패키지별 `.env` 없음):

```text
QDRANT_URL=http://127.0.0.1:6333
SECURE_QDRANT_COLLECTION=secure_docs
SECURE_DOCS_DIR=  # optional; default repo Documents/
SECURE_EMBED_MODEL=BAAI/bge-m3
SECURE_RERANK_MODEL=BAAI/bge-reranker-v2-m3
SECURE_RERANK_MIN_SCORE=0.15
CHAT_VLLM_BASE_URL=http://127.0.0.1:8001/v1
CHAT_VLLM_MODEL=<served-model-name>
```

## Ingest

```bash
# Qdrant Docker 예
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant

cd ai-service
# Full rebuild: deletes Qdrant collection then re-chunks (400/50) + embeds
python scripts/rebuild_secure_rag_clean.py
# 또는 (동일 run_ingest, 레거시 MD 정리 없음): python ingest_secure.py
#
# BM25 반영:
# - Documents 워처(`SECURE_DOCS_WATCH=1`) 자동 ingest → 서버 내 `reload_bm25()` 핫리로드 (재시작 불필요)
# - 터미널 CLI(`ingest_secure.py` / rebuild 스크립트)는 **별 프로세스** → ai-service(:8800) **재시작** 필요
```

문서: `Documents/*.{md,txt,pdf}` (`.md` YAML frontmatter, PDF는 선택 `*.meta.json` sidecar).

환경 (선택):

```text
SECURE_SELF_QUERY=0          # heuristic만 (느린 LM Studio 권장)
SECURE_GENERATE=0            # Gemma 호출 생략 · 문서 발췌+출처만 (관련 질의 500·빈 content 방지)
                             # gemma@q2_k 등 초소형 양자화는 chat/completions가 ""/"." 로 stop하는 경우 많음 → 0 유지
                             # 요약 LLM이 필요하면 채팅용 더 큰 모델 + SECURE_GENERATE=1
SECURE_VLLM_TIMEOUT=45       # SECURE_GENERATE=1 일 때 LLM 상한(초)
SECURE_DOCS_WATCH=1          # FastAPI lifespan dual-engine watcher
SECURE_DOCS_WATCH_DEBOUNCE=4.0  # coalesce bursts before convert/profile + ingest
# Tables: Documents CSV/XLSX → move ai-service/data/csv_lake/ → Documents/ai-service/*-profile.md
# Unstructured: PDF/TXT → Documents/ai-service/*.md → existing full ingest
SECURE_SELF_QUERY_TIMEOUT=20
SECURE_SELF_QUERY_MAX_TOKENS=256
# Chunk (ingest defaults): SentenceSplitter chunk_size=400 · overlap=50
# Retrieve defaults (`SecureRagEngine.retrieve` + `node_retrieve`): top_k=12 · rerank_top_n=6
# AI_SERVICE_LOG_FILE=logs/ai-service.log   # RotatingFileHandler 10MB × backup 5 (app/main.py)
```

## 가드레일 (필수) — SelfQuery 교체 후에도 유지

순정 Self-Query는 **과도 필터 시 unfiltered 재시도를 내장하지 않는다.**  
필터 생성(A)만 LI로 바꿔도, 아래 **외곽 orchestration**은 `retrieve()`에 그대로 둔다.

```text
A. 필터 생성 (VectorIndexAutoRetriever / heuristic 폴백)
B. hybrid (dense + BM25 + RRF) with filters
C. (필수) fused empty AND had_filters → unfiltered hybrid 1회
D. rerank + SECURE_RERANK_MIN_SCORE (기본 0.15) · soft fallback + max_score 로그
```

| 레이어 | 상태 |
|--------|------|
| A | **LI Self-Query** (`VectorIndexAutoRetriever`) · `llm_invoke=None` 또는 실패 시 heuristic |
| B | 유지 (hybrid) · 보안 챗 호출 `top_k=12` · `rerank_top_n=6` |
| **C** | **유지 · 제거 금지** |
| **D** | **유지 · 제거 금지** · diversify doc당 2 · soft fallback · `rerank_top_n=6` |

## 정책

- 검색 0건 → `사내 보안 문서에서 관련 정보를 찾을 수 없습니다.` (`mode=security_no_docs`) · vLLM 미호출
- 리랭크 점수 `< SECURE_RERANK_MIN_SCORE`(기본 0.15) 이면 히트 제외 · 전량 컷 시 fused 상위 1–2 soft fallback (`max_score` 로그)
- 히트 후 모델이 `[SYS_RAG_EMPTY_RESULT]`를 내면 → 고정 문구 · `sources=[]` (칩 없음)
- 정상 히트 답변 → `[출처: {title}]` 강제 · FE 클릭 시 청크 패널 (`doc_id` dedupe)
- Qdrant/엔진 실패 → offline 안내 (클라우드 폴백 없음)

## 듀얼 엔진 문서 유입

- PDF/TXT → `Documents/ai-service/*.md` → ingest
- CSV/XLSX → `ai-service/data/csv_lake/` + `Documents/ai-service/*-profile.md` → ingest
- Watch: `SECURE_DOCS_WATCH=1` · debounce `SECURE_DOCS_WATCH_DEBOUNCE`
- 옛 CSV **풀 테이블 MD**는 품질 오염 → `scripts/rebuild_secure_rag_clean.py`로 정리 후 재ingest

## API E2E 스모크

브라우저 없이 `sources[]` 패스스루 검증:

```bash
cd ai-service
python scripts/smoke_secure_rag_e2e.py
# optional Express:
# SMOKE_BACKEND_URL=http://127.0.0.1:3001 python scripts/smoke_secure_rag_e2e.py
```

기대:

| 케이스 | mode | sources |
|--------|------|---------|
| 소성 SOP 질의 | `security_rag` | ≥1, `text`/`title` 비어 있지 않음, reply에 `[출처:` |
| 점심 메뉴 | `security_no_docs` | `[]` |

vLLM 미기동 시 **가짜 성공 금지** — 스크립트가 FAIL.

## RCA 메모 (2026-07-30)

- FE 보안 전용 **180s** · BE `AbortSignal` · `SECURE_SELF_QUERY=0` 권장.
- **단계 진단:** 실패 시 챗에 `HTTP · stage · elapsed · trace` 표시 (뭉뚱그린「연결 실패」제거).
- **반드시 재시작:** 진단·타임아웃 코드 반영을 위해 **backend(:3001) · frontend · ai-service(:8800)** 모두 재기동.
- ai-service 콘솔: `[secure-chat] stage=...` / Express: `[security-chat] proxy_*`
- 수정 플랜: [`docs/plans/2026-07-30-secure-chat-timeout-selfquery.md`](../plans/2026-07-30-secure-chat-timeout-selfquery.md)

## 수동 Maximize 체크리스트

1. GlobalChatbot Maximize → SecurityChatbot fullscreen  
2. SOP 질의 → reply `[출처: …]` 링크  
3. 출처 클릭 → 청크 패널 텍스트 = API `sources[].text`

## 코드

- `agent/rag_engine.py`
- `agent/secure_graph.py`
- `agent/secure_llm.py` · `secure_prompts.py`
- `ingest_secure.py`
- `scripts/smoke_secure_rag_e2e.py`

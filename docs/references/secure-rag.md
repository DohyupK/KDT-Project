# 보안 탭 RAG (secure RAG)

최종 갱신: 2026-07-30 (Self-Query A + API E2E 스모크)

일반 Knowledge / 일반 `/chat` 과 **완전 분리**.  
경로: `SecurityChatbot` → `POST /api/security-chat` → `ai-service /security-chat` → LangGraph (`secure_graph`) → `rag_engine` + vLLM `:8001`.

## 스택

| 단계 | 구현 |
|------|------|
| Orchestration | LangGraph `retrieve` → `gate` → `generate` \| `no_docs` |
| Chunk / schema | LlamaIndex `SentenceSplitter` (ingest) |
| Dense | Qdrant `secure_docs` + `BAAI/bge-m3` (**CPU**) |
| Sparse | BM25 (`rank_bm25`, nodes in `data/secure_rag/bm25_nodes.json`) |
| Fusion | Reciprocal Rank Fusion (LlamaIndex QueryFusion과 동일 계열) |
| Rerank | `BAAI/bge-reranker-v2-m3` via SentenceTransformer CrossEncoder (**CPU**) |
| Self-Query (A) | LlamaIndex `VectorIndexAutoRetriever` + `VectorStoreInfo` (`category` / `process`) → vLLM OpenAI 호환 · 실패 시 heuristic · **cloud 폴백 없음** |
| LLM | 로컬 vLLM only · 클라우드 폴백 **없음** |

> llama-index-core에는 클래스명 `SelfQueryRetriever`가 없다. Self-Query 경로는 **`VectorIndexAutoRetriever.generate_retrieval_spec`** 이다. 필터만 뽑고, 검색(B)은 기존 hybrid에 둔다.

## 메타 스키마

`doc_id`, `title`, `category`, `process`, `security_level`(=`internal`), `source_path`, `chunk_index`

허용값:

- `category`: SOP · 매뉴얼 · 규정
- `process`: sintering · humidity · mixing · coating · lithium_input · metal_impurity

## Fixture (smoke)

`ai-service/data/secure_docs/` — 6건:

| doc_id | category | process |
|--------|----------|---------|
| sop-sintering-v1 | SOP | sintering |
| sop-humidity-v1 | 매뉴얼 | humidity |
| manual-mixing-v1 | 매뉴얼 | mixing |
| sop-coating-v1 | SOP | coating |
| rule-lithium-v1 | 규정 | lithium_input |
| manual-metal-v1 | 매뉴얼 | metal_impurity |

## 환경 변수

```text
QDRANT_URL=http://127.0.0.1:6333
SECURE_QDRANT_COLLECTION=secure_docs
SECURE_EMBED_MODEL=BAAI/bge-m3
SECURE_RERANK_MODEL=BAAI/bge-reranker-v2-m3
SECURE_RERANK_MIN_SCORE=0.05
CHAT_VLLM_BASE_URL=http://127.0.0.1:8001/v1
CHAT_VLLM_MODEL=<served-model-name>
```

## Ingest

```bash
# Qdrant Docker 예
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant

cd ai-service
python ingest_secure.py
# BM25는 서버 기동 시 로드 → ingest 후 ai-service(:8800) 재시작 권장
```

문서: `ai-service/data/secure_docs/*.md` (YAML frontmatter).

환경 (선택):

```text
SECURE_SELF_QUERY=0          # heuristic만 (느린 LM Studio 권장)
SECURE_GENERATE=0            # Gemma 호출 생략 · 문서 발췌+출처만 (관련 질의 500 방지)
SECURE_VLLM_TIMEOUT=45       # SECURE_GENERATE=1 일 때 LLM 상한(초)
SECURE_SELF_QUERY_TIMEOUT=20
SECURE_SELF_QUERY_MAX_TOKENS=256
```

## 가드레일 (필수) — SelfQuery 교체 후에도 유지

순정 Self-Query는 **과도 필터 시 unfiltered 재시도를 내장하지 않는다.**  
필터 생성(A)만 LI로 바꿔도, 아래 **외곽 orchestration**은 `retrieve()`에 그대로 둔다.

```text
A. 필터 생성 (VectorIndexAutoRetriever / heuristic 폴백)
B. hybrid (dense + BM25 + RRF) with filters
C. (필수) fused empty AND had_filters → unfiltered hybrid 1회
D. rerank + SECURE_RERANK_MIN_SCORE (기본 0.05)
```

| 레이어 | 상태 |
|--------|------|
| A | **LI Self-Query** (`VectorIndexAutoRetriever`) · `llm_invoke=None` 또는 실패 시 heuristic |
| B | 유지 (hybrid) |
| **C** | **유지 · 제거 금지** |
| **D** | **유지 · 제거 금지** |

## 정책

- 검색 0건 → `사내 보안 문서에서 관련 정보를 찾을 수 없습니다.` (`mode=security_no_docs`) · vLLM 미호출
- 리랭크 점수 `< SECURE_RERANK_MIN_SCORE`(기본 0.05) 이면 히트 제외 (환각 방지)
- 히트 시 답변에 `[출처: {title}]` 필수 · FE에서 클릭 시 청크 패널
- Qdrant/엔진 실패 → 기존 offline 안내 (클라우드 폴백 없음)

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

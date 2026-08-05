# 보안 챗 타임아웃 · Self-Query 수정 플랜

최종 갱신: 2026-07-30  
근거 RCA: 동일 일자 work-log 「보안 챗 장애 RCA 확정」 · 원인 분석 plan `secure_chat_rca`

상태: **구현 완료** (2026-07-30)

---

## RCA에서 확정된 사실

| 측정 | 값 | FE 60s 대비 |
|------|-----|-------------|
| Qdrant `secure_docs` | **points=6** | 인덱스 OK |
| 8800 리스너 | 단일 PID | OK |
| `CHAT_VLLM_MODEL` | `gemma` | OK |
| `smoke_secure_rag_e2e` | **SMOKE_PASS · ~104s** | **FE 타임아웃 초과** |
| 코팅 질의 `전극 슬러리 코팅 방법을 알려줘` | **sources=1 (`sop-coating-v1`)** · generate `Request timed out.` → `mode=template` offline · **~123s** | **검색 OK · 생성 실패** |

결론:

1. **연결 실패 + LM Studio GEN** = Self-Query/답변 생성이 `:8001`에서 오래 돌고, FE axios **60s**가 먼저 끊김 (또는 generate 120s 타임아웃 → offline).
2. **「문서 검색 안 됨」** (코팅 질의): 인덱스가 비어서가 **아님**. 검색은 `sop-coating-v1` 히트. UI의 `security_no_docs`는 다른 타이밍/질의이거나, 타임아웃·재시도 부작용으로 분리해서 볼 것.

---

## 수정 목표 (구현 시)

FE가 끊기기 전에 (또는 사용자에게 진행 중임을 알리며) 보안 RAG+로컬 LLM이 끝나게 하고, Self-Query가 LM을 장문 점유하지 않게 한다.

### 1. FE 타임아웃 상향 (필수)

- 파일: [`frontend/src/api/axios.ts`](../../frontend/src/api/axios.ts) 또는 security 전용 클라이언트
- **보안 챗만** `timeout: 180_000` (또는 240_000) — 일반 `/chat` 60s 유지 권장
- [`securityChatApi.ts`](../../frontend/src/api/securityChatApi.ts)에서 별도 axios instance / `timeout` 오버라이드

### 2. BE 프록시 타임아웃 명시 (필수)

- 파일: [`backend/src/routes/securityChat.ts`](../../backend/src/routes/securityChat.ts)
- `fetch`에 `AbortSignal.timeout(180_000)` (FE와 맞춤)
- 타임아웃 시 502/504 + 명확한 `error` 문자열 (모호한 500 최소화)

### 3. Self-Query LM 호출 억제 (필수)

- 파일: [`ai-service/agent/rag_engine.py`](../../ai-service/agent/rag_engine.py)
- LlamaIndex OpenAI에 **`max_tokens` ≤ 256** (필터 JSON만)
- Self-Query **timeout 짧게** (예: 15–20s) → 실패 시 즉시 `_heuristic_filters`
- (권장) env `SECURE_SELF_QUERY=0` 이면 LLM Self-Query 생략, heuristic만 (스모크·저사양)

### 4. Generate 타임아웃 · 메시지 (권장)

- [`secure_llm.py`](../../ai-service/agent/secure_llm.py) / graph: generate timeout을 FE보다 짧게 두되, 히트가 있으면 offline 문구에 **「문서 히트는 있으나 로컬 LLM 시간 초과」** 구분 (지금은 sources가 있어도 offline 템플릿 → 사용자에게 “검색 실패”로 오해됨)
- 또는 generate 실패 시에도 `[출처:]` + 청크 요약 폴백 (제품 정책 확인 후)

### 5. ingest 후 BM25 (권장)

- ingest 끝에서 문서화: **ai-service 재시작** 또는 `reload_bm25_nodes` HTTP 훅
- [`secure-rag.md`](../references/secure-rag.md)에 한 줄

### 6. 스모크 확장 (권장)

- `smoke_secure_rag_e2e.py`에 코팅 질의 케이스: `doc_id=sop-coating-v1` 기대
- 스크립트에 wall-clock 초 출력 → FE 타임아웃 회귀 감지

---

## 비범위

- LM Studio/Gemma 양자화·Parallel 튜닝 (운영 가이드만)
- Playwright Maximize E2E
- min_score 변경 (코팅 히트 확인됨 · 유지 0.05)

---

## 구현 순서 (다음 Agent 작업)

1. FE security timeout 180s + BE AbortSignal  
2. Self-Query `max_tokens` + short timeout + heuristic 폴백 강화  
3. generate 실패 시 응답 문구 구분 (sources>0 vs 0)  
4. 코팅 스모크 + work-log 측정  
5. direction / secure-rag 한 줄 갱신  

예상 검증: 코팅 질의 `mode=security_rag` · FE에서 연결 실패 없음 (로컬 LLM 속도에 따라 수 분 걸릴 수 있음 → 180s 안에서 끝나는지 확인).

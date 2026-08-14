# 보안·일반 챗봇 가이드 (이용 · 라우팅)

최종 갱신: 2026-08-15

챗봇 **두 계열**의 UI·API·라우팅.  
RAG 동작·가드레일: [`secure-rag.md`](./secure-rag.md) · 기본값·env·모듈: [`LLM 튜닝.md`](./LLM%20튜닝.md) · vLLM 기동: [`vllm-setup.md`](./vllm-setup.md) · 포트: [`documents-watcher-qdrant.md`](./documents-watcher-qdrant.md)

---

## 1. 챗봇 두 계열

| | 일반 챗 | 보안 챗 |
|--|---------|---------|
| UI | `GlobalChatbot` (셸 플로팅) | `/security` · Maximize → `SecurityChatbot` |
| API | `POST /api/chat` → ai-service `/chat` | `POST /api/security-chat/stream` (SSE) · JSON `/api/security-chat` 병행 |
| LLM | 보안 탭 등록 키 (Groq/Gemini 등) · Auto/수동 | **로컬만** `CHAT_VLLM_*` (:8001) · **클라우드 폴백 없음** |
| 지식 | 일반 Knowledge / 도구(predict·whatif) | **Secure RAG** (`Documents/` → Qdrant `secure_docs`). 컬렉션 없으면 LLM 미호출 · ingest는 최초만 → [`documents-watcher-qdrant.md`](./documents-watcher-qdrant.md) §6 |
| 멀티턴 | MariaDB 스레드 (채널 구분) | 동일 DB · `channel=security` |

엔드포인트 목록: [`ai-service-feature-catalog.md`](./ai-service-feature-catalog.md)

---

## 2. 라우팅

```text
일반 메시지
  → POST /api/chat
  → (비보안) ai-service /chat → predict → Groq/Gemini

보안 키워드 포함 (일반 챗)
  → POST /api/chat
  → mode=security_redirect, ai-service 미호출
  → 「보안 탭(/security) 이용」안내

보안 탭 메시지
  → POST /api/security-chat/stream  (± JSON /api/security-chat)
  → ai-service /security-chat/stream
  → Secure RAG + 로컬 vLLM (:8001)
  → 실패 시 아래 상수 (클라우드 폴백 없음)
```

플로팅 `GlobalChatbot`의 「보안 상담」은 `router.push`가 아니라 `history.pushState('/security')`. `/main` 등 현재 페이지는 유지되고 주소만 바뀐다. 「일반 상담」은 직전 경로로 복원. `popstate`로 모드 동기화. `AppShell` `PageChatRouteReset`은 `/security` 출입 때 일반 챗 컨텍스트를 지우지 않는다.

앱 코드는 HuggingFace `transformers`로 모델을 로드하지 않는다. HF에서 받아 vLLM에 올린 뒤 연결한다.

| 조건 | 상수 (`prompts.py`) | 의미 |
|------|---------------------|------|
| Qdrant `secure_docs` 없음 · RAG 엔진 실패 | `RAG_NOT_READY_REPLY` | **vLLM 미호출.** ingest는 최초만 → [`documents-watcher-qdrant.md`](./documents-watcher-qdrant.md) §6 |
| `:8001` 연결 실패 | `OFFLINE_REPLY` | 이 PC vLLM · Lightsail이면 SSH `-R` 터널 |
| RAG 히트 후 LLM 타임아웃 | `HIT_BUT_LLM_TIMEOUT_REPLY` | 모델 부하 · `SECURE_VLLM_TIMEOUT` |

---

## 3. 디렉터리

| 경로 | 역할 |
|------|------|
| `frontend/src/app/(shell)/security/page.tsx` | 보안 탭 페이지 |
| `frontend/src/components/chat/SecurityChatbot.tsx` | 보안 챗봇 (SSE · 출처 칩) |
| `frontend/src/api/securityChatApi.ts` | `POST /api/security-chat` · `/stream` |
| `frontend/src/components/chat/GlobalChatbot.tsx` | 일반 챗 (보안 키워드 → redirect) |
| `backend/src/services/securityGate.ts` | 키워드 게이트 |
| `backend/src/routes/securityChat.ts` | 보안 프록시 (disconnect abort) |
| `ai-service/agent/secure_llm/` | LangGraph · vLLM compose |
| `ai-service/agent/api_llm/` | 일반 챗 · Public/Confidential RAG |

코드 경로 표: [`important-paths.md`](./important-paths.md)

---

## 4. 기동

루트 README [로컬 실행](../../README.md#로컬-실행--챗봇-터미널-3개) · 포트·Qdrant: [`documents-watcher-qdrant.md`](./documents-watcher-qdrant.md)

- CWD는 항상 `ai-service/`
- Health: `GET http://127.0.0.1:8800/health` · OpenAPI: `:8800/docs`
- ingest·스모크: [`secure-rag.md`](./secure-rag.md)
- env 표: [`LLM 튜닝.md`](./LLM%20튜닝.md) §4
- 학습(승인 후): `train_pipeline.py` · `train_reg_pipeline.py` · `train_residual_pipeline.py`

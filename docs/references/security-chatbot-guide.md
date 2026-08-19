# 보안·일반 챗봇 가이드 (이용 · 라우팅)

최종 갱신: 2026-08-19

**사용자(기능 따라 하기):** [일반 상담](../guides/general-chatbot-user.md) · [보안 상담](../guides/security-chatbot-user.md)

챗봇 **두 계열**의 UI·API·라우팅.  
**운영(누가 무엇을 켜나):** [`aws-pc-security-worker.md`](../guides/aws-pc-security-worker.md)  
RAG 동작·가드레일: [`secure-rag.md`](./secure-rag.md) · 기본값·env·모듈: [`LLM 튜닝.md`](./LLM%20튜닝.md) · vLLM 기동: [`vllm-setup.md`](./vllm-setup.md) · 포트: [`documents-watcher-qdrant.md`](./documents-watcher-qdrant.md)

---

## 1. 챗봇 두 계열

| | 일반 챗 | 보안 챗 |
|--|---------|---------|
| UI | `GlobalChatbot` 플로팅 · 「일반 상담」 | 같은 챗봇 · 「보안 상담」 (`SecurityChatbot` 임베드). `/security` 는 페이지가 아님 |
| API | `POST /api/chat` → ai-service `/chat` | `POST /api/security-chat/stream` → AWS는 **질문만 DB에 넣음** |
| LLM | 설정에 등록한 키 (Groq/Gemini 등) | **이 PC 워커** + vLLM `:8001`. AWS는 `:8001`을 안 침. 클라우드 폴백 없음 |
| 지식 | 일반 Knowledge / 도구(predict·whatif) | PC 워커가 Qdrant `secure_docs` 검색. ingest 최초만 → [`documents-watcher-qdrant.md`](./documents-watcher-qdrant.md) §6 |
| 멀티턴 | `USER_CHAT_*` (`channel=general`) | `USER_SECURITY_THREADS` · `USER_SECURITY_MESSAGES` |

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
  → 「챗봇에서 보안 상담」안내

보안 상담 메시지
  → POST /api/security-chat/stream
  → AWS: USER_SECURITY_MESSAGES INSERT user status=pending
  → 이 PC 워커: 검색 + vLLM → INSERT assistant
  → AWS UI: SSE replace/done 또는 GET messages 폴링 (먼저 오는 쪽)
```

`/security` URL은 오버레이를 열고 `/main`으로 보낸다. 「보안 상담」은 `setChatMode('secure')`만 (pushState 없음).

앱 코드는 HuggingFace `transformers`로 채팅 모델을 로드하지 않는다.

## 2.1 기동 명령 (AWS / 이 PC)

절차 전체: [`aws-pc-security-worker.md`](../guides/aws-pc-security-worker.md).

| 어디서 | 명령 | 하는 일 |
|--------|------|---------|
| AWS Lightsail | `npm run dev` | ai + backend + frontend. **보안 워커 안 켬** |
| 이 PC | `npm run security-pc` | vLLM `:8001` 확인 · `ssh -L 3306`+`6333` · 워커. **프론트 안 켬** |

vLLM `:8001`은 이미 켜 둘 것. 키·호스트:

```powershell
npm run security-pc -- -KeyPath "키.pem" -PublicHost "<Lightsail공인IP>"
```

또는 `.env` `SECURITY_PC_KEY_PATH` · `SECURITY_PC_PUBLIC_HOST`. 이 PC `.env`는 터널이 열린 동안 `DB_HOST=127.0.0.1`, `QDRANT_URL=http://127.0.0.1:6333`. AWS `.env`와 섞지 말 것.

Qdrant·MariaDB가 이 PC면 `-KeyPath` 생략. DDL: `python DB/ai-service/apply_user_security_tables.py` (승인 후).

| 조건 | 상수 (`prompts.py`) / 큐 | 의미 |
|------|-------------------------|------|
| Qdrant `secure_docs` 없음 | `RAG_NOT_READY_REPLY` | 워커가 검색 실패. ingest 한 번 → §6 |
| `:8001` 연결 실패 | `OFFLINE_REPLY` | 이 PC vLLM |
| 워커 미기동 · 대기 초과 | `WORKER_UNAVAILABLE_REPLY` | `run_security_worker.py` |
| RAG 히트 후 LLM 타임아웃 | `HIT_BUT_LLM_TIMEOUT_REPLY` | `SECURE_VLLM_TIMEOUT` |

---

## 3. 디렉터리

| 경로 | 역할 |
|------|------|
| `frontend/src/app/(shell)/security/page.tsx` | 오버레이 열고 `/main`으로 보냄 |
| `frontend/src/components/chat/SecurityChatbot.tsx` | 보안 챗 UI (SSE + GET messages 폴링) |
| `frontend/src/api/securityChatApi.ts` | `POST /api/security-chat` · `/stream` |
| `frontend/src/components/chat/GlobalChatbot.tsx` | 플로팅 · 일반/보안 탭 |
| `backend/src/services/securityGate.ts` | 키워드 게이트 |
| `backend/src/routes/securityChat.ts` | 보안 프록시 |
| `ai-service/agent/security_queue_store.py` | `USER_SECURITY_*` |
| `ai-service/scripts/run_security_worker.py` | PC 워커 |
| `scripts/security-pc.ps1` | `npm run security-pc` (`:8001` 확인 · 선택 `-L 3306`/`6333` · 워커) |
| `ai-service/agent/secure_llm/` | 워커가 쓰는 LangGraph · vLLM |
| `ai-service/agent/api_llm/` | 일반 챗 · Public/Confidential RAG |

코드 경로 표: [`important-paths.md`](./important-paths.md)

---

## 4. 기동

루트 README [로컬 실행](../../README.md#로컬-실행--챗봇-터미널-3개) · 포트·Qdrant: [`documents-watcher-qdrant.md`](./documents-watcher-qdrant.md)

- CWD는 항상 `ai-service/` (워커 스크립트는 루트 `.env`를 읽음)
- Health: `GET http://127.0.0.1:8800/health` · OpenAPI: `:8800/docs`
- ingest·스모크: [`secure-rag.md`](./secure-rag.md)
- env 표: [`LLM 튜닝.md`](./LLM%20튜닝.md) §4
- 학습(승인 후): `train_pipeline.py` · `train_reg_pipeline.py` · `train_residual_pipeline.py`

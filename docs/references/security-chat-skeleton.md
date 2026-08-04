# 보안 챗봇 · 디렉터리·라우팅

일자: 2026-07-24  
상태: **보안 탭 ↔ vLLM 통신망 구현** (모델/vLLM 기동은 수동 — [`vllm-setup.md`](./vllm-setup.md))

일반 챗봇(GlobalChatbot)은 Groq/Gemini compose를 쓰고,  
보안·기밀 키워드가 들어오면 **일반 채널 LLM을 호출하지 않고** `/security`로 안내한다.  
보안 탭은 **로컬 vLLM만** 사용한다 (외부 API 폴백 없음).

---

## 디렉터리 지도

| 경로 | 역할 |
|------|------|
| [`frontend/src/app/(shell)/security/page.tsx`](../../frontend/src/app/(shell)/security/page.tsx) | 보안 탭 페이지 |
| [`frontend/src/components/chat/SecurityChatbot.tsx`](../../frontend/src/components/chat/SecurityChatbot.tsx) | 보안 전용 챗봇 |
| [`frontend/src/api/securityChatApi.ts`](../../frontend/src/api/securityChatApi.ts) | `POST /api/security-chat` |
| [`frontend/src/components/chat/GlobalChatbot.tsx`](../../frontend/src/components/chat/GlobalChatbot.tsx) | 일반 챗봇 (보안 키워드 → redirect) |
| [`backend/src/services/securityGate.ts`](../../backend/src/services/securityGate.ts) | 키워드 게이트 |
| [`backend/src/routes/securityChat.ts`](../../backend/src/routes/securityChat.ts) | 보안 프록시 |
| [`ai-service/agent/secure_llm/llm.py`](../../ai-service/agent/secure_llm/llm.py) | vLLM only compose |
| `CHAT_VLLM_BASE_URL` | 기본 `http://127.0.0.1:8001/v1` |

---

## 라우팅 규칙

```text
일반 메시지
  → POST /api/chat
  → (비보안) ai-service /chat → predict → Groq/Gemini

보안 키워드 포함 (일반 챗)
  → POST /api/chat
  → mode=security_redirect, ai-service 미호출
  → 「보안 탭(/security) 이용」안내

보안 탭 메시지
  → POST /api/security-chat
  → ai-service POST /security-chat
  → ChatOpenAI → CHAT_VLLM_BASE_URL (:8001)
  → 실패 시 offline template (클라우드 폴백 없음)
```

---

## 정책

- 보안 탭용 모델은 **앱 안에서 학습·transformers 로드하지 않는다.**
- HF에서 받아 vLLM에 올린 뒤 연결한다 ([`vllm-setup.md`](./vllm-setup.md)).
- Login / MariaDB 정식 연동은 **백로그 홀딩** (이번 스프린트 제외).

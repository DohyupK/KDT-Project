# 보안 챗봇 · 디렉터리·라우팅 골격

일자: 2026-07-23  
상태: **placeholder만** (vLLM 실호출·실 UI 미구현)

일반 챗봇(GlobalChatbot)은 OpenAI / Gemini / NVIDIA API compose를 쓰고,  
보안·기밀 키워드가 들어오면 **LLM을 호출하지 않고** `/security`로 안내한다.

---

## 디렉터리 지도

| 경로 | 역할 |
|------|------|
| [`frontend/src/app/(shell)/security/page.tsx`](../../frontend/src/app/(shell)/security/page.tsx) | 보안 탭 placeholder 페이지 |
| [`frontend/src/components/chat/SecurityChatbot.tsx`](../../frontend/src/components/chat/SecurityChatbot.tsx) | 보안 전용 챗봇 stub |
| [`frontend/src/components/chat/GlobalChatbot.tsx`](../../frontend/src/components/chat/GlobalChatbot.tsx) | 일반 챗봇 (보안 키워드 → redirect) |
| [`backend/src/services/securityGate.ts`](../../backend/src/services/securityGate.ts) | 키워드 게이트 |
| `ai-service` `CHAT_VLLM_BASE_URL` | 이후 보안 채널 전용 (일반 `/chat` compose에서는 **미사용**) |

---

## 라우팅 규칙

```text
일반 메시지
  → POST /api/chat (Express)
  → (비보안) ai-service /chat → predict → LLM priority failover

보안 키워드 포함 메시지
  → POST /api/chat
  → mode=security_redirect, LLM/ai-service 미호출
  → 「보안 탭(/security) 이용」안내
```

---

## 이후 vLLM 연결 시 (미구현 · 할 일)

**정책:** 보안 탭용 모델은 **직접 학습·제작하지 않는다.**  
다른 사람이 만든(또는 공개) 모델을 가져와 vLLM에 올린 뒤 연결한다.

1. 외부 모델 확보 → 로컬(또는 서버) vLLM OpenAI-compatible 기동  
2. `CHAT_VLLM_BASE_URL` 설정  
3. `SecurityChatbot`에서 해당 endpoint만 호출  
4. 일반 `CHAT_LLM_PRIORITY` 프로바이더는 보안 탭에서 사용 금지  
5. (선택) `POST /api/chat/secure` 또는 ai-service `channel=secure` 분리  

환경 변수 예시: [`ai-service/.env.example`](../../ai-service/.env.example)

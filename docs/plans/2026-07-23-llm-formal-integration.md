# LLM 정식 연동 · 보안 게이트 · 세션 가이드

일자: 2026-07-23  
상태: 구현 반영 (키·DB 기동·패키지 설치는 로컬 환경에서)

관련:

- [`docs/references/security-chat-skeleton.md`](../references/security-chat-skeleton.md)
- [`docs/plans/2026-07-23-chatbot-integration.md`](./2026-07-23-chatbot-integration.md)

## 요약

| 층 | 내용 |
|----|------|
| ai-service | `agent/llm.py` — `CHAT_LLM_PRIORITY` failover (openai → gemini → nvidia), `need_guideline`, `provider` |
| backend | Express `:3001` + MariaDB 세션, 보안 키워드 redirect, 유사 3회 가이드, ai-service 프록시 |
| frontend | `POST /api/chat` + `session_id`, `/security` placeholder |

## 실행 (터미널 3개)

1. MariaDB 스키마: `DB/chat_schema.sql`
2. `ai-service` uvicorn `:8800` (next.config `/ai`와 동일)
3. `backend` `npm run dev` `:3001`
4. `frontend` `npm run dev` `:3000`

# 중요 경로 · 참조

## 모노레포

| 경로 | 설명 |
|------|------|
| `frontend/` | Next.js UI |
| `backend/` | Express + MariaDB (챗 세션 · 보안 게이트 · 프록시) |
| `ai-service/` | ML 진단 · FastAPI · 챗봇 Agent |
| `docs/` | 방향·일지·계획 |
| `docs/plans/2026-07-23-chatbot-integration.md` | AI 챗봇·연동 작업서 (경로 지도) |
| `docs/plans/2026-07-23-llm-formal-integration.md` | LLM 정식 연동 · 보안 · 세션 |
| `docs/references/issue-lot-api.md` | Issue/LOT/과거 자료 API |
| `AGENTS.md` | 전체 공통 규칙 |
| `.cursor/rules/` | 전체·개별 룰 (`ask-before-run.mdc` 포함) |

## Frontend

| 경로 | 설명 |
|------|------|
| `frontend/src/app/(shell)/main/page.tsx` | Main 모니터링 (챗봇은 AppShell 전역) |
| `frontend/src/app/(shell)/security/page.tsx` | 보안 탭 placeholder |
| `frontend/src/components/chat/GlobalChatbot.tsx` | Shell 전역 AI 챗봇 (`POST /api/chat`) |
| `frontend/src/components/chat/SecurityChatbot.tsx` | 보안 챗봇 stub (vLLM 이후) |
| `frontend/src/api/aiApi.ts` | `POST /api/chat` + `session_id`; `/ai` health |
| `frontend/src/types/index.ts` | `AppData.fillThreshold` — 이름 변경 금지 |
| `frontend/src/api/axios.ts` | `baseURL: '/api'` (backend) |
| `frontend/src/components/layout/UserAuthMenu.tsx` | 헤더 로그인/프로필 · 로그아웃 |
| `frontend/src/components/layout/PersonalInfoModal.tsx` | 내 정보 팝업 (프로필 API) |
| `frontend/next.config.ts` | `/api` → `:3001`; `/ai` → `127.0.0.1:8800` |

## backend

| 경로 | 설명 |
|------|------|
| `backend/src/index.ts` | Express listen `:3001` |
| `backend/src/routes/chat.ts` | `POST /api/chat` |
| `backend/src/services/securityGate.ts` | 보안 키워드 → redirect |
| `backend/src/services/similarity.ts` | 유사 질문 ≥ 3 → guideline |
| `DB/schema.sql` | `users` / settings / lots / issues / handover |
| `DB/chat_schema.sql` | `chat_sessions` / `chat_messages` |
| `DB/data/*.sqlite` | chat / control / llm_keys 런타임 SQLite |

## ai-service

| 경로 | 설명 |
|------|------|
| `ai-service/AGENTS.md` | 챗봇·ML 1차 참고서 |
| `ai-service/train_pipeline.py` | `train_model` / `predict` |
| `ai-service/data/cathode_clf_data.csv` | clf 학습 CSV (O/X) |
| `ai-service/data/cathode_reg_data.csv` | reg 학습 CSV (capacity mAh/g) |
| `ai-service/models/` | clf 산출 + `reg/` + `registry.json` (ready 헤드) |
| `ai-service/app/` | FastAPI (`/health`, `/predict`, `/predict-capacity`, `/chat`) |
| `ai-service/agent/` | LangGraph · `model_registry` · tools · LLM |
| `ai-service/agent/model_registry.py` | registry ready 헤드 일괄 실행 (확장 포인트) |
| `ai-service/.env.example` | CHAT_USE_LLM · vLLM (회사 API 키 없음) |
| `docs/references/cathode-clf-schema.md` | clf CSV 스키마 |
| `docs/references/cathode-reg-schema.md` | reg CSV 스키마 |
| `docs/prompts/train-pipeline-ox-classifier.md` | clf 학습 프롬프트 |

## 문서

| 경로 | 설명 |
|------|------|
| `docs/direction.md` | 현재 작업 방향 |
| `docs/work-log/` | 날짜별 상세 |
| `docs/plans/` | 확정 계획 |

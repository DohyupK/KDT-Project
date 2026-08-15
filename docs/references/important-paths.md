# 중요 경로 · 참조

코드 위치만. 문서 목록은 [`catalog.md`](../catalog.md).

## 모노레포

| 경로 | 설명 |
|------|------|
| `frontend/` | Next.js UI |
| `backend/` | Express + MariaDB (챗 세션 · 보안 게이트 · 프록시) |
| `ai-service/` | ML 진단 · FastAPI · 챗봇 Agent |
| `docs/` | 방향·일지·구현 명세 |
| `AGENTS.md` | 전체 공통 규칙 |
| `.cursor/rules/kdt-project.mdc` | 전체 룰 |
| `.cursor/rules/frontend-ui.mdc` | 프론트 UI |
| `.cursor/skills/project-control/` | 조율 스킬 |

## Frontend

| 경로 | 설명 |
|------|------|
| `frontend/src/app/(shell)/main/page.tsx` | Main 모니터링 (챗봇은 AppShell 전역) |
| `frontend/src/app/(shell)/security/page.tsx` | `/security` → 오버레이 보안 상담 후 `/main` |
| `frontend/src/components/chat/GlobalChatbot.tsx` | Shell 전역 AI 챗봇 (`POST /api/chat`) |
| `frontend/src/components/chat/SecurityChatbot.tsx` | 보안 챗봇 (SSE · PC 워커 큐) |
| `frontend/src/api/aiApi.ts` | `POST /api/chat` + `session_id`; `/ai` health |
| `frontend/src/api/securityChatApi.ts` | `POST /api/security-chat` · `/stream` |
| `frontend/src/types/index.ts` | `AppData.fillThreshold` — 이름 변경 금지 |
| `frontend/src/api/axios.ts` | `baseURL: '/api'` (backend) |
| `frontend/src/components/layout/UserAuthMenu.tsx` | 헤더 로그인/프로필 · 로그아웃 |
| `frontend/src/components/layout/PersonalInfoModal.tsx` | 내 정보 팝업 (프로필 API) |
| `frontend/next.config.ts` | `/api` → `:3001`; `/ai` → `127.0.0.1:8800`; `allowedDevOrigins` (공인 IP `next dev`) |
| `frontend/src/proxy.ts` | 개발 요청 추적 (`[dev-proxy]`) |
| `deploy/nginx-kdt.conf` | :80 → :3000. HMR만 `Connection upgrade` |

## backend

| 경로 | 설명 |
|------|------|
| `backend/src/index.ts` | Express listen `:3001` |
| `backend/src/routes/chat.ts` | `POST /api/chat` |
| `backend/src/routes/securityChat.ts` | 보안 프록시 |
| `backend/src/services/securityGate.ts` | 보안 키워드 → redirect |
| `backend/src/services/similarity.ts` | 유사 질문 ≥ 3 → guideline |
| `backend/src/routes/issue.routes.ts` | 이슈 · LOT · Knowledge |
| `backend/src/routes/dashboard.routes.ts` | 대시보드 API |
| `DB/schema.sql` | `users` / settings / lots / issues / handover |
| `DB/chat_schema.sql` | 레거시 `chat_sessions` / `chat_messages` |
| `DB/ai-service/` | `user_chat_*` 적용 스크립트 |
| `DB/data/*.sqlite` | control / llm_keys 런타임 SQLite |
| `frontend/plant_feeder_live.py` | `SPC_LOT` / `SPC_LOT_results` 피더 |

## ai-service

| 경로 | 설명 |
|------|------|
| `ai-service/AGENTS.md` | 챗봇·ML 1차 참고서 |
| `ai-service/train_pipeline.py` | clf 학습 · `predict` |
| `ai-service/train_reg_pipeline.py` | capacity 학습 |
| `ai-service/train_residual_pipeline.py` | residual 학습 |
| `ai-service/voting_predict.py` | `POST /predict-voting` |
| `ai-service/data/cathode_clf_data.csv` | clf 학습 CSV (O/X) |
| `ai-service/data/cathode_reg_data.csv` | reg 학습 CSV (capacity mAh/g) |
| `ai-service/models/` | `voting/` · `legacy/` · `registry.json` |
| `ai-service/app/` | FastAPI (`/health`, `/predict*`, `/chat`, `/security-chat`) |
| `ai-service/agent/` | LangGraph · `model_registry` · tools · LLM |
| `ai-service/agent/security_queue_store.py` | `USER_SECURITY_*` |
| `ai-service/scripts/run_security_worker.py` | PC 보안 워커 |
| `scripts/security-pc.ps1` | `npm run security-pc` (vLLM 확인 · 선택 `-L 3306`/`6333` · 워커) |
| `ai-service/agent/model_registry.py` | registry ready 헤드 일괄 실행 |
| 루트 `.env` (gitignore) | CHAT_USE_LLM · vLLM · DB_* · JWT 등 (시크릿 미커밋) |

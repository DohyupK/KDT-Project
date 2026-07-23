# 중요 경로 · 참조

## 모노레포

| 경로 | 설명 |
|------|------|
| `frontend/` | Next.js UI |
| `backend/` | Express + MariaDB (후순위) |
| `ai-service/` | ML 진단 · FastAPI · 챗봇 Agent |
| `docs/` | 방향·일지·계획 |
| `docs/plans/2026-07-23-chatbot-integration.md` | **AI 챗봇·연동 작업서 (경로 지도)** |
| `AGENTS.md` | 전체 공통 규칙 |
| `.cursor/rules/` | 전체·개별 룰 (`ask-before-run.mdc` 포함) |

## Frontend

| 경로 | 설명 |
|------|------|
| `frontend/src/app/(shell)/main/page.tsx` | Main 모니터링 (챗봇은 AppShell 전역) |
| `frontend/src/components/chat/GlobalChatbot.tsx` | Shell 전역 AI 챗봇 (`POST /ai/chat`) |
| `frontend/src/api/aiApi.ts` | ai-service 클라이언트 (`baseURL: '/ai'`) |
| `frontend/src/types/index.ts` | `AppData.fillThreshold` — 이름 변경 금지 |
| `frontend/src/api/axios.ts` | `baseURL: '/api'` (backend) |
| `frontend/next.config.ts` | `/api` → `:3001`; `/ai` → `127.0.0.1:8000` |

## ai-service

| 경로 | 설명 |
|------|------|
| `ai-service/AGENTS.md` | 챗봇·ML 1차 참고서 |
| `ai-service/train_pipeline.py` | `train_model` / `predict` |
| `ai-service/data/cathode_clf_data.csv` | 학습 CSV |
| `ai-service/models/` | **최종 모델** (xgb/cat/encoder/imputer/metadata/SHAP) |
| `ai-service/app/` | FastAPI (`/health`, `/predict`, `/chat`) |
| `ai-service/agent/` | LangGraph 챗봇 |
| `docs/references/cathode-clf-schema.md` | CSV 스키마 |
| `docs/prompts/train-pipeline-ox-classifier.md` | 학습 프롬프트 |

## 문서

| 경로 | 설명 |
|------|------|
| `docs/direction.md` | 현재 작업 방향 |
| `docs/work-log/` | 날짜별 상세 |
| `docs/plans/` | 확정 계획 |

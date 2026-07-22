# 중요 경로 · 참조

## 모노레포

| 경로 | 설명 |
|------|------|
| `frontend/` | Next.js UI |
| `backend/` | Express + MariaDB (예정) |
| `ai-service/` | AI 서비스 (예정) |
| `docs/` | 프로젝트 전체 방향·일지·계획 |
| `AGENTS.md` | 전체 공통 규칙 요약 |
| `.cursor/rules/` | 전체·개별 룰 |
| `.cursor/skills/` | Cursor 스킬 |
| `.agents/skills/` | Codex/에이전트 스킬 |

## Frontend

| 경로 | 설명 |
|------|------|
| `frontend/src/app/**/page.tsx` | App Router 페이지 |
| `frontend/src/types/index.ts` | `AppData.fillThreshold` — 이름 변경 금지 |
| `frontend/src/api/axios.ts` | `baseURL: '/api'` |
| `frontend/next.config.ts` | `/api` → `localhost:3001` rewrites |

## ai-service (1단계 O/X)

| 경로 | 설명 |
|------|------|
| `ai-service/AGENTS.md` | 챗봇·AI 모델 작업 시 1차 참고서 |
| `ai-service/data/cathode_clf_data.csv` | 학습 CSV (계약: `docs/references/cathode-clf-schema.md`) |
| `ai-service/models/` | 학습 산출물 (모델·imputer·metadata·SHAP) |
| `ai-service/train_pipeline.py` | 학습·`predict` (구현 예정) |
| `docs/prompts/train-pipeline-ox-classifier.md` | 보강된 구현 프롬프트 |

## 문서

| 경로 | 설명 |
|------|------|
| `docs/direction.md` | 현재 작업 방향 (전체) |
| `docs/work-log/` | 날짜별 상세 |
| `docs/plans/` | 확정 계획 |
| `docs/references/cathode-clf-schema.md` | O/X CSV 스키마·타깃 인코딩 |

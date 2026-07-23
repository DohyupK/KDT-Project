# AI 챗봇 · 연동 작업서

일자: 2026-07-23  
상태: ML 진단(1단계) 완료 → FastAPI/`predict` API 착수 → 챗봇 → Main UI 연동

이 문서는 **경로를 헷갈리지 않고** 따라가기 위한 전체 작업서다.  
상세 일지: [`docs/work-log/2026-07-23.md`](../work-log/2026-07-23.md)  
AI 참고: [`ai-service/AGENTS.md`](../../ai-service/AGENTS.md)

---

## 1. 스택에서의 현재 위치

```text
Polars → ML(XGBoost+CatBoost) → LangGraph → LLM → FastAPI/프론트
         ▲ 여기까지 완료            ▲ 다음              ▲ UI는 목업만
```

| 단계 | 상태 | 핵심 경로 |
|------|------|-----------|
| Polars 전처리 + O/X 학습 | **완료** | `ai-service/train_pipeline.py` |
| 학습 산출물 | **완료** | `ai-service/models/` |
| FastAPI `predict` | **완료** | `ai-service/app/` |
| LangGraph 챗봇 | **완료** (템플릿 `/chat` 스모크 OK; LLM 선택) | `ai-service/agent/` + `POST /chat` |
| Main 챗봇 UI | UI만 있음 | `frontend/src/app/(shell)/main/page.tsx` |
| backend RAG/DB | 나중 | `backend/` |

**정책:** backend가 늦어도 **frontend ↔ ai-service** 만으로 챗봇 연동한다. RAG·제어는 이후.

---

## 2. 디렉터리 지도 (찾을 때 여기)

### ai-service

| 경로 | 역할 |
|------|------|
| [`ai-service/AGENTS.md`](../../ai-service/AGENTS.md) | 챗봇·ML 작업 시 1차 규칙 |
| [`ai-service/train_pipeline.py`](../../ai-service/train_pipeline.py) | `train_model()` / `predict(df, fillThreshold)` |
| [`ai-service/data/cathode_clf_data.csv`](../../ai-service/data/cathode_clf_data.csv) | 학습 CSV (런타임 필수 아님) |
| [`ai-service/models/`](../../ai-service/models/) | **최종 진단 모델·설정** (아래 표) |
| [`ai-service/requirements.txt`](../../ai-service/requirements.txt) | Python 의존성 |
| [`ai-service/logs/`](../../ai-service/logs/) | `train.log`, 100trial 로그 |
| `ai-service/app/` | FastAPI (`/health`, `/predict`, `/chat`) |
| `ai-service/agent/` | LangGraph + predict Tool (**코드 작성**, 설치 대기) |

### models/ 최종 아티팩트 (2026-07-23 100 trial)

루트: `ai-service/models/`

| 파일 | 용도 |
|------|------|
| `xgb_model.json` | XGBoost |
| `cat_model.cbm` | CatBoost |
| `encoder.pkl` | 범주 인코더 |
| `imputer_values.json` | 결측 대체 (Train 평균 / `__MISSING__`) |
| `ensemble_config.json` | 가중치 0.5:0.5, `default_threshold`≈0.4 |
| `metadata.json` | feature_columns·types·metrics·version 1.2.0 |
| `domain_thresholds.json` | EDA 임계치 표 |
| `shap_*_importance.csv` / `.json` | 전역 SHAP → Top-4 |

### frontend (챗봇 UI)

| 경로 | 역할 |
|------|------|
| [`frontend/src/app/(shell)/main/page.tsx`](../../frontend/src/app/(shell)/main/page.tsx) | Main 우측 **AI 챗봇** 패널 (현재 하드코딩 목업) |
| [`frontend/src/api/axios.ts`](../../frontend/src/api/axios.ts) | `baseURL: '/api'` (backend용) |
| [`frontend/next.config.ts`](../../frontend/next.config.ts) | rewrites — 나중에 `/ai` → ai-service 추가 예정 |

### 문서·계약

| 경로 | 역할 |
|------|------|
| [`docs/direction.md`](../direction.md) | 전체 방향·우선순위 |
| [`docs/references/cathode-clf-schema.md`](../references/cathode-clf-schema.md) | CSV 스키마 |
| [`docs/references/important-paths.md`](../references/important-paths.md) | 중요 경로 표 |
| [`docs/prompts/train-pipeline-ox-classifier.md`](../prompts/train-pipeline-ox-classifier.md) | 학습 프롬프트 명세 |
| [`.cursor/rules/ask-before-run.mdc`](../../.cursor/rules/ask-before-run.mdc) | 설치·학습·테스트 전 승인 |

---

## 3. 챗봇이 모델을 “읽는” 방식 (연동 계약)

챗봇/LLM이 `models/` 파일을 직접 파싱하지 않는다.

```text
[Main UI 입력]
    → POST ai-service 챗봇 API  (예정: /chat)
        → LangGraph + LLM
            → Tool: predict
                → train_pipeline.predict(polars 1행, fillThreshold)
                    → models/ lazy load
                ← { defect_status, probability, applied_threshold, top_risk_factors[4] }
        ← 자연어 답변 (predict JSON만 근거)
    → Main UI 말풍선
```

`predict` 반환 (이름 변경 금지: `fillThreshold`):

```json
{
  "defect_status": 0,
  "probability": 0.0,
  "applied_threshold": 0.4,
  "top_risk_factors": ["a", "b", "c", "d"]
}
```

규칙: LLM이 확률·원인을 **임의 생성 금지**. Tool 결과만 인용.  
처치/장비 제어는 권한·backend 이후.

---

## 4. 구현 순서 (이 작업서 기준)

1. **FastAPI** `POST /predict` (+ health) — **완료**  
2. **agent/** 최소 챗봇 — LangGraph + `POST /chat` — **코드 작성** (pip 설치·스모크 승인 대기)  
3. **frontend Main** — 목업 → 실 API (입력/전송/메시지 상태)  
4. **next.config** — `/ai` rewrite → ai-service 포트  
5. (나중) backend RAG·DB·제어

---

## 5. 2026-07-23까지 완료한 ML 요약

- v1.1.0 고도화 → v1.2.0 도메인 피처·임계 플래그  
- `top_risk_factors` **Top-4**  
- Optuna **100+100** trial (처음부터), CPU  
- Test: ROC-AUC **0.940**, PR-AUC **0.709**, thr **0.4**  
- CWD 항상 `ai-service/`

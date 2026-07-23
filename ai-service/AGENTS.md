# ai-service — 챗봇 · AI 모델 참고서

**용도:** 챗봇(Agent)과 AI 모델(학습·추론)을 만들 때만 본다.  
프론트 UI·일반 backend CRUD에는 쓰지 않는다.

최종 갱신: 2026-07-23

**실행 전 승인:** `pip` 설치, `train_model`/Optuna 학습, `predict` 스모크·테스트는  
사용자에게 무엇을·왜·예상 시간을 보고하고 **승인받은 뒤에만** 실행한다.  
(전체 룰: `.cursor/rules/ask-before-run.mdc`)

**설치 후:** `pip`로 새 패키지를 넣으면 `README.md` 기술 스택·루트 README 모노레포 스택을 같은 작업에서 갱신한다.

**v1.2.0 파이프라인:** 도메인 피처(온도 편차·임계 플래그·온습도 교차·particle_span) + `domain_thresholds.json`.  
이전: `logs/train.log`, Optuna `gc.collect`, metadata 버전·해시·`feature_types`,  
CV=`TimeSeriesSplit`, cost 기반 `default_threshold`, `predict` 스키마 드리프트, SHAP CSV+JSON.

---

## 1. 한 줄 목표

양극재 품질 시스템에서 **불량 O/X 진단 → (이후) 원인·조절 방안 대화 → 권한 있는 제어** 를 AI가 돕는다.  
지금 패키지는 그 중 **ML 진단 + 챗봇 Agent** 를 담당한다.

---

## 2. 전체 스택 (합의된 파이프라인)

```
Polars
  → ML (XGBoost + CatBoost 앙상블)
  → LangGraph (에이전트 오케스트레이션)
  → LLM (vLLM 또는 GPT; 제품 방향상 Gemini도 검토)
  → FastAPI (추론·도구 API; 장비 제어는 권한과 함께)

문서/지식: backend에서 읽어 RAG에 연결 (후속)
데이터 원천: 서비스는 DB 사용이 목표. 1단계 학습만 CSV.
```

| 단계 | 하는 일 | 하지 않는 일 |
|------|---------|--------------|
| **1단계** | O/X 이진 분류 `train_pipeline.py` + `predict` | 파라미터 조절 제안, LangGraph, LLM, 제어 |
| **2단계+** | LangGraph + LLM + RAG + Tool Calling | `predict`가 임의로 처치/제어 문구 생성 |

`predict()`는 **진단 결과만** 반환한다. 환각성 “이렇게 조절하세요” 필드를 넣지 않는다.  
조절·실행 제안은 **챗봇(LLM + Tool)** 단계에서만 한다.

---

## 3. 제품 흐름 (챗봇이 맞춰야 할 UX)

1. 정확한 분석  
2. 불량(률) 예측  
3. 어떤 파라미터를 바꾸면 불량이 줄어드는지 유추  
4. 사용자에게 감소 방안 제시  
5. 사용자가 선택하면 웹에서 실행 (**제어 + 권한**)

모호한 질문(“요즘 온도가 문제인 것 같은데 불량 좀 줄여줘”) → **LLM + RAG + Tool Calling**.

Tool 후보(후속 설계):

- `predict` / 진단 결과 조회  
- 지식·문서 검색 (backend)  
- (권한 후) 제어 API 호출  

---

## 4. 1단계 ML — 원본 요구 + 보강 확정

원본 프롬프트 핵심을 유지하고, 리뷰에서 빈 칸을 **아래처럼 확정**했다.  
구현 시 붙여 넣을 전문: 저장소 `docs/prompts/train-pipeline-ox-classifier.md`  
스키마 표: `docs/references/cathode-clf-schema.md`

### 4.1 역할

- 시니어 AI 엔지니어 / 백엔드 아키텍트 관점으로 `train_pipeline.py` 작성  
- `train_model()` 과 `predict(df, fillThreshold=0.5)` **분리** (`fillThreshold` 이름 변경 금지)

### 4.2 데이터

| 항목 | 확정 |
|------|------|
| 경로 | `ai-service/data/cathode_clf_data.csv` (CWD = `ai-service/`) |
| 제외 | `id`, `timestamp` |
| 범주 | `operator_id`만 (String, cat_features) |
| 타깃 | `quality_defect` ∈ {0, 1}, **1=불량** (문자열 암묵 매핑 금지) |
| 그 외 | 전부 수치 Feature → Float |
| 누수 | imputer 통계는 **Train만** → `imputer_values.json` |
| 범주 결측 | `"__MISSING__"` |
| 라이브러리 | **Polars only**, pandas DataFrame 변환 금지 |

스키마·헤더 불일치 시 **즉시 실패**.

### 4.3 모델 파이프라인

- Split: Train 80% / Test 20%, Stratified, seed **42**  
- **CatBoost:** 문자열 유지, `cat_features`로 전달. pandas 금지. `Pool`/numpy 등 비-pandas만.  
- **XGBoost:** `OrdinalEncoder(handle_unknown='use_encoded_value', unknown_value=-1)` → numpy. encoder → `encoder.pkl`  
- 불균형: `scale_pos_weight = (Train 정상수)/(Train 불량수)` (불량 0이면 에러)  
- 앙상블: 확률 **0.5 : 0.5** 고정 (Test로 weight 튜닝 금지)  
- 평가: Test **1회**, ROC-AUC 최우선 (+ accuracy, F1, PR-AUC 로그)

### 4.4 Optuna

- `OPTUNA_TRIALS = 100`, Train 내 5-Fold, 목적 = ROC-AUC maximize  
- Study 분리: `xgb_ox_clf`, `cat_ox_clf`  
- `storage="sqlite:///optuna.db", load_if_exists=True`  
- **필수:** best params로 **Train 전체 refit** → Test 1회 → 그 모델을 저장  
- GPU: XGB `device="cuda"` / Cat `task_type="GPU"` 시도 → 실패 또는 `USE_GPU=0`이면 **CPU fallback**  
- search space·early stopping(Fold val만): `docs/prompts/train-pipeline-ox-classifier.md` 준수

### 4.5 산출물 (`models/`)

```
xgb_model.json
cat_model.cbm
encoder.pkl
imputer_values.json      # numeric averages + categorical_fill
ensemble_config.json     # weights 0.5/0.5, default_threshold
metadata.json            # feature_columns, cat_features, seed, metrics, device_mode
shap_xgb_importance.csv
shap_cat_importance.csv
```

SHAP: TreeExplainer로 학습 후 importance CSV만 저장. **Explainer 피클 금지.**

### 4.6 `predict` 계약 (챗봇 Tool이 나중에 호출)

- Lazy global cache: 모듈 import 시 강제 로드 금지. `predict` 첫 호출 때 로드.  
- 입력: polars `DataFrame` **1행만** (`len != 1` → ValueError)  
- Feature: `metadata.json`의 `feature_columns` 이름·순서 강제  
- `defect_status = 1 if probability >= fillThreshold else 0`

반환:

```json
{
  "defect_status": 0,
  "probability": 0.0,
  "applied_threshold": 0.5,
  "top_risk_factors": ["feat_a", "feat_b", "feat_c", "feat_d"]
}
```

**top_risk_factors (1단계 확정):** 두 SHAP CSV importance **평균의 전역 Top-4 이름** (EDA 주요 원인 4개와 맞춤).  
이번 행의 샘플별 SHAP이 아님. 샘플별 설명은 챗봇 고도화 단계에서 따로.

처치·제어·조절 제안 필드 **추가 금지**.

---

## 5. 원본 프롬프트에 있던 절대 규칙 (유지)

1. 추론 모듈에서 파라미터 조절 등 **가상 데이터 생성 금지**  
2. Random seed **42**, Polars, pandas 변환 금지  
3. Train-only imputer, Test 격리  
4. Cat / XGB 입력 파이프라인 분리  
5. Optuna SQLite resume  
6. 앙상블 0.5:0.5, SHAP CSV 분리 저장  
7. Lazy caching + `fillThreshold` 시그니처 유지  
8. 경로 `models/` 상대, Python 3.11+

---

## 6. 디렉터리 가이드 (목표 구조)

```
ai-service/
  AGENTS.md
  data/cathode_clf_data.csv
  models/                   ← 100 trial 최종 산출물 (사용 중)
  train_pipeline.py         ← 1단계 완료
  requirements.txt
  logs/
  app/                      ← FastAPI (/health, /predict, /chat)
  agent/                    ← LangGraph (최소 그래프)
```

프론트 챗봇 UI 목업: `frontend/src/app/(shell)/main/page.tsx`  
연동 작업서: `docs/plans/2026-07-23-chatbot-integration.md`

---

## 7. 챗봇 구현 시 체크리스트

- [x] 진단은 `predict` Tool 결과만 인용 (임의 불량 확률 생성 금지) — `agent/tools.py` + template/LLM compose  
- [ ] 문서 답은 RAG/backend 검색 결과 인용  
- [ ] “조절해서 실행”은 권한 확인 후에만 Tool 호출  
- [x] 1단계 `top_risk_factors`는 전역 중요도임을 사용자 문구에서 과장하지 않기  
- [x] 시크릿·API 키는 저장소에 넣지 않기 (`OPENAI_API_KEY`는 환경변수만)

---

## 8. 저장소 다른 문서 (깊은 명세)

| 문서 | 언제 |
|------|------|
| `docs/direction.md` | 제품 전체 방향 |
| `docs/prompts/train-pipeline-ox-classifier.md` | 1단계 코드 생성용 전문 프롬프트 |
| `docs/references/cathode-clf-schema.md` | CSV 컬럼 계약 |
| `docs/plans/2026-07-22-ox-classifier-prompt.md` | 보강 확정 요약 |

이 파일(`ai-service/AGENTS.md`)이 **챗봇·모델 작업의 1차 진입점**이다.  
충돌 시: 스키마·predict 계약은 `docs/references` + 이 파일 4절이 우선이고, 장문 프롬프트는 구현 체크리스트로 쓴다.

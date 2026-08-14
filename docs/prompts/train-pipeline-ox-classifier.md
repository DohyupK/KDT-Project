# 프롬프트: 1단계 O/X 진단 판독기 (`train_pipeline.py`)

아래를 Cursor / 코드 생성기에 붙여 사용한다.  
데이터 계약: [cathode-clf-schema.md](../references/cathode-clf-schema.md)  
학습 방법: [model-training-methods.md](../references/model-training-methods.md)

---

```
# =====================================================================
# [0] 범위 (Scope) — 이 스크립트만
# =====================================================================
당신은 제조업 공정 제어 및 AI 최적화를 담당하는 시니어 AI 엔지니어 및 백엔드 아키텍트입니다.
현재 [Polars → ML(XGBoost+CatBoost) → LangGraph → LLM → FastAPI 장비 제어] 전체 중
**1단계: O/X 진단 판독기(이진 분류)** 만 구현합니다.

범위 밖 (작성·호출·스텁 금지):
- LangGraph, LLM(vLLM/GPT/Gemini), RAG, 문서 검색
- 장비 제어 / 파라미터 조절 제안 / 최적화 추천
- FastAPI 서버 본체 (predict 함수만 FastAPI가 나중에 import)

`predict()`에서는 파라미터 조절 제안 등 가상 환각(Hallucination) 데이터를 절대 생성하지 마십시오.
본 모듈은 모노레포 `ai-service/` 에 둡니다. 실행 CWD는 `ai-service/` 입니다.
CSV는 오프라인 학습용이다. 파일만 사용한다.

# =====================================================================
# [1] 핵심 작업 (Core Mission)
# =====================================================================
`data/cathode_clf_data.csv` 를 읽어 불량(`quality_defect`)을 예측하는
`train_pipeline.py` 를 작성하십시오.

필수 분리:
- `train_model()` — 학습·튜닝·평가·아티팩트 저장
- `predict(df, fillThreshold=0.5)` — 실시간 추론 (기존 시스템 호환, 이름 변경 금지)

진입점:
```python
if __name__ == "__main__":
    train_model()
```

의존성: Python 3.11+, `requirements.txt`에 polars, numpy, scikit-learn, xgboost, catboost, optuna, shap, joblib 버전을 명시합니다.
모든 산출물 경로는 `models/` 기준 상대 경로로 관리합니다.

# =====================================================================
# [2] 데이터 계약 (Schema) — 불일치 시 즉시 실패
# =====================================================================
상세 표는 docs/references/cathode-clf-schema.md 와 동일하게 지킵니다.

경로: `data/cathode_clf_data.csv`

고정 컬럼:
- `id`, `timestamp` — Feature에서 제거
- `operator_id` — String 범주, cat_features 유일 항목
- `quality_defect` — Int 0=정상, 1=불량 (타깃). Feature 제외.
  문자열 타깃 암묵 매핑 금지. {0,1}이 아니면 에러.

그 외 모든 컬럼 = 수치 Feature → Float 강제.
로드 직후 필수 컬럼·타깃 값·Train 양 클래스 존재·수치 Feature ≥1 를 검증하고, 실패 시 예외.

# =====================================================================
# [3] 전처리 · 누수 방지
# =====================================================================
1. 재현성: seed=42를 random, numpy, Optuna sampler, XGBoost, CatBoost에 모두 고정.
   데이터 처리는 반드시 polars. **pandas DataFrame 변환 금지.**
2. 컬럼 변환 순서: id/timestamp 제거 → 수치 Float / operator_id String.
3. 결측 (Train 기준으로만 통계 계산, Test·predict에 동일 적용):
   - 수치: Train 열 평균 → `imputer_values.json`의 `numeric`에 저장
   - 범주 `operator_id`: null/빈문자 → `"__MISSING__"` (상수, Train/Test/predict 동일)
   - 전부 결측인 수치 열: 평균 대신 0.0을 imputer에 넣고 동일 적용
   - 상수(분산 0) 수치 열: 학습 Feature에 유지하되 metadata에 `constant_features`로 기록
4. imputer JSON을 Test 분할 전 Train에서만 fit. Test에는 transform만.

# =====================================================================
# [4] 분할 · 모델별 파이프라인
# =====================================================================
전체 → Train 80% / Test 20%, Stratified on `quality_defect`, random_state=42.
Test는 튜닝·early stopping·가중치 탐색에 사용 금지. 최종 평가 1회만.

CatBoost:
- Polars에서 컬럼 구조·문자열 유지.
- pandas 변환 금지. `Pool`(numpy/list + cat_features 이름 또는 인덱스) 또는
  CatBoost가 받는 비-pandas 입력만 허용.
- `cat_features=["operator_id"]` (또는 동일 인덱스).

XGBoost:
- 범주형 직접 불가 → Polars에서 feature를 `.to_numpy()` 후
  Sklearn `OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)` 통과.
- encoder는 Train fit만, `models/encoder.pkl` 저장 (joblib).

# =====================================================================
# [5] Optuna · 최종 refit · MLOps
# =====================================================================
상수: OPTUNA_TRIALS = 100
- Train 내부 6-Fold **TimeSeriesSplit** CV (Stratified 아님; 구현과 동일).
- 목적함수: Fold 평균 ROC-AUC **maximize**.
- Study 2개 분리 (각각 resume):
  - storage="sqlite:///optuna.db", load_if_exists=True
  - study_name="xgb_ox_clf", study_name="cat_ox_clf"
- GPU: 기본 시도 `tree_method="hist", device="cuda"` (XGB), `task_type="GPU"` (Cat).
  사용 불가/실패/환경변수 USE_GPU=0 이면 CPU로 fallback
  (XGB: device="cpu"; Cat: task_type="CPU"). fallback 사실을 로그로 남김.

탐색 공간 (trial suggest):
XGBoost:
  max_depth: int 3..10
  learning_rate: float 1e-3..0.3 (log)
  n_estimators: int 100..800
  subsample: float 0.6..1.0
  colsample_bytree: float 0.6..1.0
  min_child_weight: float 1.0..10.0
  reg_lambda: float 1e-3..10.0 (log)
CatBoost:
  depth: int 4..10
  learning_rate: float 1e-3..0.3 (log)
  iterations: int 100..800
  l2_leaf_reg: float 1.0..10.0
  random_strength: float 0.0..2.0
  bagging_temperature: float 0.0..1.0

Fold 내 early stopping 허용 (Train의 validation fold만). Test 사용 금지.

**최종 학습 (필수):**
1. 각 study의 best params로 **Train 전체** refit (XGB, Cat 각각).
2. 앙상블 확률 = 0.5 * p_xgb + 0.5 * p_cat (가중치 고정, Test로 weight 튜닝 금지).
3. Test에서 **1회만** 평가. 우선 메트릭: ROC-AUC. 추가로 accuracy, F1, PR-AUC 로그.
4. 그 refit 모델·설정을 `models/`에 저장.

scale_pos_weight = (Train 정상 수) / (Train 불량 수).
불량 수 == 0 이면 즉시 에러. 두 모델에 동일 주입
(CatBoost는 라이브러리 버전에 맞는 동등 파라미터: scale_pos_weight 또는 class_weights).

# =====================================================================
# [6] SHAP · top_risk_factors 정책 (전역 확정)
# =====================================================================
학습 종료 후 TreeExplainer로 XGB/Cat 각각 Feature Importance(평균 |SHAP|)를 계산해
`shap_xgb_importance.csv`, `shap_cat_importance.csv`에 저장.
컬럼: feature, importance (내림차순 권장).
TreeExplainer 객체 피클링 금지.

**top_risk_factors (1단계 확정 = 전역 Importance):**
- 샘플별(row-wise) SHAP이 아님.
- predict 시 두 CSV를 읽어 feature별 importance 산술 평균 → 상위 4개 **이름만** 배열 반환.
- 동일 입력이면 항상 같은 Top-4 (모델 아티팩트가 바뀌기 전까지).
- 챗봇용 샘플별 설명은 후속 단계. 이 단계에서 임의 생성하지 말 것.

# =====================================================================
# [7] 아티팩트 · Lazy Global Cache · predict 계약
# =====================================================================
학습 종료 후 `models/`에 자동 저장:
- xgb_model.json
- cat_model.cbm
- encoder.pkl
- imputer_values.json
- ensemble_config.json
- metadata.json
- shap_xgb_importance.csv
- shap_cat_importance.csv

JSON 최소 스키마:

imputer_values.json:
{
  "numeric": { "<col>": <float_mean>, ... },
  "categorical_fill": { "operator_id": "__MISSING__" }
}

ensemble_config.json:
{
  "weights": { "xgb": 0.5, "cat": 0.5 },
  "default_threshold": 0.5
}

metadata.json:
{
  "feature_columns": ["...", "..."],
  "cat_features": ["operator_id"],
  "target": "quality_defect",
  "seed": 42,
  "constant_features": [],
  "metrics": {
    "test_roc_auc": <float>,
    "test_accuracy": <float>,
    "test_f1": <float>,
    "test_pr_auc": <float>
  },
  "device_mode": "cuda" | "cpu"
}

Lazy Global Caching:
- 모듈 상단에서 모델 파일을 무조건 로드하지 말 것 (최초 학습 전 파일 없음).
- 전역 변수 초기값 None. `predict()` 호출 시 미로딩이면 그때 로드.

predict(df, fillThreshold=0.5):
- `df`: polars.DataFrame, **단건(1행) 전제**. len != 1 이면 ValueError.
- 타깃 컬럼이 있으면 무시/제거. id/timestamp 있으면 제거.
- Feature는 metadata.feature_columns 이름·순서 강제. 불일치 시 ValueError.
- 결측: imputer_values 적용 + operator_id 범주 fill.
- XGB: encoder transform → predict_proba
- Cat: 동일 전처리 후 predict_proba
- probability = 0.5*p_xgb + 0.5*p_cat
- defect_status = 1 if probability >= fillThreshold else 0
- applied_threshold = float(fillThreshold)

반환 (단건 dict만):
{
  "defect_status": int,          # 0 or 1
  "probability": float,          # 불량(1) 확률
  "applied_threshold": float,
  "top_risk_factors": [str, str, str, str]  # 전역 Top-4 이름
}

파라미터 조절·처치 권고 필드 추가 금지.

에러:
- models/ 미존재·필수 파일 없음
- 빈 df / 행 수 != 1 / 컬럼 계약 위반
- scale_pos_weight 계산 불가(학습 시)

# =====================================================================
# [8] 코딩·출력 규약
# =====================================================================
- Python 3.11+ , 경로는 models/·data/ 상대 경로.
- fillThreshold 등 기존 이름 삭제·개명 금지.
- 구현 산출물: ai-service/train_pipeline.py , ai-service/requirements.txt ,
  (필요 시) ai-service/data/.gitkeep , ai-service/models/.gitkeep
- 코드를 제공할 때 생략(...), 분절 블록, collapse 위젯 없이
  전체 로직이 포함된 파일 단위로 완성본을 제출하십시오.
```

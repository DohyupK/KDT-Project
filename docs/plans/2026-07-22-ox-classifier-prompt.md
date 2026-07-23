# 계획: 1단계 O/X 진단 프롬프트 보강

일자: 2026-07-22  
상태: 확정 (프롬프트·스키마 문서화 완료, 코드 미구현)

## 목적

원본 Gemini 학습 프롬프트의 누락(데이터 계약·refit·predict 계약·환경)을 채워  
`ai-service` 구현 시 편차를 줄인다.

## 산출물

| 경로 | 내용 |
|------|------|
| [docs/references/cathode-clf-schema.md](../references/cathode-clf-schema.md) | CSV 경로·고정 컬럼·타깃 인코딩·검증 |
| [docs/prompts/train-pipeline-ox-classifier.md](../prompts/train-pipeline-ox-classifier.md) | 보강된 단일 구현 프롬프트 |

## 확정 결정

1. **데이터**: `ai-service/data/cathode_clf_data.csv`. 타깃 `quality_defect` ∈ {0,1}, 불량=1. 범주형은 `operator_id`만. 나머지=수치 Feature.
2. **학습 종료**: Optuna(best) → Train 전체 refit → Test 1회 평가 → `models/` 저장. 앙상블 가중치 0.5:0.5 고정(Test로 weight 튜닝 금지).
3. **predict**: polars 1행만. `probability >= fillThreshold` → `defect_status=1`. Feature는 `metadata.feature_columns` 강제.
4. **top_risk_factors**: **전역** SHAP importance 평균 Top-4 이름 (EDA 주요 원인 4개와 맞춤; 샘플별 SHAP은 후속).
5. **결측**: 수치=Train 평균, 범주=`__MISSING__`.
6. **Optuna**: study 분리 `xgb_ox_clf` / `cat_ox_clf`, SQLite resume, 목적=ROC-AUC, search space 프롬프트에 고정.
7. **GPU**: cuda/GPU 시도 후 실패 또는 `USE_GPU=0`이면 CPU fallback.
8. **범위 밖**: LangGraph, LLM, RAG, 장비 제어, FastAPI 서버 본체.

## 다음 구현 (이 계획 범위 밖)

- `ai-service/train_pipeline.py` + `requirements.txt` 작성
- CSV 파일 배치 후 학습 검증

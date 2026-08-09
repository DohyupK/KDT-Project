# 모델 학습 방법 (SSOT)

최종 갱신: 2026-08-10  
적용: `ai-service` clf · capacity(reg) · residual  
관련: [`cathode-clf-schema.md`](./cathode-clf-schema.md) · [`cathode-reg-schema.md`](./cathode-reg-schema.md) · [`cathode-residual-schema.md`](./cathode-residual-schema.md) · [`ai-service/AGENTS.md`](../../ai-service/AGENTS.md)

이 문서는 양극재 ML 헤드의 **학습·검증·임계·하이퍼** 합의를 고정한다.  
코드와 충돌 시: 스키마·`predict` 계약은 references + AGENTS, 본 문서는 방법론·운영 판단 SSOT.

---

## 1. 운영 헤드

| 헤드 | 타깃 | 스크립트 | 데이터 | Optuna DB | 산출 |
|------|------|----------|--------|-----------|------|
| clf | `quality_defect` O/X | `train_pipeline.py` | `data/cathode_clf_data.csv` | `optuna.db` | `models/` |
| reg | `capacity` (mAh/g) | `train_reg_pipeline.py` | `data/cathode_reg_data.csv` | `optuna_reg.db` | `models/reg/` |
| residual | `residual_li` (ppm) | `train_residual_pipeline.py` | `data/cathode_qc_reg_data.csv` | `optuna_residual.db` | `models/residual/` |

- 챗/레지스트리: [`ai-service/models/registry.json`](../../ai-service/models/registry.json)
- 헤드마다 **XGBoost + CatBoost**, 추론 시 확률/예측 **0.5 / 0.5** 평균 (Test로 weight 튜닝 금지)
- clf는 capacity/residual을 입력으로 쓰지 않음
- 헤드 간 HTTP 병렬(`lotScore` `Promise.all`) ≠ 같은 타깃 점수 블렌딩 (블렌딩 설계는 Documents Public 메모)

---

## 2. 데이터 분할

### 2.1 시계열 8:2 (본 파이프라인)

- `chronological_train_test_indices`: 앞 **80% Train**, 뒤 **20% Test** (CSV 행 순서 = 시간 순 가정)
- **Test는 트리 가중치 학습에 사용하지 않는다**

Test 역할:

1. **평가 숫자** — ROC-AUC / Acc / F1 / PR-AUC (clf) 또는 RMSE·MAE·R² (reg/residual) → `metadata.json`
2. **clf 확률 임계** — `Cost = FP + FN × FN_COST_WEIGHT`로 `default_threshold` 자동 선정 → `ensemble_config.json`  
   운영에서 `fillThreshold` / config로 덮어쓸 수 있음 (예: 운영 0.8)

진짜 미래 LOT에는 라벨이 없으므로 당장 채점 불가.  
과거 뒤쪽 holdout이 “가상 미래” 검증이다. 실측 outcome이 쌓이면 그때 실전 점수.

### 2.2 6:2:2 의미 (참고)

| 비율 | 이름 | 역할 |
|------|------|------|
| 60% | Train | 가중치 학습 |
| 20% | Validation | 하이퍼·조기종료·모델 선택 |
| 20% | Test | 최종 평가만 |

본 코드는 **고정 6:2:2가 아니다.**  
**8:2 holdout** + Train 안 **TimeSeriesSplit (`N_FOLDS`)** 이 Validation 역할을 한다.

### 2.3 100% 학습 vs 8:2

| 단계 | 권장 |
|------|------|
| 개발·비교·임계·배포 게이트 | **시계열 8:2** |
| 레시피·시드·임계 확정 후 선택 | 동일 설정으로 **100% refit** (배포용; 그 점수는 해당 모델의 미지 구간 점수가 아님) |

1만 건에서 +20% 데이터 이득보다, 검증·임계 없이 100%만 쓰는 리스크가 더 크다.

---

## 3. 학습 파이프라인 (공통)

| 항목 | 값 |
|------|-----|
| Seed | `SEED = 42` (random / numpy / Optuna / XGB / Cat) |
| 라이브러리 | Polars only (pandas DF 변환 금지) |
| CV | `TimeSeriesSplit`, `N_FOLDS = 6` (`train_pipeline.py`; reg/residual import) |
| Optuna trials | `OPTUNA_TRIALS` 기본 100 (환경변수) |
| GPU | `USE_GPU=0` → CPU fallback |
| 최종 fit | Optuna best → **Train 전체 refit** → Test 1회 |
| 누수 | imputer / encoder / `scale_pos_weight` 통계는 **Train만** |

clf 목적: Fold 평균 **ROC-AUC maximize**  
reg / residual 목적: Fold 평균 **RMSE minimize**

---

## 4. 하이퍼파라미터 — 직접 vs Optuna

### 4.1 직접 고를 수 있는 것

| 항목 | 기본 | 비고 |
|------|------|------|
| `OPTUNA_TRIALS` | 100 | 탐색 횟수 |
| `USE_GPU` | 1 (`0`=CPU) | 디바이스 |
| `SEED` | 42 | 바꾸면 다른 모델 (복제 앙상블용) |
| `FN_COST_WEIGHT` | 10.0 | **clf 임계만**; 가중치 학습 무관 |
| `N_FOLDS` | **6** | Optuna CV 폴드 |
| Train/Test 비율 | 0.2 | 코드 `test_size` |
| 앙상블 비율 | 0.5/0.5 | 계약상 Test 튜닝 금지 |
| 운영 임계 | config / `fillThreshold` | 판정 컷 |

### 4.2 Optuna 탐색 (요약)

**XGBoost:** `max_depth`, `learning_rate`, `n_estimators`, `subsample`, `colsample_bytree`, `min_child_weight`, `reg_lambda`, `gamma` (+ clf `scale_pos_weight` ±20%)

**CatBoost:** `depth`, `learning_rate`, `iterations`, `l2_leaf_reg`, `random_strength`, `bagging_temperature`, `border_count`

---

## 5. 노브 효과 요약

### SEED

- 값을 바꾸면 Optuna 경로·트리 분할이 달라져 **다른 모델**이 된다.
- 숫자 크기 자체보다 “다름”이 중요. 성능 단조성 없음.

### FN_COST_WEIGHT (clf)

- **학습(가중치)에 영향 없음.**
- 크게 → 놓침(FN) 비용↑ → 임계 **낮아지기** 쉬움 (검사↑·놓침↓)
- 작게 → 임계 **높아지기** 쉬움 (검사↓·놓침↑)
- `probability`는 불변.

### N_FOLDS

- Optuna가 **어떤 하이퍼를 고를지**만 바꿈. 최종은 여전히 Train 전체 refit.
- 크게(예: 8–10): 시간↑, 튜닝 점수 안정↑ 가능하나 시계열 앞 fold train이 작아질 수 있음.
- **예측 성능이 눈에 띄게 오른다고 기대하기 어렵다.** 소폭·불확실.
- 2026-08-10: **5 → 6**. 기존 `optuna*.db`·`models/`는 그대로; **다음 승인 학습**부터 반영.

### 앙상블 비율 `w_xgb` / `w_cat`

`p = w_xgb·p_xgb + w_cat·p_cat` — 이미 학습된 확률 혼합. 각 모델을 다시 학습하지 않음.

| | XGB 비중↑ | Cat 비중↑ |
|--|-----------|-----------|
| 장점 | 수치·상호작용에서 XGB가 나을 때 반영 | `operator_id` 네이티브 범주에 유리할 수 있음 |
| 단점 | ordinal `operator_id` 약점·다양성↓ | XGB 강점 희석·다양성↓ |

한쪽에 몰수록 단일 모델에 가깝다. 기울이려면 holdout/실측으로 어느 쪽이 체계적으로 나은지 확인 후.

---

## 6. 평가 숫자와 “정확도”

- 평가 지표는 가중치를 **만들지 않고 측정**한다.
- 간접 영향: 모델·시드 선택, clf 임계 선정 → **운영 판정**만 달라질 수 있음.
- ROC/PR ≈ 확률 순위력(임계 무관에 가깝다). Acc/F1 ≈ 임계에 의존하는 판정 지표.

---

## 7. 스냅샷: models1(8:2) vs 현재 운영 clf

비교 시점 2026-08-10. 경로: `Downloads/test/models1` vs `ai-service/models/`.

| 항목 | models1 | 현재 운영 |
|------|---------|-----------|
| train_date | 2026-08-06 | 2026-07-24 |
| dataset_hash | 다름 | 다름 (동일 CSV 복제 아님) |
| test_roc_auc | ~0.909 | ~0.940 |
| test_accuracy | ~0.774 | ~0.840 |
| test_f1 | ~0.416 | ~0.529 |
| test_pr_auc | ~0.586 | ~0.709 |
| applied_eval_threshold (metadata) | 0.2 | 0.4 |
| `default_threshold` (ensemble_config) | 0.2 | **0.8** (운영 상향) |

---

## 8. 실행 (승인 후)

```bash
cd ai-service
python train_pipeline.py
# USE_GPU=0 OPTUNA_TRIALS=100 python train_reg_pipeline.py
# USE_GPU=0 OPTUNA_TRIALS=100 python train_residual_pipeline.py
```

재학습·Optuna·스모크는 `.cursor/rules/ask-before-run.mdc`에 따라 **사용자 승인 후**만.

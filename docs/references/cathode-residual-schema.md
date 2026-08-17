# cathode_qc_reg 데이터 계약 (리튬 잔여량 회귀)

최종 갱신: 2026-08-14  
적용: `ai-service` residual_li 회귀 (`train_residual_pipeline.py`)  
관련: [`cathode-clf-schema.md`](./cathode-clf-schema.md) · [`cathode-reg-schema.md`](./cathode-reg-schema.md)

실데이터만 사용한다. **가짜 CSV 대량 생성 금지.**

## 파일 경로

| 항목 | 값 |
|------|------|
| 학습 CSV | `ai-service/data/cathode_qc_reg_data.csv` |
| 산출물 | `ai-service/models/residual/` |
| Optuna | `optuna_residual.db` |
| 작업 디렉터리 | `ai-service/` |

## clf / capacity와의 관계

| 항목 | clf | capacity (reg) | residual (qc) |
|------|-----|----------------|---------------|
| 파일 | `cathode_clf_data.csv` | `cathode_reg_data.csv` | `cathode_qc_reg_data.csv` |
| 행 수 | 10,000 | 10,000 | 10,000 |
| Feature | 동일 공정 9수치 + operator_id | 동일 | 동일 |
| 도메인 피처 | `add_domain_features` | 동일 | 동일 |
| 타깃 | `quality_defect` | `capacity` (mAh/g) | `residual_li` (ppm 예시) |
| `id` | — | clf와 전량 조인 | clf/reg와 전량 조인 |

챗봇은 ready 헤드(clf + capacity + residual)를 수동 선택 없이 함께 호출한다.

## 고정 컬럼

| 컬럼 | 역할 | 비고 |
|------|------|------|
| `id` / `timestamp` | LOT·시각 | Feature 제외 |
| `operator_id` | 범주 | Feature |
| `residual_li` | 리튬 잔여량 | **타깃** (단위: ppm) |

수치 Feature: `d50`, `d90`, `metal_impurity`, `lithium_input`, `additive_ratio`, `process_time`, `sintering_temp`, `humidity`, `tank_pressure`

## EDA 요약 (실측)

- 양산 중심: residual ≈ 2500–3500, 정상 다수  
- 불량 폭증: 3500–4500  
- 역전: ≥5000에서 불량 > 정상; ≥6500 정상 0  
- capacity와 **음의 상관** (r ≈ -0.66): residual↑ → capacity↓  
- residual ≥3000부터 평균 capacity가 200 mAh/g 아래로 떨어지기 시작

## 학습 뼈대

- seed 42, Optuna 100, TimeSeriesSplit, XGB+Cat 0.5/0.5, RMSE minimize  
- study: `xgb_residual_reg_v1` / `cat_residual_reg_v1`

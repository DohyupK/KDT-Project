# cathode_reg 데이터 계약 (전지 용량 회귀)

최종 갱신: 2026-07-28  
적용: `ai-service` capacity 회귀 (예정 `train_reg_pipeline.py`)  
관련 clf: [`cathode-clf-schema.md`](./cathode-clf-schema.md)

실데이터만 사용한다. **가짜 `reg.csv` 대량 생성 금지.**

## 파일 경로

| 항목 | 값 |
|------|------|
| 학습 CSV | `ai-service/data/cathode_reg_data.csv` |
| 산출물 (예정) | `ai-service/models/reg/` |
| 작업 디렉터리 | `ai-service/` |

## clf와의 관계

| 항목 | clf | reg |
|------|-----|-----|
| 파일 | `cathode_clf_data.csv` | `cathode_reg_data.csv` |
| 행 수 (현재 실데이터) | 10,000 | 10,000 |
| Feature 10개 | 동일 이름·순서 | 동일 |
| 타깃 | `quality_defect` (0/1) | `capacity` (mAh/g, 연속) |
| `id` | — | **전량 clf와 교집합** (같은 LOT 줄기) |

같은 공정 실측의 다른 면(불량 O/X vs 전지 용량). 챗봇은 이후 두 모델을 수동 선택 없이 함께 호출한다.

## 고정 컬럼

| 컬럼 | 한글·역할 | dtype | 비고 |
|------|-----------|-------|------|
| `id` | LOT 번호 | 임의 | **Feature 제외** |
| `timestamp` | 수집 시간 (10분 간격) | 임의 | **Feature 제외** · 시계열 분할 근거 |
| `operator_id` | 작업자 ID | String (범주) | Feature, `cat_features` 유일 |
| `capacity` | 전지 용량 (mAh/g) | Float | **타깃**. Feature 제외 |

## 수치 Feature (입력 X)

`d50`, `d90`, `metal_impurity`, `lithium_input`, `additive_ratio`, `process_time`, `sintering_temp`, `humidity`, `tank_pressure`

| 컬럼 | 의미 (요약) |
|------|-------------|
| `d50` / `d90` | 입도 µm |
| `metal_impurity` | 금속 불순물 |
| `lithium_input` | 리튬 투입량 kg |
| `additive_ratio` | 첨가제 비율 |
| `process_time` | 공정 시간(분) |
| `sintering_temp` | 소성 온도 °C |
| `humidity` | 습도 % |
| `tank_pressure` | 탱크 압력 |

## 결측

현재 실데이터는 **수치 Feature에 결측이 있음** (열당 약 250~320행).  
`capacity`(타깃)·`id`·`timestamp`·`operator_id`는 결측 없음(검증 시점 기준).

학습 시 clf와 동일 정책:

- 수치: **Train 열 평균** imputer (`imputer_values.json`)
- `operator_id` null/빈문자 → `"__MISSING__"`
- 전 열이 결측인 수치 열: 평균 대신 0.0

## 타깃

- 단위: **mAh/g** (전지 용량)
- 실측 대략 범위: **140 ~ 230** (평균 ~200)
- 연속 회귀. Optuna 목적: Fold 평균 **RMSE minimize** (MAE·R²는 평가 로그)

## 학습 뼈대 (clf와 동일, 메트릭만 회귀)

- seed 42, Polars, XGBoost + CatBoost, Optuna 100, TimeSeriesSplit
- 앙상블 0.5 / 0.5
- study 예: `xgb_cap_reg` / `cat_cap_reg`
- 산출물은 `models/reg/` 등으로 **이름 구분**, runtime은 registry로 clf+reg **전부 로드**

## 검증 규칙 (로드 직후, 예정 스크립트)

1. 필수 컬럼: `id`, `timestamp`, `operator_id`, `capacity` + 수치 Feature 9개  
2. `capacity`가 수치이고 null이 과도하지 않을 것 (현재 실데이터: 타깃 null 0)  
3. Feature 수치 컬럼 ≥ 1  
4. 행 수 ≥ 50  

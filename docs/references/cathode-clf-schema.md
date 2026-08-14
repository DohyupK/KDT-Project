# cathode_clf 데이터 계약 (1단계 O/X 진단)

최종 갱신: 2026-08-14  
적용: `ai-service` 학습·추론 (`train_pipeline.py`)

CSV가 아직 저장소에 없을 수 있다. **파일이 추가되면 이 표와 헤더가 일치해야** 하며, 불일치 시 파이프라인은 즉시 실패한다.

## 파일 경로

| 항목 | 값 |
|------|-----|
| 학습 CSV | `ai-service/data/cathode_clf_data.csv` (스크립트 기준 상대: `data/cathode_clf_data.csv`) |
| 산출물 디렉터리 | `ai-service/models/` |
| Optuna DB | `ai-service/optuna.db` |
| 작업 디렉터리 | `ai-service/` 에서 실행 |

학습 입력은 CSV만 사용한다.

## 고정 컬럼

| 컬럼 | 역할 | dtype | 비고 |
|------|------|-------|------|
| `id` | LOT 번호 | 임의 | **Feature 제외** |
| `timestamp` | 시각 | 임의 | **Feature 제외** |
| `operator_id` | 작업자 | String (범주) | Feature, `cat_features` 유일 항목 |
| `quality_defect` | 타깃 | Int `0` \| `1` | **0=정상, 1=불량**. Feature 제외 |

## 수치 Feature

고정 컬럼을 제외한 나머지 컬럼은 수치형 Feature다. 현재 CSV 기준:

`d50`, `d90`, `metal_impurity`, `lithium_input`, `additive_ratio`, `process_time`, `sintering_temp`, `humidity`, `tank_pressure`

- 학습 시 Float으로 강제 변환한다. 변환 실패 컬럼이 있으면 즉시 실패한다.
- 컬럼 **이름·개수·순서**는 학습 종료 시 `models/metadata.json`의 `feature_columns`에 동결한다 (`operator_id` 포함).
- `predict()` 입력은 이 목록과 이름·순서가 일치해야 한다. 누락·추가·순서 불일치 시 즉시 실패.

## 타깃 인코딩

- CSV의 `quality_defect`는 이미 `0`/`1`이어야 한다.
- 문자열(`"OK"`/`"NG"` 등)이 오면 매핑하지 말고 에러로 중단한다 (암묵 변환 금지).

## 검증 규칙 (로드 직후)

1. 필수 컬럼 존재: `id`, `timestamp`, `operator_id`, `quality_defect`
2. `quality_defect` unique ⊆ `{0, 1}`, 두 클래스 모두 Train에 최소 1건
3. Feature 수치 컬럼 ≥ 1개
4. 행 수 ≥ 50 (미만이면 경고 후 진행 가능하되, Optuna/Stratify 실패 시 에러)

# 추천 가중 실험 · `temp3` (테이블 유지)

최종 갱신: 2026-08-11  
가정: [`summary_15_models_plain.md`](./summary_15_models_plain.md) §5 추천 가중  
측정 출처: **MariaDB `` `temp3` `` READBACK** ∩ CSV (미매칭 0). in-memory 우회 없음.

## 테이블·원복 방침

| 항목 | 상태 |
|------|------|
| `` `temp3` `` | **유지** (DROP 금지 · 이번 지시) |
| DDL | [`DB/temp3_recommended.sql`](../../../DB/temp3_recommended.sql) |
| 채점 스크립트 | [`ai-service/scripts/score_recommended_to_temp3.py`](../../../ai-service/scripts/score_recommended_to_temp3.py) |
| `voting_config.json` | **미변경** |
| `` `temp` `` / `judgment_lots` | **미변경** |
| 원숫자 | [`_eval_recommended_temp3.json`](./_eval_recommended_temp3.json) |

## 추론 순서 확인

코드·실행 로그상 **아래 순서로만** 계산한 뒤 INSERT한다 (`voting_predict`와 동일 cascade).

1. **capacity** (가중합)
2. **residual_li** (가중합)
3. **probability** (clf + cascade; cascade 입력 = 1·2의 예측값)
4. **quality_defect** = `probability ≥ 0.4`
5. `` `temp3` ``에 lot_id / quality_defect / capacity / residual_li / probability 기록

검증: `` `temp3`.quality_defect`` ↔ `(probability ≥ 0.4)` 일치 **10000/10000**.

## 적용 가중

**capacity** /15: `{"legacy_reg": 4, "reg_d50": 3, "reg_d90": 3, "reg_feature": 2, "cathode_feature_cap": 2, "cathode_special_cap": 1}`  
**residual** /12: `{"legacy_res": 4, "residual_d50": 3, "residual_d90": 2, "residual_feature": 2, "cathode_feature_res": 1}`  
**probability** /13: `{"clf_d90": 4, "legacy_clf": 3, "clf_d50": 2, "clf_feature": 2, "cathode_feature_clf": 1, "cathode_special_clf": 1}`

## 결과 (temp3 1만 · CSV 실측)

| 항목 | 값 |
|------|-----|
| temp3 행 수 | **10000** |
| 용량 MAE / R² | **3.7469** / 0.848636 |
| 잔류 MAE / R² | **221.2152** / 0.844861 |
| 불량@0.4 맞춤 / 놓침 / 포착 | **84.43%** / **60** / 93.07% |

### 임계값별 검사·포착 (T = 0.10 ~ 1.00, 0.05 단위)

**출처: `temp3.probability` vs CSV `quality_defect`.**  
예측 불량 = `temp3.probability ≥ T`. 실제 불량 = CSV **866건**/10000.

| 임계값 | 검사 LOT 수 | 검사 비율 | 불량 포착률 | 정밀도 | 놓친 불량 수 |
|--------|------------:|----------:|------------:|-------:|-------------:|
| 0.10 | 5183 | 51.83% | 99.77% | 16.67% | 2 |
| 0.15 | 4399 | 43.99% | 99.54% | 19.60% | 4 |
| 0.20 | 3772 | 37.72% | 98.50% | 22.61% | 13 |
| 0.25 | 3287 | 32.87% | 97.69% | 25.74% | 20 |
| 0.30 | 2901 | 29.01% | 96.42% | 28.78% | 31 |
| 0.35 | 2591 | 25.91% | 94.92% | 31.73% | 44 |
| **0.40** | **2303** | **23.03%** | **93.07%** | **35.00%** | **60** |
| 0.45 | 2061 | 20.61% | 90.42% | 37.99% | 83 |
| 0.50 | 1848 | 18.48% | 88.22% | 41.34% | 102 |
| 0.55 | 1630 | 16.30% | 85.45% | 45.40% | 126 |
| 0.60 | 1430 | 14.30% | 81.52% | 49.37% | 160 |
| 0.65 | 1270 | 12.70% | 77.71% | 52.99% | 193 |
| 0.70 | 1079 | 10.79% | 73.21% | 58.76% | 232 |
| 0.75 | 911 | 9.11% | 68.01% | 64.65% | 277 |
| 0.80 | 742 | 7.42% | 60.05% | 70.08% | 346 |
| 0.85 | 562 | 5.62% | 49.31% | 75.98% | 439 |
| 0.90 | 382 | 3.82% | 36.95% | 83.77% | 546 |
| 0.95 | 147 | 1.47% | 16.51% | 97.28% | 723 |
| 1.00 | 0 | 0.00% | 0.00% | 0.00% | 866 |

## 판정

- 본 표·지표는 `` `temp3` ``에 INSERT한 뒤 **DB에서 다시 읽어** CSV와 대조한 값이다.
- 추론 순서는 capacity → residual_li → probability → quality_defect 이다.

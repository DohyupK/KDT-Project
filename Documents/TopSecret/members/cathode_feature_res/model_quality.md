# 멤버 단독 · cathode_feature_res (residual_li)

최종 갱신: 2026-08-10  
모음: [`../README.md`](../README.md) · 앙상블 집계: [`../../model_quality.md`](../../model_quality.md)

이 문서는 **투표 가중 합산 전**, 멤버 `cathode_feature_res` **단독 출력** vs CSV 실측이다.

---

## 0. 멤버 역할

| 항목 | 값 |
|------|-----|
| head | `residual_li` |
| member_id | `cathode_feature_res` |
| 현재 가중 | **3** / 분모 11 |
| 타깃 | `residual_li` (ppm) |
| 비고 | residual_li 투표 멤버 (가중 합 11) |

예측 = 해당 멤버 XGB+Cat(0.5/0.5) 단독. **다른 멤버와 가중 평균하지 않음.**

---

## 1. 조인

| 항목 | 내용 |
|------|------|
| 표본 | `` `temp` `` lot_id 순서 1만 ∩ CSV `id` |
| 매칭 | **10000 / 10000** |
| 실측 CSV | capacity→`cathode_reg_data.csv` · residual→`cathode_qc_reg_data.csv` |

---

## 2. 회귀 성능 (residual_li)

| 지표 | 값 |
|------|-----|
| MAE | **353.6855** |
| RMSE | **448.7847** |
| Bias (pred−true) | +0.0225 |
| MAPE | 11.73% |
| Pearson r | **0.775408** |
| R² | **0.600252** |
| 실측 평균 / 예측 평균 | 3200.1828 / 3200.2053 |
| 예측 min–max | 1817.4059 – 5772.1033 |

---

## 3. 한 줄

`cathode_feature_res` 단독: MAE=353.6855, RMSE=448.7847, r=0.775408, R²=0.600252 · 현재 가중 3/11.

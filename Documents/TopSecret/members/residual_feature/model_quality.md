# 멤버 단독 · residual_feature (residual_li)

최종 갱신: 2026-08-10  
모음: [`../README.md`](../README.md) · 앙상블 집계: [`../../model_quality.md`](../../model_quality.md)

이 문서는 **투표 가중 합산 전**, 멤버 `residual_feature` **단독 출력** vs CSV 실측이다.

---

## 0. 멤버 역할

| 항목 | 값 |
|------|-----|
| head | `residual_li` |
| member_id | `residual_feature` |
| 현재 가중 | **2** / 분모 11 |
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
| MAE | **226.2814** |
| RMSE | **289.7863** |
| Bias (pred−true) | -1.9491 |
| MAPE | 7.50% |
| Pearson r | **0.91291** |
| R² | **0.833327** |
| 실측 평균 / 예측 평균 | 3200.1828 / 3198.2337 |
| 예측 min–max | 1116.4365 – 6933.8638 |

---

## 3. 한 줄

`residual_feature` 단독: MAE=226.2814, RMSE=289.7863, r=0.91291, R²=0.833327 · 현재 가중 2/11.

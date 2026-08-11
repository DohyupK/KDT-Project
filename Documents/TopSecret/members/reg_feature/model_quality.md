# 멤버 단독 · reg_feature (capacity)

최종 갱신: 2026-08-10  
모음: [`../README.md`](../README.md) · 앙상블 집계: [`../../model_quality.md`](../../model_quality.md)

이 문서는 **투표 가중 합산 전**, 멤버 `reg_feature` **단독 출력** vs CSV 실측이다.

---

## 0. 멤버 역할

| 항목 | 값 |
|------|-----|
| head | `capacity` |
| member_id | `reg_feature` |
| 현재 가중 | **2** / 분모 11 |
| 타깃 | `capacity` (mAh/g) |
| 비고 | capacity 투표 멤버 (가중 합 11) |

예측 = 해당 멤버 XGB+Cat(0.5/0.5) 단독. **다른 멤버와 가중 평균하지 않음.**

---

## 1. 조인

| 항목 | 내용 |
|------|------|
| 표본 | `` `temp` `` lot_id 순서 1만 ∩ CSV `id` |
| 매칭 | **10000 / 10000** |
| 실측 CSV | capacity→`cathode_reg_data.csv` · residual→`cathode_qc_reg_data.csv` |

---

## 2. 회귀 성능 (capacity)

| 지표 | 값 |
|------|-----|
| MAE | **3.822** |
| RMSE | **4.8907** |
| Bias (pred−true) | +0.0007 |
| MAPE | 1.92% |
| Pearson r | **0.915443** |
| R² | **0.838005** |
| 실측 평균 / 예측 평균 | 199.9975 / 199.9982 |
| 예측 min–max | 142.0932 – 231.6943 |

---

## 3. 한 줄

`reg_feature` 단독: MAE=3.822, RMSE=4.8907, r=0.915443, R²=0.838005 · 현재 가중 2/11.

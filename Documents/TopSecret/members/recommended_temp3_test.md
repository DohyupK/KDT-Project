# 추천 가중 실험 · `temp3` (완료 후 원복)

최종 갱신: 2026-08-10  
가정: [`summary_15_models_plain.md`](./summary_15_models_plain.md) §5 추천 가중  
(투표 멤버 + 기존모델, special_cap=1 · special_res=0 · residual_score=0)

## 테스트에서 바뀐 것 / 원복

| 항목 | 테스트 중 | 원복 |
|------|-----------|------|
| 테이블 | MariaDB `` `temp3` `` | **DROP** (완료) |
| 코드 | 임시 `score_recommended_to_temp3.py` | **삭제** (완료) |
| `voting_config.json` | **미변경** | — |
| `` `temp` `` / `judgment_lots` | **미변경** | — |
| 남긴 문서 | 본 파일 · [`_eval_recommended_temp3.json`](./_eval_recommended_temp3.json) | 유지 |

## 적용 가중

**capacity** 분모 15: `{"legacy_reg": 4, "reg_d50": 3, "reg_d90": 3, "reg_feature": 2, "cathode_feature_cap": 2, "cathode_special_cap": 1}`  
**residual** 분모 12: `{"legacy_res": 4, "residual_d50": 3, "residual_d90": 2, "residual_feature": 2, "cathode_feature_res": 1}`  
**probability** 분모 13: `{"clf_d90": 4, "legacy_clf": 3, "clf_d50": 2, "clf_feature": 2, "cathode_feature_clf": 1, "cathode_special_clf": 1}`  

cascade clf 입력 capacity/residual = **이번 추천 앙상블 예측**.  
`quality_defect` 저장 = `probability ≥ 0.4`.

## 결과 (1만 · CSV 실측)

### 용량 / 잔류

| 항목 | 추천가중 temp3 | 현 투표 `temp` | 기존모델 단독 temp2 |
|------|---------------:|---------------:|-------------------:|
| 용량 MAE | **3.7469** | 4.7928 | 3.7749 |
| 용량 R² | 0.848636 | 0.696846 | 0.842497 |
| 잔류 MAE | **221.2152** | 331.3331 | 219.9452 |
| 잔류 R² | 0.844861 | 0.621055 | 0.842476 |

vs 현 투표: 용량 MAE Δ -1.0459 · 잔류 MAE Δ -110.1179

### 불량 @0.4

| 항목 | 추천가중 temp3 | 현 투표 `temp` | 기존모델 temp2 |
|------|---------------:|---------------:|---------------:|
| 맞춤 | **84.4%** | 81.1% | 83.9% |
| 정밀도 | 35.0% | 29.6% | 34.3% |
| 놓침 FN | **60** | 125 | 52 |
| 포착 | 93.1% | 85.6% | 94.0% |
| F1 | 0.5087 | 0.439893 | 0.502935 |

### 임계별 (추천 앙상블)

| 임계 T | 검사 건수 | 실제1비율 | 놓침 | 맞춤 |
|-------:|----------:|----------:|-----:|-----:|
| 0.2 | 3772 | 22.6% | 13 | 70.7% |
| 0.4 | 2303 | 35.0% | 60 | 84.4% |
| 0.6 | 1430 | 49.4% | 160 | 91.2% |
| 0.8 | 742 | 70.1% | 346 | 94.3% |

## 판정

- **회귀:** 현 투표 대비 용량·잔류 MAE **대폭 개선** (4.79→3.75, 331→221). 기존모델 단독과 거의 동일 수준.
- **분류:** 현 투표 대비 FN **125→60**, Acc 81.1%→84.4%, F1 0.44→0.51. 기존모델 단독(FN52)에 가깝고 `clf_d90`(FN39)보다는 약간 못함.

## 원복 체크리스트

- [x] 결과 문서·JSON 보존
- [x] `DROP TABLE temp3`
- [x] 임시 스크립트 삭제
- [x] summary에 실험 결과 §5.5 반영
- [x] voting_config / temp / judgment_lots 미변경

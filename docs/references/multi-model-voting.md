# 다중 모델 투표 앙상블 — 결정 기록

최종 갱신: 2026-08-18  
관련: [`model-training-methods.md`](./model-training-methods.md) · [`ai-service/models/voting_config.json`](../../ai-service/models/voting_config.json) · [`ai-service/models/recipe.json`](../../ai-service/models/recipe.json)

활성 경로: cascade voting (`POST /predict-voting`).  
레거시 단일 헤드도 **`ai-service/models/legacy/`** 에서 로드해 capacity/residual/불량 blend에 포함한다 (구 `temp/models_backup_*` 경로 폐기).

**DB 3단 쓰기·폴러:** [`issue-lot-api.md`](./issue-lot-api.md) (`lot_results` → `judgment_lots` → `analysis_lots`).

## 1. 목적

`lots` 공정 파라미터로 `/predict-voting` 추론. 앙상블 가중·스테이지는 본 문서.

## 2. 데이터·아티팩트

- 피처 CSV: `ai-service/data/cathode_{clf,reg,qc_reg}_data.csv`
- 운영 모델: `ai-service/models/` (`voting/` · `legacy/` · `symbolic_model/` · `voting_config.json`)

## 3. 학습 합의 (멤버 학습 시)

- 기존 파이프라인 + **`N_FOLDS = 6`** · Test holdout 미사용
- 멤버 산출물: `ai-service/models/voting/<member>/`

## 4. 운영 투표 가중 (현 config)

| 용도 | 분모 | 요지 |
|------|-----:|------|
| capacity | **15** | legacy_reg:4 · d50/d90:3 · feature/feat_cap:2 · special_cap:1 |
| residual_li | **13** | legacy_res:4 · d50/d90:3 · feature:2 · feat_res:1 |
| 불량 | OR | `p_blend=(7·clf_d90+3·legacy)/10` ≥ **0.55** **또는** symbolic ≥ ≈**0.0809** |

`probability` 컬럼에는 **`p_blend` 연속값**을 저장한다 (`store_probability.mode` = `blend`). 예전 `hard_ox`(불량 0.9 / 정상 0.1)는 쓰지 않는다. O/X(`quality_defect`)는 위 OR 규칙 그대로.

상세 상수: `models/recipe.json` · `voting_config.json` (`probability.mode` = `blend_or_symbolic`).

## 5. 추론 스테이지

capacity → residual_li → (blend + symbolic) → quality_defect.  
스테이지 내: `*_d50 || *_d90` 병렬 → 나머지.

## 6. 코드 진입점

| 항목 | 경로 |
|------|------|
| 추론 | `ai-service/voting_predict.py` → `POST /predict-voting` |
| backend | `aiProxy.predictVoting` · `lotScore.scoreLotWithAi` |

3단 쓰기·폴러·NULL FAQ: [`issue-lot-api.md`](./issue-lot-api.md).

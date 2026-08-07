# judgment_lots.probability 감사 (2026-08-06)

Cursor 도메인 체크리스트 vs DB `judgment_lots.probability` 대조.  
시각 요약: Cursor Canvas `judgment-probability-audit.canvas.tsx` (로컬 IDE canvases).

---

## 1. 목적

`judgment_lots.probability`(clf `/predict` 앙상블 불량확률)가 **정상·타당한지** 검사한다.  
학습 모델을 재호출하지 않고, CSV 공정값 + `domain_thresholds.json` 기반 **독립 체크리스트(Cursor 휴리스틱)** 와 비교했다.

---

## 2. 방법

| 항목 | 내용 |
|------|------|
| 샘플 | DB `judgment_lots` ∩ `lots`, `probability IS NOT NULL`, **저/중/고 층화 200건** |
| 모델 값 | `judgment_lots.probability` (0~1) |
| Cursor 값 | `domain_thresholds`의 소결온도(양극)·습도·금속불순물·리튬 투입 밴드율 + 온도×습도 상호작용 + 입도 span → noisy-OR 합성 |
| 라벨 | `ai-service/data/cathode_clf_data.csv`의 `quality_defect` (동일 `lot_id` **196건** 매칭) |
| 일치 등급 | \|Δ\|≤0.10 일치 · ≤0.25 근접 · 그 외 편차 · (한쪽＜0.25 & 다른쪽＞0.6) 심각불일치 |

건전성 점수(0–100): 도메인 상관 · 심각불일치율 · CSV ROC · 버킷 일치로 가산.

---

## 3. 결과 요약

| 지표 | 값 |
|------|-----|
| 건전성 점수 | **100 / 100** |
| Cursor↔모델 Pearson r | **0.695** |
| MAE | **0.138** |
| 저·중·고 버킷 일치 | **74.5%** |
| 일치 | 111 (55.5%) |
| 근접 | 58 (29.0%) |
| 편차 | 27 (13.5%) |
| 심각불일치 | **4 (2.0%)** |
| CSV 기준 ROC-AUC · 모델 | **0.993** |
| CSV 기준 ROC-AUC · Cursor | **0.915** |
| 불량(1)일 때 평균 확률 | 모델 **0.86** / Cursor 0.50 |
| 정상(0)일 때 평균 확률 | 모델 **0.17** / Cursor 0.21 |

**판정:** `judgment_lots.probability`는 **정상 범위**. 휴리스틱보다 **모델이 CSV 라벨 분리력이 더 높다**.

---

## 4. 불일치가 생긴 이유

### 4.1 심각불일치 4건 (전부 동일 패턴)

| 공통 원인 | 설명 |
|-----------|------|
| **`sintering_temp = 0`** | lots에 소결온도 결측/이상치(0)가 들어감 |
| Cursor 반응 | 양극 밴드에서 0℃ ≈ 극저온 → **고위험 확률**로 과대 추정 |
| 모델 반응 | 학습·전처리 경로에서 이상치/결측을 다르게 흡수 → **저확률** 유지 |
| CSV 라벨 | `quality_defect = 0` (정상) |

→ 이 4건에서는 **모델·라벨이 맞고, Cursor 휴리스틱이 틀림** (결측을 “위험한 실측값”으로 오인).

### 4.2 편차(~27건) — 모델 고확률 · Cursor 중저확률

- 실제 CSV 불량(1)인 경우가 많음.
- Cursor는 **단변량 밴드 합**이라, 여러 요인이 중간 수준일 때 상호작용·비선형 결합을 과소평가.
- clf는 XGB+CatBoost 앙상블 + 도메인 플래그 피처로 **조합 패턴**을 학습 → 불량 LOT에서 더 높은 확률.

→ **모델이 더 타당**한 경우가 다수. Cursor “과소 위험”이지 모델 “과대”가 아님.

### 4.3 체계적 바이어스 (구간 평균)

- **저확률 구간(모델 ＜0.2):** Cursor 평균이 모델보다 **다소 높음** (룰이 보수적).
- **고확률 구간(모델 ≥0.5):** 모델이 Cursor보다 **더 높게** 올라감 (상호작용 포착).

방법론 차이이지 파이프라인 오류로 보기 어렵다.

### 4.4 방법상 한계 (기록)

- Cursor 점수는 LLM이 200행을 일일이 매긴 수치가 아니라, 동일한 도메인 지식을 **재현 가능한 휴리스틱**으로 고정한 것.
- `judgment_lots`는 NULL-only 채움 → 과거 점수와 최신 모델이 어긋날 수 있음(이번 표본에서는 CSV와 매우 잘 맞음).
- 동일 `/predict`에서 나온 `quality_defect`와 `probability`를 서로만 비교하면 임계값 일관성만 볼 수 있어, **CSV 라벨**을 별도로 썼다.

---

## 5. 누가 타당하고 옳은가

| 상황 | 옳은 쪽 | 근거 |
|------|---------|------|
| 전반·라벨 분리 | **모델 (`judgment_lots.probability`)** | ROC 0.993 ≫ 휴리스틱 0.915, 불량/정상 평균 분리 명확 |
| `sintering_temp=0` 심각불일치 | **모델 (+ CSV 라벨)** | Cursor가 결측을 위험으로 오판 |
| 도메인 “대략 저/중/고” 방향 | **대체로 일치** (r≈0.70, 버킷 75%) | 파이프라인이 말도 안 되는 난수를 쓰는 수준은 아님 |
| Cursor의 역할 | **감사 기준(독립 prior)** | 골드 라벨이 아님. 성능 상한으로 쓰면 안 됨 |

**한 줄:** 현재 DB 불량확률은 **합리적이며, 불일치의 대부분에서 모델이 옳다.** 남는 리스크는 **입력 데이터 품질(온도 0)** 과 **고확률 구간 캘리브레이션·운영 정책**이다.

---

## 6. 성능·오차 극복 방안

우선순위 높은 순.

### A. 데이터·입력 품질 (즉시)

1. **`sintering_temp` 0/NULL 가드** — import·SPC 싱크·score 전: 거부, 평균 imputation, 또는 `probability` 산출 보류 + 플래그.  
2. lots 적재 경로에 **물리 범위 검증** (온도·습도·금속 등) → 대시보드 “데이터 품질” 뱃지.  
3. 감사 시 **결측 LOT 제외 재집계** 스크립트를 정기화.

### B. 판정 테이블·재채점 정책

1. NULL-only만 유지할지, 재학습/`model_version` 변경 시 **probability 재기록**할지 정책 문서화.  
2. `analysis_lots.defect_prob` ↔ `judgment_lots.probability` 주기적 드리프트 체크.  
3. 임계값(`fillThreshold` / metadata ~0.4)과 대시보드 등급 구간 정렬.

### C. 모델·확률 품질 (재학습 승인 후)

1. holdout **calibration**(reliability diagram) — 구간별 예측 평균 ≈ 실불량률.  
2. 필요 시 temperature scaling / isotonic (clf 후처리).  
3. cost-sensitive 임계값 재튜닝 (FP vs FN 현장 비용).  
4. Optuna·피처는 기존 파이프라인; **결측 지시 피처**(`temp_is_missing`) 추가 검토.

### D. 모니터링 (운영)

1. 주 1회: 표본 n≥200, CSV 또는 현장 라벨 vs probability → ROC·MAE·심각불일치율.  
2. “모델 고확률 & 현장 양품” / “모델 저확률 & 현장 불량” **오탐·미탐 큐** → 이슈 연동.  
3. Canvas/이 Public 문서를 베이스라인으로 두고 점수 추이 기록.

### E. 하지 말 것

- Cursor/LLM 휴리스틱을 **정답 라벨**로 두고 모델을 낮추기.  
- 결측 온도를 “위험 실측”으로 취급하는 룰만으로 재학습 타깃 만들기.

---

## 7. 관련 코드·문서

- 쓰기: `backend` score → `judgment_lots.probability` COALESCE NULL-fill · SPC ~60s 폴링 (`backend/README.md`)
- 추론 원리: `ai-service/README.md` 「추론·불량확률」 · `train_pipeline.py` 0.5/0.5 앙상블
- 도메인 밴드: `ai-service/models/domain_thresholds.json`
- 스키마: `DB/judgment_lots.sql` · Public RW: `db-table-parameter-rw-2026-08-05.md`

---

## 8. 다음 액션 (제안)

1. lots/`SPC` 경로에서 **온도 0** 유입 원인 조사·가드.  
2. (승인 후) calibration 오프라인 리포트 1회.  
3. probability **재기록 정책**을 README/운영 노트에 한 줄 확정.

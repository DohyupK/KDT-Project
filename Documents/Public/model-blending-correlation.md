# 모델 블렌딩 · 상관도 적용 메모

최종 갱신: 2026-08-06  
관련: [`model_quality.md`](./model_quality.md) (확률 임계·CSV 정합) · 일지 [`docs/work-log/2026-08-06.md`](../../docs/work-log/2026-08-06.md)

이 문서는 **피처 가중 vs 점수 블렌딩**, **상관행렬·잔류–온도 곡선에서 블렌딩/규칙에 쓸 수 있는 것**, **넣지 말 것**을 정리한다.  
구현 전 설계 메모이며, 코드 반영 여부는 별도 작업으로 둔다.

---

## 1. 현재 학습·추론이 쓰는 입력

세 헤드(clf · capacity · residual) 공통:

| 구분 | 내용 |
|------|------|
| 원본 공정 | 수치 9개 + `operator_id` (**일부 “주요만” 선택 학습 아님**) |
| 제외 | `id`, `timestamp`, 각 타깃 |
| 추가 | 도메인 파생·플래그 (`temp_dev_from_800`, `temp_x_humidity`, `flag_*` 등) |

근거: [`docs/references/cathode-clf-schema.md`](../../docs/references/cathode-clf-schema.md) 등 · `models/*/metadata.json`의 `feature_columns`.

**추론 시 컬럼별 가중치(`metal × 2` 등)를 넣는 API/옵션은 없다.**  
트리 앙상블(XGB+CatBoost 등)은 학습된 분할로 점수만 낸다. 입력에 임의 스케일을 곱하면 경계를 깨뜨리기 쉬워 **비추천**.

---

## 2. 「피처 가중치」vs「블렌딩」

| | 피처 가중치 | 고정 α / 조건부 블렌딩 |
|--|-------------|------------------------|
| 무엇에 곱하나 | **입력 컬럼** | **이미 나온 점수** (`p_model`, `p_focus`) |
| 언제 | 학습·피처 엔지니어링에 가깝음 | 모델 **밖** 후처리 |
| 현재 파이프라인 | 표준 지원 없음 (재학습·파생으로 유사 효과) | 설계·구현으로 가능 |
| α의 의미 | — | **점수끼리** 몇 대 몇 (컬럼 가중 아님) |

- **고정 α:** `p = α·p_model + (1-α)·p_focus` (항상 같은 비율)  
- **조건부:** 예) metal·습도 높을 때만 `p_focus` 비중↑  
- **규칙:** 임계 가산, 판정 임계만 변경, **등급/알람만** 상향 (확률 저장과 분리 권장)

### 추가 학습이 필요한가

| 구성요소 | 재학습 |
|----------|--------|
| 기존 `p_model` | 불필요 (유지) |
| α · 조건 임계만 | 불필요 (손으로 지정·검증) |
| `p_focus` = 작은 모델(로지스틱 등) | **그 보조만** 학습 |
| `p_focus` = 수식·규칙 점수 | 학습 불필요 |

전체 clf/reg/residual **재학습 없이** 규칙·블렌딩 레이어를 얹는 것은 가능하다.

---

## 3. 상관·곡선에서 읽은 것 (적용 후보)

출처: 팀 제공 상관행렬 히트맵(clf / capacity / residual) · Residual Li vs Sintering Temp (rolling mean).  
수치는 그림 기준 요약(데이터셋·시점과 함께 해석).

### 3.1 clf (`quality_defect`)

| 변수 | 타깃 상관(대략) | 블렌딩 |
|------|-----------------|--------|
| `metal_impurity` | ~0.31 | **focus 우선** |
| `humidity` | ~0.23 | **focus 우선** |
| `sintering_temp` / `lithium_input` | ~0.08 / ~0.06 | 선형 focus 약함. 네 개 동등 가중 **비권장** |
| `process_time` | ~−0.04 | focus에 **넣을 근거 약함** |

### 3.2 capacity

| 변수 | 타깃 상관(대략) | 블렌딩 |
|------|-----------------|--------|
| `metal_impurity` | **~−0.62** | capacity focus **핵심** |
| `humidity` | **~−0.51** | capacity focus **핵심** |
| 기타(Li, temp, process_time 등) | \|r\| 작음 | 선형 focus 우선순위 낮음 |

### 3.3 residual_li

| 변수 | 타깃 상관(대략) | 블렌딩 |
|------|-----------------|--------|
| `humidity` | ~0.53 | residual focus **핵심** |
| `lithium_input` | ~0.52 | residual focus **핵심** |
| `metal_impurity` / `sintering_temp` | ~0.10 / ~0.07 | 선형만으로는 약함 |
| **온도–잔류 곡선** | 선형 r는 약해도 **V자** (~**795°C** 근처 최저) | **조건부 규칙** 후보: `|T − T*|` 크면 잔류 위험↑ |

### 3.4 피처↔피처 (시간–온도)

| 값 | 쌍 | 해석 | 블렌딩? |
|----|-----|------|---------|
| ~**−0.34 ~ −0.36** | `process_time` ↔ `sintering_temp` | 공정상 **의미 있는 반비례**일 수 있음 | **타깃 블렌딩 가중으로 쓰지 않음** |
| ~**−0.04** | (예) `process_time`↔불량, 또는 impurity↔시간 등 **약한 쌍** | 거의 무관 | 가중 근거 없음 |

**요지:** −0.36은 “공정 변수 간 유의미한 관계”이지, “불량/용량/잔류 점수에 process_time을 가중하라”는 뜻이 아니다.

### 3.5 기타

- `d50`–`d90` ~0.83: 다중공선성. 블렌딩 이슈라기보다 피처 중복 참고.  
- clf SHAP에서도 metal·humidity 계열이 상위인 편(선형 상관과 대체로 같은 방향).

---

## 3.6 총합 EDA PDF 보완 (2026-08-05~06, 「시간에 따른 EDA」)

출처: 팀 EDA 요약 PDF (`총합_EDA.pdf`). 수치·서술은 PDF 기준.  
이전 §3의 **피처–타깃 상관**과 맞물려, 블렌딩에 **구조(인과·트랙)** 를 더한다.

### 인과 한 줄 (PDF)

습도↑ / 소성온도가 타겟(~800°C) 이탈 / 리튬 과투입  
→ **잔류 리튬(`residual_li`) 폭증**  
→ (이와 **독립적으로**) **금속 불순물**이 용량을 깎음  
→ **용량(`capacity`)↓** → **불량(`quality_defect=1`)**.

### 투 트랙 (완전 독립에 가까운 주범)

| 주범 (용량을 깎는 쪽) | PDF상 capacity와 | 서로 상관 |
|----------------------|------------------|-----------|
| `residual_li` | ~−0.66 | |
| `metal_impurity` | ~−0.61 | **서로 ~0.10 (거의 독립)** |

의미: 습도만 막아도(잔류 억제) **금속 트랙**으로 용량·품질 리스크가 남는다.  
블렌딩/알람은 두 위험을 **평균으로만 뭉개지 말고**  
`risk ≈ max(track_residual, track_metal)` 또는 **OR 조건**(하나만 켜져도 상승)이 PDF와 맞다.

### 리튬 투입 = 숨은 upstream

- `lithium_input` ↔ `quality_defect` 직접 상관은 약함(~0.07) → clf에 **직접 가중만** 하면 놓치기 쉬움.  
- 그러나 Li ↔ `residual_li` ~0.53 → residual → capacity(~−0.66) → defect(~−0.54) **도미노**.  
- 블렌딩: Li는 **clf 단일 피처 가중**보다 **잔류 헤드/잔류 트랙**으로 넣는 편이 PDF 해석과 일치.

### 도미노 → 헤드 출력 블렌딩

사슬이 증명되었다면, clf `p_focus`에 **원본 공정만** 넣기보다  
이미 병렬 추론되는 **`residual_li`·`capacity` 예측**을 보조 점수로 쓰는 것이 자연스럽다.

예:  
`p_blend = α·p_clf + β·f(residual_hat) + γ·g(−capacity_hat)`  
(또는 등급만: residual 고위험 OR metal 고위험 OR capacity 저위험)

온도: PDF는 **800°C 타겟 이탈 → 잔류 폭증**. §3.3의 V자(~795°C 최저)와 같은 취지 → **잔류 트랙의 조건부**로 `|T−T*|`.

### PDF 기준 — 블렌딩에 추가할 것 / 안 늘려도 되는 것

| 추가 | 내용 |
|------|------|
| ✅ | **투 트랙 OR** (잔류 경로 vs metal 경로) |
| ✅ | **도미노:** clf 블렌딩에 residual·capacity **헤드 출력** |
| ✅ | Li·습도는 residual 트랙·upstream으로 (clf 직접 r만 보고 무시 금지) |
| ✅ | 온도는 선형 가중이 아니라 **800/스위트 이탈** 조건 |
| ❌ | process_time–온도 반비례만으로 새 트랙 |
| ❌ | d50/d90을 이 인과 사슬의 핵심으로 올리기 |
| ❌ | Li를 clf에만 몰아 동일 가중 / 또는 직접 r≈0만 보고 완전 제외 |

---

## 4. 블렌딩·규칙에 적용 가능한 설계 (권장 방향)

구현 전제: **`probability` 저장값과 UI 「위험」을 분리**하는 편이 안전 (`model_quality`의 0.4 경보 vs 고신뢰선과 정합).

1. **헤드별 `p_focus` / 위험 점수 (학습 없이 규칙도 가능)**  
   - clf: metal·humidity (+ 가능하면 아래 3의 헤드 출력)  
   - capacity: metal·humidity (높을수록 용량↓ 위험) · PDF상 residual·metal **양쪽**  
   - residual: humidity·lithium_input + **온도 타겟/스위트 이탈** (`|sintering_temp − ~795|` 또는 800)

2. **투 트랙 OR (PDF 필수 반영)**  
   - `track_metal` vs `track_residual`(습도·Li·온도이탈 → 잔류)  
   - `risk = max(·)` 또는 한 트랙만 켜져도 등급↑ — **평균만으로 병합 금지**

3. **도미노 블렌딩 (헤드 출력)**  
   - `p_blend = α·p_clf + β·f(residual_hat) + γ·g(−capacity_hat)`  
   - Li의 「숨은 배후」는 β 경로로 흡수하는 것을 우선

4. **조건부 블렌딩**  
   - metal 또는 습도/Li/온도이탈 고위험일 때 focus·헤드 보조 비중↑  
   - 온도가 스위트에서 멀 때만 residual 규칙 비중↑

5. **교차 헤드 알람 (점수 강제 혼합보다 먼저 검증 가능)**  
   - metal↑ → 용량·불량 주의 (잔류와 무관하게)  
   - humidity+Li↑ 또는 온도이탈 → 잔류 → 용량·불량 주의  

6. **고정 α 블렌딩**  
   - 규칙·투 트랙이 검증된 뒤 `p = α·p_model + (1−α)·p_focus`  
   - α·β·γ는 홀드아웃·업무 비용으로 튜닝

### 넣지 말 것

- 추론 직전 raw 컬럼에 임의 가중 곱하기  
- `process_time`–`sintering_temp` 상관을 타깃 가중으로 전용  
- residual에 `sintering_temp` **선형** 가중만으로 V자/이탈 관계를 대체하기  
- clf에 metal/humidity/temp/Li **동일 가중** (상관·SHAP·PDF 도미노와 불일치)  
- 습도(잔류)만 보고 metal 트랙을 생략한 단일 트랙 블렌딩  

---

## 5. `model_quality`와의 연결 (판정선)

상세 표: [`model_quality.md`](./model_quality.md) §5 · §5.1.

| 용도 | 감각 (1만 행 ∩ CSV) |
|------|---------------------|
| 경보(현 운영) | `probability ≥ 0.4` (재현율↑·정밀도↓) |
| 고위험 후보 | ≥0.85 → 실제 불량 ~**75%** / ≥0.90 ~**86%** / ≥0.95 ~**94%**(n 작음) |
| 블렌딩 | 확정 라벨 대체가 아니라 **보조 점수·등급**에 쓰는 것이 우선 |

---

## 6. 추론 실행 방식 (참고)

LOT 채점(`lotScore`): 3헤드 **`Promise.all` 병렬** — [`backend/README.md`](../../backend/README.md) · [`ai-service/README.md`](../../ai-service/README.md).  
블렌딩 레이어를 넣을 위치 후보: ai-service `/predict*` 직후, 또는 backend `lotScore` 기록 전.  
(챗봇 `run_all_ready_heads`는 레지스트리 `for` **순차** — LOT 채점과 별개.)

---

## 7. 열린 일 (문서만, 미구현)

- [ ] α·β·γ·임계·온도 스위트스팟(`T*`≈795/800)을 데이터로 고정  
- [ ] focus 점수를 규칙 vs 소형 모델 중 선택  
- [ ] 투 트랙 OR (`max` vs 등급) UX/저장 위치 결정  
- [ ] 도미노: residual/capacity 예측을 clf 블렌딩에 넣을지 A/B  
- [ ] `judgment_lots.probability` 덮어쓰기 여부 정책 (권장: 원본 유지 + 파생 컬럼/등급)  
- [ ] 구현 후 `model_quality` / [`report.md`](./report.md) 동일 슬라이스로 재측정  

---

## 8. 관련 문서

- [`model_quality.md`](./model_quality.md)  
- [`report.md`](./report.md)  
- [`judgment-probability-audit-2026-08-06.md`](./judgment-probability-audit-2026-08-06.md)  
- 스키마: clf / [reg](../../docs/references/cathode-reg-schema.md) / [residual](../../docs/references/cathode-residual-schema.md)  
- 팀 EDA: `총합_EDA.pdf` (로컬 Downloads · 2026-08-05→06 「시간에 따른 EDA」)

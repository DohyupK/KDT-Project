---
doc_id: csv-profile-cathode_qc_reg_data-리튬잔여량
title: 데이터셋 안내 — cathode_qc_reg_data(리튬잔여량).xlsx
category: data_profile
source_path: data/csv_lake/cathode_qc_reg_data(리튬잔여량).xlsx
converted_from: profile
security_level: internal
---

# 데이터셋 안내: `cathode_qc_reg_data(리튬잔여량).xlsx`

이 문서는 **전체 행을 RAG에 넣지 않습니다.** 스키마·규모·샘플만 안내합니다.
원본 표는 `ai-service/data/csv_lake/`에 보관됩니다.

- **행 수:** 10000
- **열 수:** 13
- **원본 경로:** `data/csv_lake/cathode_qc_reg_data(리튬잔여량).xlsx`

## 컬럼

| column | dtype |
| --- | --- |
| id | String |
| timestamp | Datetime(time_unit='us', time_zone=None) |
| d50 | Float64 |
| d90 | Float64 |
| metal_impurity | Float64 |
| lithium_input | Float64 |
| additive_ratio | Float64 |
| process_time | Float64 |
| sintering_temp | Float64 |
| humidity | Float64 |
| tank_pressure | Float64 |
| operator_id | String |
| residual_li | Float64 |

## 샘플 (5행)

| id | timestamp | d50 | d90 | metal_impurity | lithium_input | additive_ratio | process_time | sintering_temp | humidity | tank_pressure | operator_id | residual_li |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LOT-20251202-00000 | 2025-12-02 00:00:00 | 4.32861526771934 | 8.70427808502966 | 0.0193649474316962 | 2.24977818675029 | 0.134978204931376 | 78.0673330401502 | 774.131996306698 | 34.3917184907693 | 102.821694149173 | OP_A | 1899.8 |
| LOT-20251202-00001 | 2025-12-02 00:10:00 | 5.16085009397508 | 9.52608726279441 | 0.0235869246046743 | 1.92703034283425 | 0.15267509342252 | 67.3894901629201 | 823.317986319588 | 59.0179296557442 | 100.198092092683 | OP_A | 3061.587 |
| LOT-20251202-00002 | 2025-12-02 00:20:00 | 3.90139143925227 | 8.32170457675247 | 0.0268986445020488 | None | 0.146454705179311 | 70.5624418005026 | 793.955866705336 | 59.7803307093922 | 97.9572113667881 | OP_A | 3742.394 |
| LOT-20251202-00003 | 2025-12-02 00:30:00 | 4.08761813595702 | 8.99008026889423 | 0.0252667378488052 | 2.07580621111615 | 0.142877572709284 | 72.1086107184896 | 817.256418559434 | 46.748679868923 | 106.424942802611 | OP_A | 3025.672 |
| LOT-20251202-00004 | 2025-12-02 00:40:00 | 4.54421592240993 | 9.143704689501 | 0.0314168198966641 | 2.60886755376487 | 0.153431542683051 | 79.4035016910833 | 786.052333405248 | 55.9460333696275 | 101.951778363474 | OP_A | 3645.211 |

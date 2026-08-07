---
doc_id: csv-profile-cathode_reg_data
title: 데이터셋 안내 — cathode_reg_data.csv
category: data_profile
source_path: data/csv_lake/cathode_reg_data.csv
converted_from: profile
clearance: Confidential
security_level: internal
---

# 데이터셋 안내: `cathode_reg_data.csv`

이 문서는 **전체 행을 RAG에 넣지 않습니다.** 스키마·규모·샘플만 안내합니다.
원본 표는 `ai-service/data/csv_lake/`에 보관됩니다.

- **행 수:** 7652
- **열 수:** 13
- **원본 경로:** `data/csv_lake/cathode_reg_data.csv`

## 컬럼

| column | dtype |
| --- | --- |
| id | String |
| timestamp | String |
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
| capacity | Float64 |

## 샘플 (5행)

| id | timestamp | d50 | d90 | metal_impurity | lithium_input | additive_ratio | process_time | sintering_temp | humidity | tank_pressure | operator_id | capacity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LOT-20251202-00000 | 2025-12-02 0:00 | 4.328615268 | 8.704278085 | 0.019364947 | 2.249778187 | 0.134978205 | 78.06733304 | 774.1319963 | 34.39171849 | 102.8216941 | OP_A | 224.746 |
| LOT-20251202-00001 | 2025-12-02 0:10 | 5.160850094 | 9.526087263 | 0.023586925 | 1.927030343 | 0.152675093 | 67.38949016 | 823.3179863 | 59.01792966 | 100.1980921 | OP_A | 195.759 |
| LOT-20251202-00003 | 2025-12-02 0:30 | 4.087618136 | 8.990080269 | 0.025266738 | 2.075806211 | 0.142877573 | 72.10861072 | 817.2564186 | 46.74867987 | 106.4249428 | OP_A | 201.304 |
| LOT-20251202-00004 | 2025-12-02 0:40 | 4.544215922 | 9.14370469 | 0.03141682 | 2.608867554 | 0.153431543 | 79.40350169 | 786.0523334 | 55.94603337 | 101.9517784 | OP_A | 189.004 |
| LOT-20251202-00005 | 2025-12-02 0:50 | 4.432371444 | 8.69548301 | 0.019992793 | 2.613032682 | 0.150891194 | 58.08007416 | 797.1311293 | 50.54063256 | 102.0367407 | OP_B | 210.59 |

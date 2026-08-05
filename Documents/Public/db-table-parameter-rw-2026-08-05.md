# DB 테이블 · 파라미터 R/W + 페이지 (2026-08-05)

- **DB:** MariaDB `kdt_project` 라이브 18개 객체
- **위치:** `Documents/Public`
- **관련:** [`db-table-column-callsite-audit-2026-08-05.md`](./db-table-column-callsite-audit-2026-08-05.md)
- **이름 변경 후 제거 (2026-08-05):** MariaDB `cathode_*_data` 테이블 제거 · score=`lots` · DROP SQL: [`DB/drop_cathode_source_tables.sql`](../../DB/drop_cathode_source_tables.sql)
- **orphan SPC 제거 (2026-08-05):** `v_spc_charts` · `lot_results` · `lot_spc_results` · `spc_limits` · `control_bounds` TABLE — DROP: [`DB/drop_orphan_spc_objects.sql`](../../DB/drop_orphan_spc_objects.sql) · **유지:** `SPC_LOT` / `SPC_LOT_results`
- **추가 (2026-08-05):** `judgment_lots` — quality/capacity 시드 + residual API JOIN · [`DB/judgment_lots.sql`](../../DB/judgment_lots.sql)
- **갱신 (2026-08-05):** `lots` = QC CSV 공정만 · `lots.residual_li` DROP · API `residualLithium` ← `judgment_lots`
- **싱크 (2026-08-05):** `SPC_LOT` → `lots` 미러 + score · `judgment_lots` NULL-fill AI · `npm run sync:spc-lots`

## 표식 범례

| 기호 | 의미 |
|------|------|
| **R** | 코드가 `SELECT`로 읽음 |
| **W** | 코드가 `INSERT` / `UPDATE` / `DELETE`로 씀 |
| **—** | 해당 주체에서 R/W 없음 |
| **DB** | DB 기본값만 (앱이 컬럼 미명시) |

**주체:** 앱 = Express + ai-service API · 스크립트 = `backend/scripts` · 피더 = `plant_feeder_live.py`

**페이지 열:** FE 라우트. 페이지가 없으면 `(API/스크립트/피더만)` 으로 표기.

---

## 페이지 ↔ 테이블 맵 (앱)

| 페이지 / UI | 주로 건드리는 테이블 | R | W |
|-------------|----------------------|:-:|:-:|
| `/login` | `users` | ✓ | ✓ (가입·비번재설정) |
| PersonalInfoModal (헤더「내 정보」) | `users` | ✓ | ✓ |
| `/setting` | `user_settings` | ✓ | ✓ |
| `/setting` 제어한계 | *(MariaDB 아님)* `control_bounds.json` | ✓ | ✓ |
| `/dashboard` | `lots` | ✓ | — (화면은 조회·CSV) |
| `/issue` | `issues`, `handover_history`, (`lots` JOIN·시스템 LOT) | ✓ | ✓ |
| `/knowledge` | `handover_history` (완료분) | ✓ | — |
| `/inquiry` | `inquiries` (+ 작성 시 `users` 프로필 R) | ✓ | ✓ |
| GlobalChatbot (`/main` 등 shell) | `user_chat_threads`, `user_chat_messages` | ✓ | ✓ |
| `/security` SecurityChatbot | `user_chat_threads`, `user_chat_messages` | ✓ | ✓ |
| *(페이지 없음)* `POST /api/lots/score` · import | `lots` R+W · `issues` W | ✓ | ✓ |
| *(페이지 없음)* plant_feeder | `SPC_LOT` / `SPC_LOT_results` | ✓ | ✓ |
| *(페이지 없음)* sync:spc-lots | `SPC_LOT` R → `lots`/`analysis_lots`/`judgment_lots` W | ✓ | ✓ |
| *(페이지 없음)* seed:judgment-lots | `judgment_lots` | — | ✓ |

---

## 테이블 요약 (R/W · 페이지)

| # | 테이블/뷰 | 앱 R/W | R가 닿는 페이지·경로 | W가 닿는 페이지·경로 |
|---|-----------|:------:|----------------------|----------------------|
| ~~1–3~~ | ~~`cathode_*_data`~~ | **제거됨** | — | — |
| ~~4~~ | ~~`control_bounds` TABLE~~ | **제거됨** | — | — |
| 5 | `handover_history` | R+W | `/issue`(대기), `/knowledge`(완료) | `/issue` (등록·완료) |
| 6 | `inquiries` | R+W | `/inquiry` | `/inquiry` |
| 7 | `issues` | R+W | `/issue` | `/issue` (+ score/handover API) |
| ~~8~~ | ~~`lot_results`~~ | **제거됨** | — | — |
| ~~9~~ | ~~`lot_spc_results`~~ | **제거됨** | — | — |
| 10 | `lots` | R+W | `/dashboard`, `/issue`, score API | score · QC reload · sync:spc-lots · import · `/issue` |
| 10b | `judgment_lots` | R+W | `/dashboard`, `/issue` (JOIN residual) | score (NULL-fill) · seed · rollback |
| ~~11~~ | ~~`spc_limits`~~ | **제거됨** | — | — |
| 12 | `SPC_LOT` | R (sync) | *(피더 + sync:spc-lots)* | *(피더)* |
| 13 | `SPC_LOT_results` | — | *(피더)* | *(피더)* |
| 14 | `user_chat_messages` | R+W | `/main` 챗 · `/security` | `/main` 챗 · `/security` |
| 15 | `user_chat_threads` | R+W | 동일 | 동일 |
| 16 | `user_settings` | R+W | `/setting` · AppShell | `/setting` |
| 17 | `users` | R+W | `/login` · PersonalInfo · `/inquiry` | `/login` · PersonalInfo |
| ~~18~~ | ~~`v_spc_charts`~~ | **제거됨** | — | — |

---

## 1–3. `cathode_*_data` — **제거됨**

앱·스크립트·`DB/schema.sql`에서 삭제. 원격 DROP: `DB/drop_cathode_source_tables.sql`.

score는 `lots` 공정 컬럼 → `/predict`·`/predict-residual`. CSV(`*.csv`)·학습 문서는 유지.  
판정 집약: `judgment_lots` ← 시드(clf/reg/QC) + score NULL-fill AI. `lots` ← QC CSV 또는 `sync:spc-lots`(`SPC_LOT`).

---

## 10b. `judgment_lots` — 시드 + score NULL-fill

**페이지:** R=`/dashboard`·`/issue` (JOIN) · W=score·seed·rollback

| 파라미터 | 앱 | 스크립트 | 피더 | R 경로 | W 경로 |
|----------|:--:|:--------:|:----:|--------|--------|
| `lot_id` | R | W | — | JOIN | `seed:judgment-lots` · score · sync |
| `quality_defect` | W† | W | — | — | score(`/predict`) †NULL만 · seed |
| `capacity` | W† | W | — | — | score(`/predict-capacity`) †NULL만 · seed |
| `residual_li` | R · W† | R · W | — | `/dashboard`, `/issue` | score(`/predict-residual`) †NULL만 · rollback · seed |

† UPSERT: `COALESCE(existing, VALUES(...))` — 값이 있으면 유지.

---

## 4. `control_bounds` TABLE — **제거됨**

DROP: [`DB/drop_orphan_spc_objects.sql`](../../DB/drop_orphan_spc_objects.sql).  
**페이지:** `/setting`은 **JSON 파일**만 사용 (`control_bounds.json`).

---

## 5. `handover_history` — 앱 R+W

**페이지:** R=`/issue`(pending), `/knowledge`(completed) · W=`/issue`

| 파라미터 | 앱 | 스크립트 | 피더 | R 경로 | W 경로 |
|----------|:--:|:--------:|:----:|--------|--------|
| `history_id` | R | — | — | `/issue`, `/knowledge` | — (AUTO) |
| `issue_id` | R · W | (migrate) | — | `/issue`, `/knowledge` | `/issue` 등록 |
| `lot_id` | R · W | — | — | `/issue`, `/knowledge` | `/issue` 등록 |
| `risk_level` | R · W | — | — | `/issue`, `/knowledge` | `/issue` 등록 |
| `situation` | R · W | — | — | `/issue`, `/knowledge` | `/issue` 등록 |
| `action` | R · W | (migrate) | — | `/issue`, `/knowledge` | `/issue` 완료 |
| `cause` | R | — | — | `/issue`, `/knowledge` | — (항상 NULL급) |
| `handover_from` | R · W | (migrate) | — | `/issue`, `/knowledge` | `/issue` 등록·완료 |
| `handover_to` | R · W | (migrate) | — | `/issue`, `/knowledge` | `/issue` 완료·UPDATE |
| `manager` | R · W | (migrate) | — | `/issue`, `/knowledge` | `/issue` 등록 |
| `assignee_user_id` | W | — | — | — (DTO 미사용) | `/issue` 등록 |
| `event_date` | R · W | — | — | `/issue`, `/knowledge` | `/issue` 등록 |
| `category` | R · W | (migrate) | — | `/issue`, `/knowledge` | `/issue` 등록 |
| `snapshot_json` | R · W | — | — | `/issue`, `/knowledge` | `/issue` 등록 |
| `archived_at` | R | — | — | `/issue`, `/knowledge` | DB 기본값 |

---

## 6. `inquiries` — 앱 R+W

**페이지:** `/inquiry` (목록·작성·답변)

| 파라미터 | 앱 | 스크립트 | 피더 | R 경로 | W 경로 |
|----------|:--:|:--------:|:----:|--------|--------|
| `id` | R | (seed) | — | `/inquiry` (내부) | — (AUTO) |
| `inquiry_code` | R · W | (seed) | — | `/inquiry` | `/inquiry` 작성 |
| `category` | R · W | (seed) | — | `/inquiry` | `/inquiry` 작성 |
| `visibility` | R · W | (seed) | — | `/inquiry` | `/inquiry` 작성 |
| `status` | R · W | (seed) | — | `/inquiry` | `/inquiry` 작성·답변 |
| `title` | R · W | (seed) | — | `/inquiry` | `/inquiry` 작성 |
| `content` | R · W | (seed) | — | `/inquiry` | `/inquiry` 작성 |
| `author_user_id` | R · W | (seed) | — | `/inquiry` (권한) | `/inquiry` 작성 |
| `author_name` | R · W | (seed) | — | `/inquiry` | `/inquiry` 작성 |
| `author_email` | W | (seed) | — | — (FE 미노출) | `/inquiry` 작성 |
| `answer` | R · W | — | — | `/inquiry` | `/inquiry` 답변 |
| `answered_at` | R · W | — | — | `/inquiry` | `/inquiry` 답변 |
| `answered_by_user_id` | W | — | — | — (FE 미노출) | `/inquiry` 답변 |
| `created_at` | R | DB | — | `/inquiry` | DB 기본값 |

---

## 7. `issues` — 앱 R+W

**페이지:** `/issue` · (past-issues API는 FE 미연결) · score 시 자동 생성은 API

| 파라미터 | 앱 | 스크립트 | 피더 | R 경로 | W 경로 |
|----------|:--:|:--------:|:----:|--------|--------|
| `issue_id` | R · W | (seed/rollback) | — | `/issue` | `/issue` · score · handover |
| `lot_id` | R · W | (seed) | — | `/issue` | `/issue` · score · handover |
| `occurred_at` | R · W | (seed) | — | `/issue` | `/issue` · score · handover |
| `risk_level` | R · W | (seed/rollback) | — | `/issue` | `/issue` · score · handover |
| `status` | R · W | (seed) | — | `/issue` | `/issue` 상태변경 |
| `title` | R · W | (seed) | — | `/issue` | `/issue` · score · handover |
| `action_content` | R · W | (rollback) | — | `/issue` | `/issue` 완료/조치 |
| `assignee_user_id` | R · W | (rollback) | — | `/issue` | `/issue` 업데이트 · handover |
| `completed_at` | R · W | — | — | `/issue` | `/issue` 완료 |

---

## 8. `lot_results` — **제거됨**

피더 결과는 `SPC_LOT_results`. DROP: [`DB/drop_orphan_spc_objects.sql`](../../DB/drop_orphan_spc_objects.sql).

---

## 9. `lot_spc_results` — **제거됨**

앱 SPC = `spcEngine` + `spcPhase1Limits.json` → `analysis_lots.spc_status`. DROP: 동일 SQL.

---

## 10. `lots` — 앱 R+W

**페이지:** R 주력=`/dashboard` · `/issue`는 LOT 연관·시스템 LOT · W 주력=score API (CLI/스크립트), import

| 파라미터 | 앱 | 스크립트 | 피더 | R 경로 | W 경로 |
|----------|:--:|:--------:|:----:|--------|--------|
| `lot_id` | R · W | R · W | ※ | `/dashboard`, `/issue` | score · import · `/issue` 시스템 LOT |
| `recorded_at` | R · W | R · W | ※ | `/dashboard`, `/issue` | score · import |
| `d50` | R · W | R · W | ※ | `/dashboard` | score · import |
| `d90` | R · W | R · W | ※ | `/dashboard` | score · import |
| `metal_impurity` | R · W | R · W | ※ | `/dashboard` | score · import |
| `lithium_input` | R · W | R · W | ※ | `/dashboard` | score · import |
| `additive_ratio` | R · W | R · W | ※ | `/dashboard` | score · import |
| `process_time` | R · W | R · W | ※ | `/dashboard` | score · import |
| `sintering_temp` | R · W | R · W | ※ | `/dashboard` | score · import |
| `humidity` | R · W | R · W | ※ | `/dashboard` | score · import |
| `tank_pressure` | R · W | R · W | ※ | `/dashboard` | score · import |
| `operator_id` | R · W | R · W | ※ | `/dashboard` | score · import · reload:lots-qc |
| `quality_defect` | R (별칭 0) | — | ※ | `/dashboard` | — (판정은 `judgment_lots`) |
| `defect_prob` | R · W | R · W | — | `/dashboard` | score (`analysis_lots`) |
| `residual_lithium` | R · W | R · W | — | `/dashboard` | score → `judgment_lots.residual_li` |
| `residual_margin` | — | — | — | — (계산값만 API) | — |
| `spc_status` | R · W | R · W | — | `/dashboard` | score (`analysis_lots`) |
| `risk_level` | R · W | R · W | ※ | `/dashboard`, `/issue` | score · `/issue` |
| `risk_reason` | R · W | R · W | ※ | `/dashboard`, `/issue` | score |
| `clf_model_version` | — | — | — | — | — |
| `residual_model_version` | — | — | — | — | — |
| `spc_limit_version` | — | — | — | — | — |
| `scored_at` | R · W | R · W | — | `/dashboard` | score (`analysis_lots`) |
| `created_at` | — | — | — | — | — |
| `updated_at` | — | — | — | — | — |

※ 피더는 기본 `SPC_LOT` / `SPC_LOT_results` (§12–13). 운영 `lots`와 별개.

> `/issue`의 SPC·`defectProbability` UI는 **mock** (이 테이블 R과 별개).

---

## 11. `spc_limits` — **제거됨**

`/dashboard` SPC는 `spcPhase1Limits.json`. DROP: [`DB/drop_orphan_spc_objects.sql`](../../DB/drop_orphan_spc_objects.sql).

---

## 12. `SPC_LOT` — 피더 + sync

**페이지:** 없음 · 앱은 `npm run sync:spc-lots`로 미러

| 파라미터 | 앱 | 스크립트 | 피더 | R 경로 | W 경로 |
|----------|:--:|:--------:|:----:|--------|--------|
| `seq` | — | — | R · W | plant_feeder | plant_feeder |
| `lot_id` | — | R | W | `sync:spc-lots` → `lots.id` | plant_feeder |
| `produced_at` | — | R | W | `sync:spc-lots` → `lots.timestamp` | plant_feeder |
| `d50` … `tank_pressure` | — | R | W | `sync:spc-lots` → `lots` | plant_feeder |
| `operator_id` | — | R | W | `sync:spc-lots` → `lots` | plant_feeder |

---

## 13. `SPC_LOT_results` — 피더 (기본)

**페이지:** 없음

| 파라미터 | 앱 | 스크립트 | 피더 | R 경로 | W 경로 |
|----------|:--:|:--------:|:----:|--------|--------|
| `seq` | — | — | R · W | plant_feeder | plant_feeder |
| `lot_id` | — | — | W | — | plant_feeder |
| `quality_defect` | — | — | W | — | plant_feeder |
| `residual_li` | — | — | W | — | plant_feeder |
| `measured_at` | — | — | W | — | plant_feeder |

---

## 14. `user_chat_messages` — 앱 R+W

**페이지:** GlobalChatbot(`/main` 등 shell) · SecurityChatbot(`/security`)

| 파라미터 | 앱 | 스크립트 | 피더 | R 경로 | W 경로 |
|----------|:--:|:--------:|:----:|--------|--------|
| `id` | W | — | — | — (UI 미사용) | 챗 전송 |
| `thread_id` | R · W | — | — | `/main` 챗, `/security` | 챗 전송 |
| `role` | R · W | — | — | `/main` 챗, `/security` | 챗 전송 |
| `content` | R · W | — | — | `/main` 챗, `/security` | 챗 전송 |
| `mode` | R · W | — | — | `/main` 챗, `/security` | 챗 전송 |
| `provider` | R · W | — | — | `/main` 챗, `/security` | 챗 전송 |
| `sources` | R · W | — | — | `/main` 챗, `/security` | 챗 전송 |
| `created_at` | R · W | — | — | `/main` 챗, `/security` | 챗 전송 |

---

## 15. `user_chat_threads` — 앱 R+W

**페이지:** §14와 동일

| 파라미터 | 앱 | 스크립트 | 피더 | R 경로 | W 경로 |
|----------|:--:|:--------:|:----:|--------|--------|
| `id` | R · W | — | — | `/main` 챗, `/security` | 챗 시작/전송 |
| `user_id` | R · W | — | — | `/main` 챗, `/security` | 챗 시작 |
| `channel` | R · W | — | — | `/main` 챗, `/security` | 챗 시작 |
| `title` | R · W | — | — | `/main` 챗, `/security` | 챗 시작 (대개 NULL) |
| `created_at` | R · W | — | — | `/main` 챗, `/security` | 챗 시작 |
| `updated_at` | R · W | — | — | `/main` 챗, `/security` | 메시지마다 |

---

## 16. `user_settings` — 앱 R+W

**페이지:** `/setting` · AppShell에서 설정 R(폰트/테마/새로고침)

| 파라미터 | 앱 | 스크립트 | 피더 | R 경로 | W 경로 |
|----------|:--:|:--------:|:----:|--------|--------|
| `user_id` | R · W | — | — | `/setting`, AppShell | `/setting` 저장 |
| `font_size` | R · W | — | — | `/setting`, AppShell | `/setting` 저장 |
| `theme_mode` | R · W | — | — | `/setting`, AppShell | `/setting` 저장 |
| `refresh_interval` | R · W | — | — | `/setting`, AppShell | `/setting` 저장 |
| `updated_at` | R | DB | — | `/setting` | DB ON UPDATE |

---

## 17. `users` — 앱 R+W

**페이지:** `/login` · PersonalInfoModal · `/inquiry`(작성자 프로필 R) · 이슈 assignee JOIN

| 파라미터 | 앱 | 스크립트 | 피더 | R 경로 | W 경로 |
|----------|:--:|:--------:|:----:|--------|--------|
| `id` | R · W | — | — | 내부 | 업데이트/삭제 WHERE |
| `user_id` | R · W | — | — | `/login`, PersonalInfo, `/inquiry` | `/login` 가입 |
| `password` | R · W | — | — | `/login` | `/login` · PersonalInfo |
| `name` | R · W | — | — | `/login`, PersonalInfo, `/issue` JOIN | `/login` 가입 |
| `phone` | R · W | — | — | `/login`, PersonalInfo | `/login` · PersonalInfo |
| `email` | R · W | — | — | PersonalInfo, `/inquiry` | `/login` · PersonalInfo |
| `created_at` | — | — | — | — | — |
| `updated_at` | — | — | — | — | — |

---

## 18. `v_spc_charts` VIEW — **제거됨**

DROP: [`DB/drop_orphan_spc_objects.sql`](../../DB/drop_orphan_spc_objects.sql).  
**페이지:** 없음 · `/dashboard` SPC는 `lots`(+`analysis_lots`) + JSON

---

*문서 갱신: 2026-08-05 · R/W + 페이지 경로 · Documents/Public*

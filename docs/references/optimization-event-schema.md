# optimization_events → 향후 reg.csv 계약

최종 갱신: 2026-07-24  
적용: `backend` 제어 승인 로그 (`CONTROL_STORE=sqlite|mariadb|memory`)

Approve(제안 승인) 시 **하드웨어 미연동** — 로그만 남긴다.  
5초 내 Undo → `status=reverted` (행 DELETE 금지).  
실측 양/불이 쌓이면 Step 4에서 export → `reg.csv` → 회귀/최적화 학습으로 What-if를 교체한다.

연결 지도: [`control-bounds-wiring.md`](./control-bounds-wiring.md)

## 저장

| 모드 | 위치 |
|------|------|
| sqlite (기본, `CONTROL_STORE` 또는 `CHAT_STORE`) | `backend/data/control.sqlite` |
| mariadb | 테이블 `optimization_events` |
| memory | 프로세스 메모리 (개발용) |

API:

- `POST /api/control/approve` → `status=approved`
- `POST /api/control/approve/:id/revert` → `status=reverted`

## 컬럼

| 컬럼 | 설명 | 향후 reg.csv |
|------|------|----------------|
| `id` | 이벤트 PK | — |
| `session_id` | 챗 세션 | — |
| `lot_id` | LOT id | `id` |
| `before_features` | 조절 전 센서 JSON | 피처 컬럼으로 flatten |
| `proposed_deltas` | Δhumidity, Δsintering_temp 등 | 선택 피처 |
| `after_features` | 제안 적용 후 센서 JSON | 조절값 피처 |
| `prob_before` / `prob_after` | O/X 모델 불량 확률 | 참고 메타 (학습 타깃 아님 가능) |
| `method` | `whatif_grid` (Cold start) | — |
| `status` | `approved` \| `reverted` | — |
| `outcome_quality_defect` | 실측 0/1 (초기 NULL) | **회귀/분류 타깃 후보** |
| `created_at` | 시각 | `timestamp` |

## Step 4 (보류)

- 목표 건수(가이드): 1,000 → 파일럿, 10,000 → 본학습 후보  
- export 스크립트·`train_reg_pipeline.py`는 데이터 축적 후 작성  
- 가상 `reg.csv` 대량 생성 금지

# optimization_events → 향후 학습 export 계약

최종 갱신: 2026-07-29  
적용: `backend` 제어 승인 로그 (`CONTROL_STORE` 또는 `CHAT_STORE` → sqlite 기본)

Approve(제안 승인) 시 **하드웨어 미연동** — 로그만 남긴다.  
5초 내 Undo → `status=reverted` (행 DELETE 금지). **reverted에는 실측 outcome 금지 (400).**  
Undo 타임아웃 후에만 FE 실측 폼 노출.  
실측은 `POST .../outcome`으로만 기록한다 (**가짜 데이터 생성 금지**).  
실측이 쌓이면 Step 4에서 export → 학습 데이터로 What-if를 고도화한다.

연결 지도: [`control-bounds-wiring.md`](./control-bounds-wiring.md)

## 저장

| 모드 | 위치 |
|------|------|
| sqlite (기본) | `backend/data/control.sqlite` |
| mariadb | 테이블 `optimization_events` |
| memory | 프로세스 메모리 (개발용) |

API:

- `POST /api/control/approve` → `status=approved` (+ capacity/residual before/after 예측 메타)
- `POST /api/control/approve/:id/revert` → `status=reverted`
- `POST /api/control/approve/:id/outcome` → 실측 3필드 (덮어쓰기 UPDATE 허용)

## 컬럼

| 컬럼 | 설명 | 향후 export |
|------|------|-------------|
| `id` | 이벤트 PK | — |
| `session_id` | 챗 세션 | — |
| `lot_id` | LOT id | `id` |
| `before_features` / `proposed_deltas` / `after_features` | JSON | 피처 |
| `prob_before` / `prob_after` | O/X 불량 확률 | 참고 |
| `capacity_before` / `capacity_after` | reg **예측** 용량 | 참고 |
| `residual_before` / `residual_after` | residual **예측** ppm | 참고 |
| `method` | `whatif_grid` | — |
| `status` | `approved` \| `reverted` | — |
| `outcome_quality_defect` | **실측** 0/1 | 분류 타깃 |
| `outcome_capacity` | **실측** mAh/g (선택) | 회귀 타깃 |
| `outcome_residual_li` | **실측** ppm (선택) | 회귀 타깃 |
| `created_at` | 시각 | `timestamp` |

## 실측 검증 (하드 400)

| 필드 | 범위 | 소수 |
|------|------|------|
| `outcome_quality_defect` | 0 \| 1 | — |
| `outcome_capacity` | 130.00 ~ 250.00 (null OK) | 2 |
| `outcome_residual_li` | 500.00 ~ 8000.00 (null OK) | 2 |

BE: `backend/src/services/outcomeBounds.ts` · FE: `frontend/src/lib/outcomeBounds.ts`

## What-if 선정 (ai-service)

1. 불량 확률 최소  
2. 동률이면 residual_li 최소  
3. 동률이면 capacity 최대  

## Step 4 (보류)

- 목표 건수(가이드): 1,000 → 파일럿, 10,000 → 본학습 후보  
- export·재학습은 실측 축적 후  
- 가상 CSV 대량 생성 금지

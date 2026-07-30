# Issue / LOT / 인수인계 이력 API (백엔드)

최종 갱신: 2026-07-30

## 규칙

- 이슈 목록: `status <> 완료` AND `risk_level IN (높음, 중간)` — **낮음 제외**
- 목록 DTO에 `actionContent` 없음 (상세·PUT에만)
- 완료 → `handover_history` → 라이브러리 「인수인계 이력」
- 위험 LOT Top: `GET /api/lots/risk-top` (`lots` 쿼리, 별도 Top 테이블 없음)
- 채점: `lotScore.ts` 잠정 휴리스틱 (불량확률·SPC 파이프라인 확정 시 교체)

## 엔드포인트

| Method | Path | Auth | 설명 |
|--------|------|------|------|
| GET | `/api/lots/risk-top?limit=10` | 선택 | 높음·중간 LOT |
| GET | `/api/lots/:lotId` | 선택 | LOT 상세 |
| POST | `/api/lots/import` | JWT | CSV→lots 적재·채점 + 이슈 시드 |
| GET | `/api/issues` | 선택 | 미완료∩높음\|중간. query: search, date, lotId, riskLevel, status |
| GET | `/api/issues/:issueId` | 선택 | 상세(조치내용 포함) |
| PUT | `/api/issues/:issueId` | JWT | body: status, actionContent, completed |
| GET | `/api/knowledge/handover-history` | 선택 | 인수인계 이력 |

## DDL

- [`backend/src/sql/issue_lot_tables.sql`](../backend/src/sql/issue_lot_tables.sql)
- [`backend/schema.sql`](../backend/schema.sql)

## FE 담당자에게

Issue/Knowledge mock을 위 API로 교체. UI·레이아웃은 FE.

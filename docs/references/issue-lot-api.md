# Issue / LOT / 과거 자료 API (백엔드)

최종 갱신: 2026-07-30

## 규칙

- 이슈 목록: `status <> 완료` AND `risk_level IN (높음, 중간)` — **낮음 제외**
- 목록 DTO에 `actionContent` 없음 (상세·PUT에만)
- **완료 → 라이브러리 「과거 자료」** (`issues.completed` / `completed_at`). **인수인계 이력으로 넣지 않음**
- 인수인계(`handover_history`)·이슈 연동: **후속**
- 과거 자료 필터·표 형태 전환: **후속** (형태 미정)
- 위험 LOT Top: `GET /api/lots/risk-top`
- 채점: `lotScore.ts` 잠정 휴리스틱

## 엔드포인트

| Method | Path | Auth | 설명 |
|--------|------|------|------|
| GET | `/api/lots/risk-top?limit=10` | 선택 | 높음·중간 LOT |
| GET | `/api/lots/:lotId` | 선택 | LOT 상세 |
| POST | `/api/lots/import` | JWT | CSV→lots 적재·채점 + 이슈 시드 |
| GET | `/api/issues` | 선택 | 미완료∩높음\|중간 |
| GET | `/api/issues/:issueId` | 선택 | 상세(조치내용 포함) |
| PUT | `/api/issues/:issueId` | JWT | body: status, actionContent, completed |
| GET | `/api/knowledge/past-issues` | 선택 | **과거 자료** 목록 |
| GET | `/api/knowledge/past-issues/:issueId` | 선택 | 과거 자료 상세(분석·조치) |
| GET | `/api/knowledge/handover-history` | 선택 | 인수인계(후속; 완료와 무관) |

## 과거 자료 목록 (4.1)

위험도·처리상태 **미포함**.

| UI | 필드 |
|----|------|
| 이슈 ID | `issueId` |
| 일시 | `occurredAt` |
| LOT-ID | `lotId` |
| 이슈 내용 | `title` |
| 담당자 | `assigneeName` |
| 처리날짜 | `completedAt` |

```json
{
  "items": [
    {
      "issueId": "ISS-...",
      "occurredAt": "2026-07-28 10:00:00",
      "lotId": "LOT-...",
      "title": "이슈 내용",
      "assigneeName": "홍길동",
      "completedAt": "2026-07-30 12:00:00"
    }
  ],
  "total": 1
}
```

## 과거 자료 상세 (4.3)

클릭 시 **이슈 상세 분석 + 조치 내용**. UI 양식은 TBD.

`GET /api/knowledge/past-issues/:issueId` → `{ item }`

- `actionContent` — 조치 내용
- `lot` — LOT 보조 지표 (양식 TBD용)

완료 판정: `status = '완료'` 또는 `completed_at IS NOT NULL` (`completed` 컬럼 없음).

## DDL

- [`backend/src/sql/issue_lot_tables.sql`](../backend/src/sql/issue_lot_tables.sql)
- [`backend/schema.sql`](../backend/schema.sql)
- AWS 정리: `npm run migrate:schema-cleanup`

## FE

과거 자료 컬럼·상세 셸을 위 계약에 맞춤. 인수인계·필터 표 전환은 후속.

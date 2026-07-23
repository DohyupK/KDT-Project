# 2026-07-23 작업 기록 — Issue 페이지 백엔드 연동

## 완료

### Backend
- `issues` 테이블 DDL (`schema.sql`)
- `GET /api/issues` — 이슈 목록 (query: search, date, lot, risk, status)
- `GET /api/issues/:id` — 이슈 상세
- `PUT /api/issues/:id` — assignee, status, action, completed 저장
- `GET /api/issues/handover/summary` — 인수인계 요약 KPI
- `MOCK_ISSUES=true` in-memory fallback (기존 8건 mock 데이터)

### Frontend
- `issueApi.ts` — getIssues, getIssueById, updateIssue, getHandoverSummary
- `types/index.ts` — IssueItem, HandoverSummary 등
- `issue/page.tsx` — API 연동, 로딩/에러 UI, handleSave → API
- 인수인계 노트·PDF/CSV 1차 mock/로컬 유지

## API 스펙

### PUT /api/issues/:id
```json
{
  "assignee": "김현수",
  "status": "조치 중",
  "action": "조치 내용",
  "completed": false
}
```

### GET /api/issues/handover/summary
```json
{
  "summary": {
    "period": "2026-07-21 08:00 ~ 16:00",
    "averageTemperature": 742.6,
    "averagePressure": 1.94,
    "averageSpeed": 35.2,
    "aiRiskPredictions": 5,
    "riskyLots": 3,
    "issueCount": 4
  }
}
```

## 검증
1. 로그인 후 `/issue` 접속 → 8건 이슈 표시
2. 이슈 선택 → 조치 저장 → 상태 반영
3. `MOCK_ISSUES=true`로 DB 없이 동작

## 다음 페이지
- **Knowledge** — 지식베이스 API 연동

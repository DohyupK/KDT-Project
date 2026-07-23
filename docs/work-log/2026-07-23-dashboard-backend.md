# 2026-07-23 작업 기록 — Dashboard 페이지 백엔드 연동

## 완료

### Backend
- `GET /api/dashboard/summary?startDate=&endDate=&product=&line=` (JWT)
- `dashboard.service.ts` — mock 생산 레코드 생성 + `cathode_classification_data` DB 집계
- `MOCK_DASHBOARD=true` in-memory fallback

### Frontend
- `dashboardApi.ts` — `getSummary(params)`
- `types/index.ts` — `DashboardProductionRecord`, `DashboardSummaryResponse` 등
- `dashboard/page.tsx` — API 연동
  - 필터(기간·제품·라인) 변경 시 API 재호출
  - 직전 기간 비교용 2차 API 호출
  - 로딩/에러 UI
  - `STAFF_MEMBERS`, 자동발송, 리포트 모달 mock 유지

## API 스펙

### GET /api/dashboard/summary
```json
{
  "records": [
    {
      "date": "2026-05-01",
      "product": "프레스 모듈 A",
      "line": "라인-1",
      "production": 200,
      "defectCount": 5,
      "targetProduction": 220,
      "defects": {
        "기계 결함": 2,
        "원자재 불량": 1,
        "작업자 실수": 1,
        "온도 이상": 1
      }
    }
  ],
  "meta": {
    "minDate": "2026-05-01",
    "maxDate": "2026-06-14",
    "products": ["프레스 모듈 A", "..."],
    "lines": ["라인-1", "..."]
  }
}
```

## 검증
1. 로그인 후 `/dashboard` 접속
2. 날짜/제품/라인 필터 변경 → KPI·차트·테이블 갱신
3. `MOCK_DASHBOARD=true`로 DB 없이 동작 확인

## 참고
- DB 연결 시 `cathode_classification_data` 일별·operator 집계 사용
- DB 비어 있거나 미연결 시 기존 mock과 동일한 seeded 데이터 반환

## 다음 페이지
- **Issue** — 이슈 관리 API 연동

# 2026-07-23 작업 기록 — Main 페이지 백엔드 연동

## 완료

### Backend
- `GET /api/main/overview` — KPI·AI 추론·알림·최신 LOT (JWT 필요)
- `cathode_classification_data`, `daily_defect_rates` 테이블 조회
- `MOCK_MAIN=true` in-memory fallback (DB 미연결 시 기존 UI mock 데이터 반환)

### Frontend
- `mainApi.ts` — `getOverview()`
- `types/index.ts` — `MainOverview`, `MainKpi`, `MainAlert` 등
- `main/page.tsx` — API 연동, 로딩/에러 UI
- AI 챗봇 영역은 mock 유지 (overview 데이터로 LOT·원인 문구만 연동)

## API 스펙

### GET /api/main/overview
```json
{
  "overview": {
    "kpi": {
      "sinteringTemp": 748,
      "lithiumInput": 2.85,
      "defectRate": 2.35,
      "equipmentStatus": "가동 중"
    },
    "aiInsight": {
      "cause": "소성 온도 상한 초과 ...",
      "probabilityNote": "불량률 2.5% 도달 확률 95%",
      "suggestions": ["온도 740°C 하향 제안"]
    },
    "alerts": [
      {
        "id": "ALERT-001",
        "title": "불량률 초과 발생",
        "description": "LOT ...",
        "severity": "진행중",
        "lotId": "LOT-..."
      }
    ],
    "latestLot": {
      "lotId": "LOT-...",
      "timestamp": "...",
      "sinteringTemp": 748,
      "lithiumInput": 2.85,
      "qualityDefect": 1
    }
  }
}
```

## 검증
1. 로그인 후 `/main` 접속
2. KPI·AI 추론·알림이 API에서 로드되는지 확인
3. `MOCK_MAIN=true`로 DB 없이 동작 확인

## 참고
- 생산 DB는 `database/.env`의 `cathode_ai_simple_db` 사용
- backend `.env`의 `DB_NAME`/`DB_PASSWORD`를 생산 DB와 맞추면 실데이터 조회 가능
- AI 챗봇 대화 API는 추후 연동

## 다음 페이지
- **Dashboard** — 생산 통계·차트 API 연동

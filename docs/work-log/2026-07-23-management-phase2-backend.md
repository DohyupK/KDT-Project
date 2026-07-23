# 2026-07-23 작업 기록 — Management 페이지 2차 백엔드 연동

## 완료

### Backend
- `GET /api/management/mails` — 메일 목록 (JWT)
- `PATCH /api/management/mails/:id/read` — 메일 읽음 처리
- `GET /api/management/defects` — 생산 라인 불량률 기록
- `GET /api/management/defect-settings` — 임계값·n8n 설정 조회
- `PUT /api/management/defect-settings` — 임계값·n8n 설정 저장
- `management.service.ts` — mock in-memory fallback
- `MOCK_MANAGEMENT_MAIL=true`, `MOCK_MANAGEMENT_DEFECT=true`

### Frontend
- `types/index.ts` — Management 메일·불량률 타입 추가
- `managementApi.ts` — 메일·불량률 API 클라이언트 확장
- `management/page.tsx`:
  - 메일 탭: API 목록 로드, 선택 시 읽음 PATCH
  - 불량률 탭: records·settings API 로드, 임계값 debounce 저장, n8n 토글 PUT
  - 문의 탭: 기존 연동 유지 (updateStatus UI 추가 없음)
  - `INITIAL_MAILS`, `DEFECT_RECORDS` mock 상수 제거

## API 스펙

### GET /api/management/mails
```json
{
  "mails": [
    {
      "id": "MAIL-001",
      "sender": "quality@posco.com",
      "subject": "[긴급] A라인 품질 이상 보고",
      "body": "...",
      "receivedAt": "2026-07-16 09:12",
      "isRead": false
    }
  ]
}
```

### PATCH /api/management/mails/:id/read
```json
{
  "mail": { "id": "MAIL-001", "isRead": true, "...": "..." },
  "message": "메일을 읽음 처리했습니다."
}
```

### GET /api/management/defects
```json
{
  "records": [
    {
      "lineId": "LINE-A",
      "lineName": "A라인",
      "defectRate": 4.2,
      "baseDate": "2026-07-14",
      "defectCount": 42,
      "totalCount": 1000,
      "causeCategory": "표면결함",
      "department": "품질관리팀",
      "prevDefectRate": 2.1
    }
  ]
}
```

### GET / PUT /api/management/defect-settings
```json
{
  "settings": {
    "threshold": 3,
    "n8nEnabled": true
  }
}
```

## 검증 흐름
1. 로그인 후 `/management` → 메일 관리 탭: 7건 목록, 선택 시 읽음 처리
2. 불량률 모니터링 탭: 15건 기록, 임계값 변경 시 알림 대상 갱신, n8n 토글 저장
3. 문의/답변 탭: 기존과 동일 (목록·답변 등록)

## 참고
- `backend/.env`에 `MOCK_MANAGEMENT_MAIL=true`, `MOCK_MANAGEMENT_DEFECT=true` 설정 시 DB 없이 테스트 가능
- 메일·불량률 DB 연동은 추후 `501` → 실제 테이블/집계 쿼리로 확장 예정
- 알림 대상 라인 계산(`getAlertLines`)은 프론트 UI 로직 그대로 유지

## Management 페이지 연동 완료
- 메일 관리 ✅
- 문의/답변 관리 ✅
- 불량률 모니터링 ✅

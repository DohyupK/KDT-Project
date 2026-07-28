# 공정 한계치 · Approve/Undo 연결 지도

최종 갱신: 2026-07-24

Setting UI · Express · ai-service whatif · 제어 로그가 어떻게 이어지는지 요약한다.

## 한계치 (control bounds)

```
Setting page (frontend/src/app/(shell)/setting/page.tsx)
  → settingsApi.get/putControlBounds
  → Express GET|PUT /api/settings/control-bounds  (backend/src/routes/settings.ts)
  → 파일 SSOT: ai-service/config/control_bounds.json
  → agent/bounds_cache.py (mtime 메모리 캐시, DB 없음)
  → agent/whatif.py (격자 clip + boundary_hit / limit_reason)
  → ChatResponse.recommendation → GlobalChatbot
```

| env | 의미 |
|-----|------|
| `CONTROL_BOUNDS_PATH` (backend) | JSON 경로 오버라이드. 기본: `../ai-service/config/control_bounds.json` (backend CWD 기준 resolve) |

기본값: sintering_temp 700–850, humidity 5–95.

## Approve / 5초 Undo

```
GlobalChatbot 「제안 승인」
  → POST /api/control/approve  → optimization_events.status = 'approved'
  → 5초 Undo 스낵바
  → POST /api/control/approve/:id/revert → status = 'reverted' (DELETE 금지)
  → 5초 만료 시 DB는 approved 유지
```

스토어: `CONTROL_STORE` 또는 `CHAT_STORE` (`sqlite` 기본 → `backend/data/control.sqlite`).

## 관련 코드 주석

각 진입점에 “Wiring: …” 주석이 있다.

- `frontend/.../setting/page.tsx` — 한계치 저장
- `frontend/src/api/settingsApi.ts`
- `backend/src/routes/settings.ts`
- `backend/src/routes/control.ts` — approve / revert
- `ai-service/agent/bounds_cache.py`
- `ai-service/agent/whatif.py`

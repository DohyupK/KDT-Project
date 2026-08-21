# 공정 한계치 · Approve/Undo 연결 지도

최종 갱신: 2026-08-14

Setting UI · Express · ai-service whatif · 제어 로그가 어떻게 이어지는지 요약한다.

## 한계치 (control bounds)

```
Express GET|PUT /api/settings/control-bounds  (backend/src/routes/settings.ts)
  → 파일 SSOT: ai-service/config/control_bounds.json
  → agent/bounds_cache.py (mtime 메모리 캐시, DB 없음)
  → agent/whatif.py (격자 clip + boundary_hit / limit_reason)
  → ChatResponse.recommendation → GlobalChatbot

Setting 페이지에 한계치 UI는 없다. `GET|PUT /api/settings/control-bounds`와 `control_bounds.json`만 쓴다. `/setting`은 폰트·테마·새로고침·알림·LLM 키.
```

| env | 의미 |
|-----|------|
| `CONTROL_BOUNDS_PATH` (backend) | JSON 경로 오버라이드. 기본: `../ai-service/config/control_bounds.json` (backend CWD 기준 resolve) |

기본값: sintering_temp 700–850, humidity 5–95.

## Approve / 5초 Undo / 실측 outcome

```
GlobalChatbot 「제안 승인」
  → POST /api/control/approve  → optimization_events.status = 'approved'
    (+ capacity_before/after 메타)
  → 5초 Undo 스낵바
  → POST /api/control/approve/:id/revert → status = 'reverted' (DELETE 금지)
  → 5초 만료 시 DB는 approved 유지
  → (선택) 실측 양/불·용량 입력
  → POST /api/control/approve/:id/outcome
```

스토어: `CONTROL_STORE` 또는 `CHAT_STORE` (`sqlite` 기본 → `DB/data/control.sqlite`).

## 이슈 소프트 조치 (승인/거절 · 기기 미조작)

이슈 ID(`ISS-…`) + 해결방안/조치 질문 → 일반 챗이 `remediation` 카드(2~3문장)를 붙인다.

```
GlobalChatbot 카드 「승인」|「거절」
  → POST /api/control/remediation/decide
  → OPTIMIZATION_EVENTS method=issue_remediation, status=approved|rejected
  → PLC·한계치·설정 API 호출 없음 (작업 의사 로그만)
```

## 관련 코드 주석

각 진입점에 “Wiring: …” 주석이 있다.

- `backend/src/routes/settings.ts` — GET|PUT control-bounds
- `backend/src/routes/control.ts` — approve / revert
- `ai-service/agent/bounds_cache.py`
- `ai-service/agent/whatif.py`

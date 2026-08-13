# Dashboard Focus LOT + Korean Spacing (확정)

최종 갱신: 2026-08-13

## 수정
- `trackPageChatEvent`의 `focusId` = `entityId`(LOT ID) 우선
- dashboard/main focus payload에 `spcGraph: none|present` + SPC `-` 유지
- AI: `이 로트` deixis, focus+SPC 부재 시 `focus_spc_absent` 확정 답(LLM 스킵)
- offscreen `empty_hint`에서 메타 규칙 문구 제거 · 규칙 에코 스트립 · normalize 강화

## 검증
- `/dashboard` LOT 클릭 → F12 `focusId` = LOT ID
- 「이 로트는 왜 SPC 그래프가 없어?」→ 해당 LOT만, SPC 없음 안내
- `/knowledge` 문의 질문 → 공백 있는 확정 안내, 규칙 문장 미노출

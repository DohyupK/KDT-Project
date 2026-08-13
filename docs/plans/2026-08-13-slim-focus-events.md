# Slim Focus Events (확정)

최종 갱신: 2026-08-13

## 결정
- 목록 상한 10건 (3건 규약 없음). 「상세」는 필드 깊이 확장.
- UI 클릭은 `trackPageChatEvent`로 조용히 focus 주입 (칩 UI 없음).
- F12: `console.info('[page-chat-event]', …)` / `[page-chat]`.
- BE: `/api/chat`·stream에 focusId 구조화 로그. DB 미저장.
- AI: focus-first + 유연 이탈; predict는 진단 intent 또는 명시 features만.

## 실무 참고
Product analytics / OpenTelemetry 이벤트 + LLM 문맥 스냅샷. 본 프로젝트는 OTel 스키마 스타일 로그 + page_context 주입만.

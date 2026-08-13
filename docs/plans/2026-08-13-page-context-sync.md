# Page Context Sync & Analysis Fix (확정)

최종 갱신: 2026-08-13

## 원인
- 라우트 변경 시 focus만 지워 Knowledge `pagePayload`(인수인계)가 Inquiry/Setting/SPC까지 잔존
- Inquiry·Setting 미바인딩
- Knowledge가 필터 전 전체 목록 전송
- LLM이 history 사실을 page_context보다 우선

## 수정
- FE `resetForRoute(pathname)` — payload/hints/focus 하드 리셋
- Inquiry·Setting·SPC note 바인딩; Knowledge는 filtered* + filters 메타
- AI: route 가드·topic-shift 강화·history 200자·analysis_mode
- BE: `/inquiry` `/setting` `/knowledge` supplement 금지

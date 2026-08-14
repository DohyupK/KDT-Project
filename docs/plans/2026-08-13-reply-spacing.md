# Reply Spacing Rewrite (확정)

최종 갱신: 2026-08-13

## 규칙
- 기존 normalize 휴리스틱 전면 교체
- 줄바꿈: `다.` / `요.` 뒤에만 (`8.3` 등 일반 `.` 제외)
- 띄어쓰기: 한글 ↔ 영문·숫자·괄호·특수문자 경계 1칸
- 청크·DB 필드 조립: `join_spaced_parts`로 조각마다 공백
- 「지금 로트 / 이거 뭐야」+ focus → `focus_summary` 확정 답 (LLM 스킵)

# 에이전트 룰 · 스킬

최종 갱신: 2026-08-14  
Cursor가 읽는 원본은 아래 세 파일뿐이다. Codex 등은 루트 [`AGENTS.md`](../../AGENTS.md)를 본다.

| 파일 | 적용 | 내용 |
|------|------|------|
| [`.cursor/rules/kdt-project.mdc`](../../.cursor/rules/kdt-project.mdc) | 항상 | 구조 · 문서 워크플로 · 실행 전 승인 · DB 위치 · ERD · 내 정보 모달 |
| [`.cursor/rules/frontend-ui.mdc`](../../.cursor/rules/frontend-ui.mdc) | `frontend/src/app/**/*.tsx`, `components/**/*.tsx` | 반응형 레이아웃 · SPC Grafana (빈 `managementApi.ts` 금지) |
| [`.cursor/skills/project-control/SKILL.md`](../../.cursor/skills/project-control/SKILL.md) | 조율 시 | `direction.md` + 위 룰 |

패키지 AGENTS: [`AGENTS.md`](../../AGENTS.md) · [`frontend/AGENTS.md`](../../frontend/AGENTS.md) · [`ai-service/AGENTS.md`](../../ai-service/AGENTS.md)  
프론트 [`CLAUDE.md`](../../frontend/CLAUDE.md) → `AGENTS.md`.

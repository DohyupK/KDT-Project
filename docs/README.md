# docs (프로젝트 전체)

모노레포(`frontend` / `backend` / `ai-service`) 공통 문서입니다.  
패키지 역할·단독 기동: [`packages.md`](./packages.md). 실행은 루트 [`README.md`](../README.md).

**전체 목록(한 줄 요약):** [`catalog.md`](./catalog.md)

| 경로 | 용도 |
|------|------|
| [direction.md](./direction.md) | **현재 작업 방향** |
| [packages.md](./packages.md) | frontend · backend · ai-service · DB 안내 (구 패키지 README) |
| [work-log/](./work-log/) | 날짜별 작업 상세 · 일일업무보고용 |
| [references/](./references/) | 구현된 동작 명세 · [이슈 보고서](./references/issue-report.md) · [룰·스킬](./references/agent-rules-and-skills.md) · [LLM 튜닝](./references/LLM%20튜닝.md) |
| [guides/](./guides/) | 운영 절차 (MariaDB · Lightsail · GPU 터널) |
| [prompts/](./prompts/) | Cursor에 다시 넣을 프롬프트 |
| [plans/](./plans/) | **사용 종료** (새 할 일 계획 없음) |

## docs vs 룰·스킬

| 구분 | 역할 |
|------|------|
| **docs/** | 사람용 설명·일지·명세 (한 폴더) |
| **시스템** | 루트 README · `AGENTS.md` · `.cursor/` · `docs/prompts/` |
| **룰** | `.cursor/rules/kdt-project.mdc` (항상) · `frontend-ui.mdc` (프론트 TSX) |
| **스킬** | `.cursor/skills/project-control` |

한곳 정리: [agent-rules-and-skills.md](./references/agent-rules-and-skills.md)  
룰이 코드에서 어떻게 도는지: [루트 README — 문서와 AI 규칙](../README.md#문서와-ai-규칙-어떻게-나뉘나)

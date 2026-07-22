# AGENTS.md — 프로젝트 전체 (AI용)

이 파일은 **사람용 설명서가 아닙니다.**  
Cursor / Codex 등이 `frontend` · `backend` · `ai-service` **어디에 작업하든** 지키는 짧은 공통 규칙입니다.

사람용 저장소 안내·룰 구조 설명 → [`README.md`](./README.md)  
업무 방향·일지 → [`docs/`](./docs/)

---

## 공통 규칙

- Preserve the existing project structure and TypeScript compatibility.
- Keep page, component, and API responsibilities clearly separated.
- Do not add, remove, or refactor features outside the requested scope.
- Validate changes with type checks, linting, and a production build.
- Never store API keys, credentials, or other secrets in the repository.

---

## 적용 범위

`frontend` / `backend` / `ai-service` 및 루트 `docs/` · 에이전트 설정.

프론트만의 추가 규칙 → [`frontend/AGENTS.md`](./frontend/AGENTS.md)

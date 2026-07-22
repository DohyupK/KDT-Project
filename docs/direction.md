# 현재 작업 방향 (프로젝트 전체)

최종 갱신: 2026-07-22

모노레포 기준입니다. `frontend` / `backend` / `ai-service`를 모두 포함합니다.

---

## 제품 방향 (기능 전체)

양극재 품질 AI 예측 시스템에 **챗봇**을 둔다.  
데이터는 **이미 DB에 있으며**, 서비스는 DB에서 불러와 사용한다. (원본 파일은 당장 다루하지 않음)

**Gemini**를 활용하며, 대략적인 흐름은 다음과 같다.

1. 정확한 분석  
2. 불량률 예측  
3. 어떤 파라미터를 조정하면 불량률이 내려가는지 유추  
4. 사용자에게 불량률 감소 방안 제시  
5. 사용자가 방안을 선택하면, 웹사이트에서 해당 방안 실행 (**제어 + 권한**)

모호한 질문(예: “요즘 온도가 문제인 것 같은데 불량 좀 줄여줘”)에도 대응하기 위해  
**LLM + RAG + Tool Calling** 형태의 AI Agent 구조를 채택한다.

- 자연어 의도 파악 (LLM)  
- 지식 검색 (RAG)  
- 데이터 분석·제어 연동 (Tool Calling)

세부 구현·툴 분해·화면 설계는 이후 계획에서 다룬다.

---

## 영역 (구현 현황)

| 패키지 | 역할 | 상태 |
|--------|------|------|
| `frontend/` | Next.js App Router UI | Main / Management / Setting UI 구현, 나머지 placeholder |
| `backend/` | Express + MariaDB API | 의존성 스캐폴드, 서버 로직 미구현 |
| `ai-service/` | AI 서비스 (챗봇·Gemini 등) | 폴더만 존재 |

## 완료

- React(Vite) → Next.js App Router 마이그레이션 (`frontend`)
- api / data / types / assets 이전 (`fillThreshold` 보존)
- 루트 `docs/` · 룰·스킬(전체/개별) · README/AGENTS 역할 분리 (2026-07-22)

## 다음 우선순위

1. **frontend:** Dashboard / Login / Issue / Knowledge / Inquiry UI, 공통 Layout  
2. **backend:** Express 서버·API 구현, DB 연동, frontend `rewrites` 연동  
3. **ai-service:** 챗봇·Agent(Gemini + RAG + Tool) 역할·진입점 정의 후 구현  

## 제약

- `frontend/src/types`의 `AppData.fillThreshold` 필드명 변경 금지  
- README에는 상세 변경을 쓰지 않고, 기록은 `docs/work-log/`에 남긴다  
- **전체** 룰·스킬 = 프로젝트 전체, **개별** 룰·스킬 = 중요 페이지·모듈에만 적용  

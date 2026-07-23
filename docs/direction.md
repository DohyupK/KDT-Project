# 현재 작업 방향 (프로젝트 전체)

최종 갱신: 2026-07-23

모노레포 기준입니다. `frontend` / `backend` / `ai-service`를 모두 포함합니다.

---

## 제품 방향 (기능 전체)

양극재 품질 AI 예측 시스템에 **챗봇**을 둔다.  
데이터는 **이미 DB에 있으며**, 서비스는 DB에서 불러와 사용한다. (원본 파일은 당장 다루지 않음)

대략적인 흐름:

1. 정확한 분석  
2. 불량률 예측  
3. 어떤 파라미터를 조정하면 불량률이 내려가는지 유추  
4. 사용자에게 불량률 감소 방안 제시  
5. 사용자가 방안을 선택하면, 웹사이트에서 해당 방안 실행 (**제어 + 권한**)

**LLM + RAG + Tool Calling** Agent.  
당분간 RAG/제어용 **backend는 후순위**, 챗봇은 **ai-service + Main UI**로 먼저 연동한다.

챗봇·연동 경로 지도: [`docs/plans/2026-07-23-chatbot-integration.md`](./plans/2026-07-23-chatbot-integration.md)

---

## 영역 (구현 현황)

| 패키지 | 역할 | 상태 |
|--------|------|------|
| `frontend/` | Next.js App Router UI | AppShell + Main **챗봇 UI 목업**, Login placeholder |
| `backend/` | Express + MariaDB API | 스캐폴드만 (후순위) |
| `ai-service/` | ML 진단 + FastAPI/챗봇 | `train_pipeline` + models + `/predict` + LangGraph `/chat` |

## 완료

- React(Vite) → Next.js 마이그레이션, docs·룰·스킬 정리 (2026-07-22)
- Issue / Knowledge / Inquiry / Dashboard / AppShell /login 진입 (2026-07-22)
- ai-service O/X: 스키마·프롬프트·`train_pipeline` v1.2.0·도메인 피처·Top-4 (2026-07-23)
- Optuna **100 trial** 정식 학습, ROC-AUC 0.940 (2026-07-23)
- 챗봇 연동 작업서 작성 (2026-07-23)

## 다음 우선순위

1. **frontend:** Main 챗봇 목업 → ai-service 실연동 (`/ai` rewrite)  
2. **ai-service:** (선택) `CHAT_USE_LLM=1` + API 키로 LLM 문장화  
3. **frontend:** Login UI (병행 가능)  
4. **backend:** Express·DB·RAG (후순위)

## 제약

- `frontend/src/types`의 `AppData.fillThreshold` 필드명 변경 금지  
- README에는 상세 변경을 쓰지 않고, 기록은 `docs/work-log/`에 남긴다  
- 설치·학습·테스트는 [ask-before-run](../.cursor/rules/ask-before-run.mdc) 승인 후  
- **전체** 룰·스킬 = 프로젝트 전체, **개별** 룰·스킬 = 중요 페이지·모듈에만 적용  

# 현재 작업 방향 (프로젝트 전체)

최종 갱신: 2026-07-24 (보안 탭 vLLM 통신망 · Login/MariaDB 홀딩)

모노레포 기준입니다. `frontend` / `backend` / `ai-service`를 모두 포함합니다.

**보안 골격:** [`docs/references/security-chat-skeleton.md`](./references/security-chat-skeleton.md)  
**vLLM 수동 기동:** [`docs/references/vllm-setup.md`](./references/vllm-setup.md)  
**한계치·Undo 배선:** [`docs/references/control-bounds-wiring.md`](./references/control-bounds-wiring.md)  
**시나리오 스모크:** [`docs/references/scenario-smoke-checklist.md`](./references/scenario-smoke-checklist.md)  
**일지:** [`docs/work-log/2026-07-24.md`](./work-log/2026-07-24.md)

---

## 제품 방향 (기능 전체)

양극재 품질 AI 예측 시스템에 **챗봇**을 둔다.  
일반 챗: Groq/Gemini + predict/whatif.  
보안·기밀: **`/security` → 로컬 vLLM만** (외부 LLM 금지).

---

## 영역 (구현 현황)

| 패키지 | 역할 | 상태 |
|--------|------|------|
| `frontend/` | Next.js | Main LOT 진단 · Setting 한계치 · Approve/Undo · **보안 챗봇 UI** |
| `backend/` | Express | chat · **security-chat** · control · settings |
| `ai-service/` | ML + FastAPI | `/chat` Groq/Gemini · **`/security-chat` vLLM only** |

## 완료 (최근)

- 일반 챗 E2E (LOT·What-if·한계치·Undo) · Optuna 100-trial
- **보안 탭 파이프라인:** `POST /api/security-chat` → `/security-chat` → `CHAT_VLLM_BASE_URL(:8001)` (HF/transformers in-process 없음)

## 다음 우선순위 (할 일)

1. **시나리오 재스모크** — 일반 챗 + 보안 offline/vLLM 수동 기동 후 확인
2. **(홀딩) Login / 승인 권한 고도화** — 백로그
3. **(홀딩) MariaDB 정식 연동** — 백로그 (`CHAT_STORE`/`CONTROL_STORE` sqlite 유지)
4. **실측 outcome** → `outcome_quality_defect` → Step 4 reg 학습
5. **RAG / 자주 쓰는 명령**
6. vLLM에 HF 모델 수동 반입·기동 ([`vllm-setup.md`](./references/vllm-setup.md))

## 제약

- `AppData.fillThreshold` 필드명 변경 금지  
- API 키는 `.env`만  
- 가짜 `reg.csv` 대량 생성 금지  
- 보안 채널에서 Groq/Gemini 폴백 금지  
- 이번 스프린트에서 Login·MariaDB 작업 넣지 않음 (홀딩)

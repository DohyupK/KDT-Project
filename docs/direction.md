# 현재 작업 방향 (프로젝트 전체)

최종 갱신: 2026-07-28 (What-if capacity · 실측 outcome)

모노레포 기준입니다. `frontend` / `backend` / `ai-service`를 모두 포함합니다.

**기능·단가:** [`docs/references/ai-service-feature-catalog.md`](./references/ai-service-feature-catalog.md)  
**clf 스키마:** [`docs/references/cathode-clf-schema.md`](./references/cathode-clf-schema.md)  
**reg 스키마:** [`docs/references/cathode-reg-schema.md`](./references/cathode-reg-schema.md)  
**보안 골격:** [`docs/references/security-chat-skeleton.md`](./references/security-chat-skeleton.md)  
**vLLM 수동 기동:** [`docs/references/vllm-setup.md`](./references/vllm-setup.md)  
**한계치·Undo 배선:** [`docs/references/control-bounds-wiring.md`](./references/control-bounds-wiring.md)  
**시나리오 스모크:** [`docs/references/scenario-smoke-checklist.md`](./references/scenario-smoke-checklist.md)  
**일지:** [`docs/work-log/2026-07-28.md`](./work-log/2026-07-28.md)

---

## 제품 방향 (기능 전체)

양극재 품질 AI 예측 시스템에 **챗봇**을 둔다.  
일반 챗: 등록 LLM + **registry ready 헤드 전부**(clf O/X · reg capacity · 향후 추가) · whatif(clf+capacity).  
보안·기밀: **`/security` → 로컬 vLLM만** (외부 LLM 금지).

---

## 영역 (구현 현황)

| 패키지 | 역할 | 상태 |
|--------|------|------|
| `frontend/` | Next.js | Main LOT · Setting · Approve/Undo · 실측 outcome · 보안탭 API 키 |
| `backend/` | Express | chat · llm-keys · control(+capacity·outcome) · settings |
| `ai-service/` | ML + FastAPI | `/predict` · `/predict-capacity` · whatif clf+reg · registry |

## 완료 (최근)

- clf+reg 자동 다중 호출 · `/predict-capacity`
- **What-if**: 불량 확률 최소 → 동률 시 capacity 최대 · `capacity_before/after`
- **Approve** capacity 메타 · **실측 outcome** API/UI (가짜 데이터 없음)

## 다음 우선순위 (할 일)

1. ~~Login / MariaDB~~ — **안 함** (홀딩 유지)
2. ~~What-if capacity · Approve 실측 outcome~~ — **완료**
3. RAG · vLLM HF 모델 반입
4. **다음:** features 채팅 경로 capacity 필드 브라우저 스모크

## 제약

- `AppData.fillThreshold` 필드명 변경 금지  
- 회사 API 키는 `/security` → DB (마스터 키만 `backend/.env`)  
- 가짜 `reg.csv` 대량 생성 금지 · outcome은 실측 입력만  
- 보안 채널에서 Groq/Gemini 폴백 금지  
- clf는 capacity를 입력으로 쓰지 않음  
- Login·MariaDB 이번 스프린트 미포함

# 패키지 안내 (frontend · backend · ai-service · DB)

최종 갱신: 2026-08-15  
저장소 실행·기술 스택 SSOT: [루트 README](../README.md).  
이 파일은 **패키지 README를 한곳으로 모은** 사람용 설명이다. AI 규약은 각 `AGENTS.md` · [`.cursor/rules/kdt-project.mdc`](../.cursor/rules/kdt-project.mdc).

---

## frontend

브라우저 UI (Next.js App Router). 양극재 LOT·품질·관리·설정·챗봇·로그인.

| 기능 | 경로 | 비고 |
|------|------|------|
| Main | `/main` | LOT·요약 홈 |
| Dashboard | `/dashboard` | 차트·지표 |
| Management | `/management` | SPC Grafana 임베드 (`managementApi.ts` 없음) |
| Setting | `/setting` | 시스템 환경만 |
| Issue / Knowledge / Inquiry | `/issue` `/knowledge` `/inquiry` | |
| Login | `/login` | 셸 밖 |
| 보안 챗 | `/security` · Maximize | SSE |
| 일반 챗 | AppShell → `GlobalChatbot` | `POST /api/chat` |
| 내 정보 | 헤더 프로필 모달 | `/setting#personal`로 가지 않음 |

- App Router: `src/app/(shell)/` + 공통 `AppShell`. `/` → `/main`.
- rewrite: `/api/*` → `:3001`, `/ai/*` → `:8800`
- `AppData.fillThreshold` 필드명 변경 금지
- 권장 기동: AWS 루트 `npm run dev`. 이 PC 보안 워커: `npm run security-pc`. 절차: [`guides/aws-pc-security-worker.md`](./guides/aws-pc-security-worker.md).
- AI 규칙: [`frontend/AGENTS.md`](../frontend/AGENTS.md)

---

## backend

Express `:3001`. 세션 · 보안 게이트 · ai-service 프록시 · auth · 이슈/문의 · 제어/outcome.

진입 `src/index.ts` · 조립 `src/app.ts`. 루트 `.env` (`loadRootEnv`). `AI_SERVICE_URL` 기본 `http://127.0.0.1:8800`.

| prefix | 역할 |
|--------|------|
| `GET /api/health` | 헬스 |
| `/api/auth/*` | JWT 로그인·가입·프로필·탈퇴 |
| `POST /api/chat` · `/api/chat/stream` | 보안 게이트 → ai-service |
| `/api/security-chat` · `/stream` | 클라우드 폴백 없음 |
| `/api/issues` · `/api/lots/*` · `/api/dashboard/*` · `/api/knowledge/*` | 이슈·LOT·KPI·인수인계 |
| `/api/inquiries` | 문의·첨부 |
| `/api/docs/*` | Documents 트리·파일 (읽기 전용) |
| `/api/settings/control-bounds` | 공정 한계치 (파일 SSOT, Setting UI 없음) |
| `/api/llm-keys` | 보안 탭 키 → `DB/data/llm_keys.sqlite` |
| `/api/control/*` | 승인·Undo·outcome |

Auth: `check-id` · `register` · `login` · `find-id` · `verify-reset` · `reset-password` · `logout` · `GET/PUT profile` · `DELETE account` · `GET/PUT settings` · 헤더 알림.

LOT 채점 3단·이슈 메일: [`issue-lot-api.md`](./references/issue-lot-api.md) · [`issue-report.md`](./references/issue-report.md).

```bash
cd backend
npm run sync:spc-lots          # SPC_LOT → lots + 미채점 score
npm run score:lots
npm run refresh:spc-risk
npm run migrate:send-email
npm run send:one-issue-report
```

---

## ai-service

진단 ML · FastAPI `:8800` · LangGraph · Secure RAG. **CWD는 항상 `ai-service/`**.  
API 목록: [`ai-service-feature-catalog.md`](./references/ai-service-feature-catalog.md).

학습 스키마: [`cathode-clf-schema.md`](./references/cathode-clf-schema.md) · [reg](./references/cathode-reg-schema.md) · [residual](./references/cathode-residual-schema.md) · [학습 방법](./references/model-training-methods.md).  
RAG: [`secure-rag.md`](./references/secure-rag.md). 원본 문서는 루트 `Documents/` (`SECURE_DOCS_DIR`).

성능(재학습 없이 holdout 재채점):

```bash
cd ai-service
python scripts/evaluate_models.py
```

지표: `models/metadata.json` · `models/reg/metadata.json` · `models/residual/metadata.json`.

단독 기동: `pip install -r requirements.txt` 후 `python -m uvicorn app.main:app --host 127.0.0.1 --port 8800`.  
일반 챗 API 키는 `.env`가 아니라 `/setting` → `DB/data/llm_keys.sqlite`.  
OCR: OS Tesseract (`kor`+`eng`). 최초 ingest는 [`documents-watcher-qdrant.md`](./references/documents-watcher-qdrant.md) §6 (`python ingest_secure.py` 는 상시 아님). AI 규칙: [`ai-service/AGENTS.md`](../ai-service/AGENTS.md).

---

## DB

산출물은 루트 [`DB/`](../DB/)만. DDL `schema.sql` · `chat_schema.sql` · `send_email.sql` · `text_match.sql` 등. 런타임 SQLite `DB/data/*.sqlite`.

멀티턴 채팅 테이블: `python DB/ai-service/apply_user_chat_tables.py` (일반). 보안 큐: `python DB/ai-service/apply_user_security_tables.py`. 루트 `.env` `DB_*`.  
챗 장기기억 Qdrant: [`references/chat-history-qdrant.md`](./references/chat-history-qdrant.md).

# 세션 체크포인트 (PC 재시작용) — 2026-07-23 오후

**목적:** PC를 껐다 켠 뒤 이 문서부터 이어서 작업한다.  
**작성 시각:** 2026-07-23 ~16:00 KST (임시 저장)

관련: [`docs/work-log/2026-07-23.md`](../work-log/2026-07-23.md) · [`docs/direction.md`](../direction.md) · [`docs/plans/2026-07-23-chatbot-integration.md`](./2026-07-23-chatbot-integration.md)

---

## 한 줄 요약

ML(100 trial) + FastAPI `/predict`·`/chat` + LangGraph(템플릿) + **전역 GlobalChatbot `/ai` 실연동**까지 완료.  
**미커밋 프론트·문서 변경이 워킹트리에 남아 있음** (브랜치 `feature`, origin 대비 ahead 4 + 로컬 수정).

---

## 완료된 것

| 영역 | 내용 |
|------|------|
| ML | `ai-service/train_pipeline.py` v1.2.0, Optuna 100 trial, ROC-AUC≈0.940, `models/` |
| FastAPI | `GET /health`, `POST /predict`, `POST /chat` (`ai-service/app/`) |
| Agent | `ai-service/agent/` LangGraph: predict → compose (기본 template; LLM은 `CHAT_USE_LLM=1`+키) |
| FE 챗봇 | `GlobalChatbot` + AppShell(flex 밖), Main 목업 제거 |
| 연동 | `next.config.ts` `/ai` → `127.0.0.1:8000`, `frontend/src/api/aiApi.ts` |
| 문서/룰 | README 터미널 2개 안내, 설치 시 README 스택 갱신 룰 |
| 스모크 | `:8000`·`:3000/ai` health/chat 200; CDP 챗봇 버튼 오픈 PASS |

---

## 디스크에 남은 미커밋 변경 (재시작 후에도 유지)

**커밋하지 않음.** 재시작 후 `git status`로 확인.

주요 경로:

- `frontend/src/components/chat/GlobalChatbot.tsx` (**신규**)
- `frontend/src/api/aiApi.ts` (**신규**)
- `frontend/src/components/layout/AppShell.tsx` — GlobalChatbot 장착
- `frontend/src/app/(shell)/main/page.tsx` — 목업 챗봇 제거
- `frontend/next.config.ts` — `/ai` rewrite
- `README.md`, `frontend/README.md`, `ai-service/README.md`
- `docs/direction.md`, `docs/work-log/2026-07-23.md`, `docs/plans/…`, `docs/references/important-paths.md`

`ai-service/agent/`, `app/` 본체는 이미 커밋된 상태로 보임 (로컬에 `ai-service/README.md`만 추가 수정).

**커밋하지 말 것:** `frontend/_chrome_profile_chatbot/` (CDP 테스트용, 삭제해도 됨)

브랜치: `feature` (origin/feature 대비 **ahead 4**)

---

## 재시작 후 바로 할 일

### 1) 서버 2개 (각각 한 번만)

```bat
cd C:\Users\OWNER\Downloads\KDT-Project\ai-service
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bat
cd C:\Users\OWNER\Downloads\KDT-Project\frontend
npm run dev
```

- UI: http://localhost:3000  
- Health: http://127.0.0.1:8000/health  
- rewrite: http://localhost:3000/ai/health  
- 포트 충돌 시: `netstat -ano | findstr :8000` / `:3000` → `taskkill /PID … /F`

### 2) `/main` 첫 컴파일이 길면

터미널에 `○ Compiling /main ...` 만 있고 수 분이면:

- 새로고침 연타 금지
- `GET /main 200` 대기 또는 `/setting`으로 워밍업
- 막히면: Ctrl+C → `rmdir /s /q .next` → `npm run dev` 한 번만

### 3) 챗봇 확인

우하단 버튼 → 「샘플 LOT 진단」 → predict Tool 답변

---

## 다음 우선순위 (이어서)

1. Login UI  
2. (선택) LLM 문장화 `CHAT_USE_LLM=1` + `OPENAI_API_KEY`  
3. LOT 선택 → `/chat` `features` 자동 주입  
4. backend RAG/DB (후순위)  
5. (선택) 미커밋 변경 `git commit` — 사용자가 요청할 때만

---

## 알려진 이슈

- Next `/main` Turbopack 첫 컴파일이 매우 느리거나 hang처럼 보임 (페이지 대용량 client 컴포넌트)
- 중복 `npm run dev` / 중복 uvicorn → 포트 충돌 (Errno 10048, Another next dev server)
- Main hydration mismatch(시계) 로그가 난 적 있음 — 클릭은 대체로 동작

---

## AI가 다시 열 때

1. 이 파일 + `docs/direction.md`  
2. `ai-service/AGENTS.md`  
3. `git status`로 미커밋 목록 확인  
4. ask-before-run: 설치·학습·테스트 전 승인

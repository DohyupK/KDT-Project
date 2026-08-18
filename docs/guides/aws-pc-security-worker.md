# 보안 챗 운영 매뉴얼 — AWS 앱 / 이 PC 워커

최종 갱신: 2026-08-18

보안·기밀 상담은 **두 대가 역할을 나눈다.** AWS는 화면과 질문 저장만 하고, 문서 검색과 답 생성은 **이 PC**가 한다.

챗봇 UI·라우팅: [`security-chatbot-guide.md`](../references/security-chatbot-guide.md)  
vLLM 기동: [`vllm-setup.md`](../references/vllm-setup.md)  
Lightsail 이전·방화벽: [`aws-lightsail-gpu-tunnel.md`](./aws-lightsail-gpu-tunnel.md)

---

## 1. 한 줄

| 기계 | 명령 | 하는 일 | 하지 않는 일 |
|------|------|---------|--------------|
| AWS Lightsail | `npm run dev` | 프론트 · 백엔드 · ai-service · 일반 챗 | 보안 워커 · vLLM · `USER_SECURITY_MESSAGES`를 읽고 답 만들기 · LOT `/predict-voting` 채점 (`LOT_SCORE_ON_AWS=0`) |
| 이 PC | `npm run security-pc` | DB 큐 감시 · Qdrant 검색 · vLLM 답 쓰기 | Next/Express/`npm run dev` |

LOT 채점은 [`aws-pc-score-worker.md`](./aws-pc-score-worker.md) · `npm run score-pc`. `security-pc`와 **합치지 않는다.**

`npm run dev`가 워커를 켜지 않는다. `npm run security-pc`가 프론트를 켜지 않는다. **둘을 한 명령으로 합치지 않는다.**

---

## 2. 흐름

```text
브라우저 (AWS UI 「보안 상담」)
  → POST /api/security-chat/stream
  → AWS ai-service: USER_SECURITY_MESSAGES INSERT (user, pending)
  → AWS는 답을 만들지 않음. 표시만 기다림 (SSE peek ~0.4s)

이 PC 워커
  → pending 행을 claim
  → Qdrant secure_docs 검색 + 로컬 vLLM :8001
  → USER_SECURITY_MESSAGES INSERT (assistant)

AWS UI
  → SSE replace/done 또는 GET 스레드 메시지 폴링
  → 먼저 도착한 쪽으로 말풍선 표시
```

일반 상담은 이 경로가 아니다. `USER_CHAT_*` + AWS Knowledge/ Groq·Gemini.

---

## 3. AWS에서 앱 켜기

저장소 루트 (Lightsail Ubuntu, 앱·MariaDB가 같은 기계).

```bash
cd ~/KDT-Project
npm run dev
```

서버 `.env` 요지 (비밀은 커밋하지 않음):

```env
DB_HOST=127.0.0.1
DB_PORT=3306
AI_SERVICE_URL=http://127.0.0.1:8800
QDRANT_URL=http://127.0.0.1:6333
CORS_ORIGIN=http://<퍼블릭IP>
CORS_ORIGINS=http://<퍼블릭IP>
```

확인:

- UI: `http://<퍼블릭IP>/` (Nginx :80) 또는 `:3000`
- `GET http://127.0.0.1:8800/health` → `chat_history_db_ok: true`

Lightsail 방화벽에 **열지 말 것:** 3000, 3001, 3306, 5678, 6333, 8001, 8800.  
**열 것:** SSH 22, HTTP 80.

AWS에서 `npm run security-pc` / `run_security_worker.py` 를 돌리지 않는다.

---

## 4. 이 PC에서 워커 켜기

프론트·백엔드는 켜지 않는다. vLLM은 워커 스크립트가 **재시작하지 않는다.** 모델 서버를 먼저 켠다.

### 4.1 vLLM (이미 켜 둔 전제)

[`vllm-setup.md`](../references/vllm-setup.md). `:8001`이 이 PC에서 듣고 있어야 `npm run security-pc`가 통과한다.

### 4.2 이 PC `.env`

AWS `.env`와 **섞지 않는다.** 터널이 열린 동안 루프백만 본다.

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=kdt
DB_PASSWORD=<AWS와 같은 암호>
DB_NAME=kdt_project
QDRANT_URL=http://127.0.0.1:6333
CHAT_VLLM_BASE_URL=http://127.0.0.1:8001/v1
CHAT_VLLM_MODEL=<vLLM served-model-name>
SECURE_GENERATE=1
```

선택 (키 경로를 명령에 안 넘길 때):

```env
SECURITY_PC_KEY_PATH=C:\Users\OWNER\Downloads\키.pem
SECURITY_PC_PUBLIC_HOST=<Lightsail공인IP>
```

### 4.3 워커 기동

저장소 루트, PowerShell:

```powershell
npm run security-pc -- -KeyPath "키.pem" -PublicHost "<Lightsail공인IP>"
```

또는 `.env`에 `SECURITY_PC_*`를 넣은 뒤 `npm run security-pc`.

하는 일:

1. `127.0.0.1:8001` 확인 (없으면 종료)
2. `-KeyPath`가 있으면 `ssh -L 3306` (MariaDB) + `ssh -L 6333` (Qdrant). 로컬에 이미 떠 있으면 그 포트는 건너뜀
3. `python ai-service/scripts/run_security_worker.py` — `USER_SECURITY_MESSAGES` pending 감시

Ctrl+C 하면 워커와 ssh 포워드가 같이 끝난다.

Qdrant·MariaDB가 **이 PC**에 있으면 `-KeyPath` 없이 `npm run security-pc`만.

워커만 다시 켤 때: `powershell -ExecutionPolicy Bypass -File .\scripts\security-worker.ps1` (터널·vLLM 확인 없음).

---

## 5. 최초 한 번 (승인 후)

### 5.1 보안 채팅 테이블

MariaDB에 `USER_SECURITY_THREADS` / `USER_SECURITY_MESSAGES`가 없으면 워커·큐가 실패한다.

승인된 뒤에만, **AWS에서** (또는 터널로 DB가 보이는 이 PC에서):

```bash
python DB/ai-service/apply_user_security_tables.py
```

DDL: [`DB/user_security_tables.sql`](../../DB/user_security_tables.sql). `DB/schema.sql`에도 포함.

### 5.2 보안 문서 색인

`python ingest_secure.py` 는 **상시 프로세스가 아니다.** Qdrant `secure_docs`가 없거나 전체를 다시 넣을 때만.  
표: [`documents-watcher-qdrant.md`](../references/documents-watcher-qdrant.md) §6.

보통 AWS에서 Qdrant가 떠 있는 상태로 한 번:

```bash
cd ~/KDT-Project/ai-service
python ingest_secure.py
```

---

## 6. 화면에서 확인

1. AWS 앱이 떠 있고, 이 PC 워커가 `watching USER_SECURITY_MESSAGES` 로그를 찍는지 본다.
2. 브라우저에서 플로팅 챗봇 **「보안 상담」** ( `/security` 는 오버레이만 열고 `/main`으로 보낸다).
3. 질문을 보낸다. AWS는 pending만 넣고, 이 PC가 답을 쓰면 말풍선이 채워진다.
4. 워커가 꺼져 있으면 대기 후 `WORKER_UNAVAILABLE_REPLY` (안내: 워커를 켜라는 메시지).

---

## 7. 장애

| 증상 | 볼 곳 |
|------|--------|
| 질문이 안 들어감 / 테이블 오류 | AWS에 `USER_SECURITY_*` DDL 적용 여부 |
| 답이 안 옴, 워커 안내 문구 | 이 PC `npm run security-pc` · vLLM `:8001` |
| `MariaDB unavailable` (워커) | 이 PC `DB_HOST=127.0.0.1` · `ssh -L 3306` · 암호 |
| RAG 미초기화 / 컬렉션 없음 | AWS에서 ingest 한 번 · 워커 `QDRANT_URL` · `ssh -L 6333` |
| vLLM 오프라인 문구 | 이 PC `:8001` · `CHAT_VLLM_BASE_URL` |
| UI만 빈 말풍선 | Nginx SSE 버퍼 · 프론트 GET 폴링. 워커 로그에 assistant INSERT가 있으면 DB는 된 것 |
| AWS가 느리고 CPU 100% | AWS `npm run dev`에 워커를 넣지 말 것. 보안 검색은 이 PC만 |

---

## 8. 하지 말 것

- AWS `npm run dev`에 보안 워커 합치기
- 이 PC에서 보안 답을 위해 Next/Express를 켜기
- vLLM을 AWS에 설치하거나 `ssh -R 8001`로 AWS에 노출
- Lightsail 방화벽에 3306 / 6333 / 8001을 `0.0.0.0/0`으로 열기 (PC는 ssh `-L`)
- AWS `.env`와 이 PC `.env`를 한 파일로 맞춤 (CORS·`DB_HOST`가 어긋남)
- 보안 채널을 Groq/Gemini로 폴백

---

## 9. 코드 위치

| 경로 | 역할 |
|------|------|
| 루트 `package.json` `dev` | AWS 앱 |
| 루트 `package.json` `security-pc` | 이 PC 워커 런처 |
| [`scripts/security-pc.ps1`](../../scripts/security-pc.ps1) | vLLM 확인 · ssh `-L` · 워커 |
| [`ai-service/scripts/run_security_worker.py`](../../ai-service/scripts/run_security_worker.py) | pending claim · RAG · vLLM · assistant INSERT |
| [`ai-service/agent/security_queue_store.py`](../../ai-service/agent/security_queue_store.py) | `USER_SECURITY_*` |
| [`ai-service/agent/secure_llm/llm.py`](../../ai-service/agent/secure_llm/llm.py) | AWS: enqueue + 표시용 peek만 |
| [`frontend/src/components/chat/SecurityChatbot.tsx`](../../frontend/src/components/chat/SecurityChatbot.tsx) | SSE + GET 폴링 표시 |

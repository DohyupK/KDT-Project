# KDT-Project — Documents OCR / text_match / Qdrant / Watcher 인수인계

작성일: 2026-08-13  
대상: 동료 · Cursor/Codex 등 **에이전트**  
저장소: `C:\Users\OWNER\Documents\KDT-Project` (모노레포)

이 문서는 **디렉터리·프로세스 소유권 변경**과 **Documents → OCR → text_match → RAG** 파이프라인을 에이전트가 바로 따라갈 수 있게 정리한 SSOT 요약이다.  
저장소 안 상세 문서: `docs/references/documents-watcher-qdrant.md`

---

## 0. 에이전트용 한 줄

- **워처(OCR)·`text_match`**: Express **backend**가 Python 자식으로 기동  
- **Qdrant(:6333)**: **ai-service** lifespan이 Docker로 자동 기동 (또는 수동 `kdt-qdrant`)  
- **변환 구현 코드**: 여전히 `ai-service/agent/document_*.py` (디렉터리 대이동 없음, **프로세스 소유만 변경**)

---

## 1. 무엇이 바뀌었나 (구조·소유권)

### 1.1 이전

```
ai-service (FastAPI lifespan)
  └─ document_watcher (watchdog)
       └─ document_convert → Markdown/*.md → ingest → Qdrant
```

- 텍스트 있는 PDF/TXT도 무조건 `Markdown/<stem>.md`로 변환하는 정책이었음.  
- Qdrant는 `npm run dev`에 포함되지 않음 → 보통 `docker run` 수동.

### 1.2 현재

```
backend (:3001)
  └─ documentWatcherSupervisor.ts
       └─ python ai-service/scripts/run_document_watcher.py
            └─ agent/document_watcher.py
                 └─ agent/document_convert.py
                      ├─ 네이티브 텍스트 충분 → md 매칭 안 함 (원본 ingest)
                      └─ 비면 OCR → Markdown/<stem>.md + MariaDB text_match

ai-service (:8800)
  └─ lifespan
       ├─ qdrant_supervisor.ensure_qdrant()  → Docker kdt-qdrant (:6333)
       └─ RAG warm (워처는 여기서 안 띄움)
```

**중요:** OCR/변환 **파일 위치는 ai-service에 유지**. backend는 **수명 관리만**.

---

## 2. 관련 경로 맵 (에이전트가 열 파일)

| 역할 | 경로 |
|------|------|
| 워처 supervisor (Node) | `backend/src/services/documentWatcherSupervisor.ts` |
| backend 기동 훅 | `backend/src/index.ts` → `startDocumentWatcherSupervisor()` |
| 워처 데몬 엔트리 | `ai-service/scripts/run_document_watcher.py` |
| watchdog 로직 | `ai-service/agent/document_watcher.py` |
| 네이티브/OCR 판정·변환 | `ai-service/agent/document_convert.py` |
| text_match CRUD | `ai-service/agent/text_match_store.py` |
| Qdrant 자동기동 | `ai-service/agent/qdrant_supervisor.py` |
| ai lifespan | `ai-service/app/main.py` |
| ingest | `ai-service/ingest_secure.py` |
| 정리 스크립트 | `ai-service/scripts/cleanup_converted_md.py` |
| MariaDB DDL | `DB/schema.sql` (`text_match`), `DB/text_match.sql`, `DB/ai-service/apply_text_match.py` |
| Qdrant 볼륨 | `DB/data/qdrant_storage/` (gitignore) |
| Documents 정책 README | `Documents/README.md` |
| 포트·소유권 SSOT | `docs/references/documents-watcher-qdrant.md` |
| 루트 기동 | `package.json` → `npm run dev` (`dev:ai` + `dev:backend` + `dev:frontend`) |
| backend만 켤 때 AI 이중기동 방지 | `scripts/dev-backend.cjs` → `AI_SERVICE_AUTOSTART=0` |

---

## 3. Documents 변환 정책 (반드시 지킬 것)

| 입력 | 동작 |
|------|------|
| 수동 `Documents/<Clearance>/Markdown/*.md` | 바로 ingest |
| `.txt` / **텍스트 레이어 있는** `.pdf` | **매칭 `.md` 만들지 않음** · 원본 ingest |
| 스캔 PDF / 이미지 (png/jpg/webp/tif/gif 등) | 네이티브 텍스트 없으면 **OCR(Tesseract)** → `Markdown/<stem>.md` + **`text_match` upsert** |
| `.csv` / `.xlsx` | 기존대로 `csv_lake` + profile MD (변경 없음) |

판정 함수는 **`document_convert.py`에 공존**:

- `extract_native_text` / `has_extractable_text` (기본 ≥ **40자**)
- 부족하면 `ocr_extract` → md + `text_match`

---

## 4. MariaDB `text_match`

원본(이미지/스캔 PDF) ↔ OCR sidecar md 경로 링크.

주요 컬럼: `source_path`, `md_path`, `clearance`, `source_ext`, `extract_method`, `source_sha1`, `status`

적용:

```bash
python DB/ai-service/apply_text_match.py
```

조회 헬퍼: `text_match_store.resolve_md_path(source_path)`  
※ Knowledge UI에서 원본 열 때 md를 자동으로 붙이는 FE 연동은 **아직 미구현** (헬퍼·DB·워처만 준비됨).

---

## 5. 포트

| 포트 | 서비스 | 기동 |
|------|--------|------|
| 3000 | frontend | `dev:frontend` |
| 3001 | backend (+ 워처 자식) | `dev:backend` |
| 8800 | ai-service (+ Qdrant ensure) | `dev:ai` |
| 6333/6334 | Qdrant | ai-service `QDRANT_AUTOSTART` 또는 수동 Docker |
| 8001 | 로컬 vLLM (보안챗 생성) | 수동 |
| 3306 | MariaDB | `.env` `DB_*` |

---

## 6. 환경 변수 (루트 `.env`)

| 변수 | 기본 | 의미 |
|------|------|------|
| `DOCUMENT_WATCHER_AUTOSTART` | `1` | backend가 워처 자식 기동 |
| `SECURE_DOCS_WATCH` | 데몬이 `1` | 워처 내부 enable |
| `QDRANT_AUTOSTART` | `1` | ai-service가 Docker로 Qdrant |
| `QDRANT_URL` | `http://127.0.0.1:6333` | |
| `TESSERACT_CMD` | (Windows 기본 경로 주입) | supervisor가 자식에 넣음 |
| `AI_SERVICE_AUTOSTART` | 루트 `dev` 시 `0` | :8800 이중 기동 방지 |

Windows OCR: OS Tesseract + `%LOCALAPPDATA%\tesseract-tessdata\tessdata\` 에 `kor`/`eng` 권장.

---

## 7. Qdrant 주의

- **자동 기동 = Docker 전용** (`kdt-qdrant`). Docker Desktop 꺼져 있으면 ensure 실패.  
- 수동: `docker start kdt-qdrant` 또는 `docker run -d --name kdt-qdrant -p 6333:6333 -p 6334:6334 -v <repo>/DB/data/qdrant_storage:/qdrant/storage qdrant/qdrant`  
- 앱에 Qdrant 서버가 내장되어 있지 않음.  
- ingest: `cd ai-service && python ingest_secure.py`

---

## 8. 워처 드롭 테스트 방법 (재현)

전제: `npm run dev` (또는 backend+ai) · 프로세스에 `python scripts/run_document_watcher.py` 존재 · Qdrant optional for OCR md (ingest만 Qdrant 필요).

1. `Documents/Confidential/` 에 글자가 큰 PNG 드롭 (OCR 결과 ≥40자).  
2. debounce ~4s 후 `Documents/Confidential/Markdown/<stem>.md` 생성.  
3. MariaDB `text_match`에 `source_path` / `md_path` / `status=ready`.  

E2E 스크립트(참고): `ai-service/scripts/e2e_docs_qdrant_chat.py`

---

## 9. 에이전트 작업 시 금지·주의

1. 텍스트 추출 되는 PDF/TXT에 대해 **다시 무조건 md 변환으로 되돌리지 말 것**.  
2. 워처를 ai-service lifespan에 **다시 넣지 말 것** (backend 소유).  
3. 새 DB/스키마는 **`DB/`** 아래 (`db-location` 룰).  
4. 시크릿·`.env` 커밋 금지.  
5. 패키지 설치·장시간 학습/ingest는 사용자 승인 후 (`ask-before-run`).  
6. `npm run dev` 중 에이전트 임시 서버로 **3000/3001/8800 점유하지 말 것**.

---

## 10. 빠른 헬스 체크

```text
GET http://127.0.0.1:6333/readyz
GET http://127.0.0.1:8800/health
GET http://127.0.0.1:3001/api/health
프로세스: run_document_watcher.py
```

보안챗 RAG: `POST /api/security-chat` (로컬 LLM :8001 없으면 발췌 폴백 가능).

---

## 11. 저장소 내 추가 문서

- `docs/references/documents-watcher-qdrant.md` — 포트·소유권 상세  
- `docs/references/secure-rag.md` — RAG 튜닝  
- `docs/references/general-chatbot-page-context.md` — 일반 챗 페이지 컨텍스트  
- `Documents/README.md` — Documents 폴더 정책  

이 파일(`Downloads`)은 **동료 에이전트 온보딩용 복사본**이다. 코드 변경의 최종 근거는 저장소 `docs/references/` 를 우선한다.

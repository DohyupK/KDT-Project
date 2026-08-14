# Documents — 등급별 RAG 원본

문서 등급은 **폴더**로만 구분합니다. 벡터 DB(Qdrant)는 컬렉션 1개에 모두 ingest하고, 검색 시 clearance 필터로 ACL을 적용합니다.

```text
Documents/
  Public/Markdown/         # 일반 API 챗 + 보안 챗
  Confidential/Markdown/   # 일반 API 챗 + 보안 챗
  Secret/Markdown/         # 보안 챗만
  TopSecret/Markdown/      # 보안 챗만
  README.md
```

| 채널 | 검색 가능 |
|------|-----------|
| `api_llm` (클라우드 API) | Public, Confidential |
| `secure_llm` (로컬 vLLM) | Public, Confidential, Secret, TopSecret |

## 지원 형식 · 변환 정책

| 형식 | 동작 |
|------|------|
| `.md` (YAML frontmatter) | `*/Markdown/`에 두면 바로 ingest (수동 작성) |
| `.txt` / **텍스트 레이어 있는** `.pdf` | 등급 폴더에 두면 **네이티브 추출로 ingest**. 매칭 `.md`를 **만들지 않음** |
| 스캔 PDF / 이미지 (`.png` `.jpg` `.jpeg` `.webp` `.tif` `.tiff` `.gif`) | 네이티브 텍스트가 비면 **OCR(Tesseract)** → `Markdown/<stem>.md` + MariaDB `text_match` 연동 |
| `.csv` / `.xlsx` | `ai-service/data/csv_lake/`로 이동 후 profile MD만 `Confidential/Markdown/` |

워처: **Express backend** 기동 시 `documentWatcherSupervisor`가  
`ai-service/scripts/run_document_watcher.py`를 자식 프로세스로 띄움 (`DOCUMENT_WATCHER_AUTOSTART=1`).  
OCR·변환 코드는 계속 `ai-service/agent/document_convert.py`에 있음.

Qdrant(:6333): **ai-service** 기동 시 `qdrant_supervisor`가 Docker 컨테이너 `kdt-qdrant`를 자동 기동 (`QDRANT_AUTOSTART=1`).  
스토리지: `DB/data/qdrant_storage/`.

일회 정리(텍스트 PDF에 대해 예전에 만든 converted `.md` 삭제):

```bash
cd ai-service
python scripts/cleanup_converted_md.py --dry-run
python scripts/cleanup_converted_md.py
python ingest_secure.py
```

OCR 요구: OS **Tesseract** (`kor`+`eng`), Python `Pillow` · `pytesseract` · 스캔 PDF 렌더는 `pymupdf`.

Override: env `SECURE_DOCS_DIR` (기본값 = 이 디렉터리).

Ingest: `ai-service/`에서 `python ingest_secure.py`

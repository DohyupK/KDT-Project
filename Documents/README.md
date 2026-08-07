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

## 지원 형식

- `.md` (YAML frontmatter) — `*/Markdown/`에 두면 바로 ingest
- `.txt` / `.pdf` — 각 등급 폴더에 두면 워처가 `Markdown/<stem>.md`로 변환
- `.csv` / `.xlsx` — `ai-service/data/csv_lake/`로 이동 후 profile MD만 `Confidential/Markdown/`

Override: env `SECURE_DOCS_DIR` (기본값 = 이 디렉터리).

Ingest: `ai-service/`에서 `python ingest_secure.py`

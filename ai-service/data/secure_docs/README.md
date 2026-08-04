# Moved

Secure RAG source documents now live at the monorepo root:

`KDT-Project/Documents/`

Override with env `SECURE_DOCS_DIR`. Ingest from `ai-service/`:

```bash
python ingest_secure.py
```

Supported: `.md` (YAML frontmatter), `.txt`, `.pdf` (optional `*.meta.json` sidecar).

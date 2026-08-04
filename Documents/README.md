# Secure RAG source documents (ingest via ai-service/ingest_secure.py)
#
# Supported: .md (YAML frontmatter), .txt, .pdf
# Optional PDF/TXT metadata sidecar: <stem>.meta.json
#   { "doc_id": "...", "title": "...", "category": "SOP", "process": "coating" }
#
# Override path with env SECURE_DOCS_DIR (default = this directory).

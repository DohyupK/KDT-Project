"""
Manual secure-doc ingest → Qdrant + BM25 node cache.

Usage (from ai-service/):
  python ingest_secure.py

Docs directory: monorepo root Documents/ (override with SECURE_DOCS_DIR).
Supports: .md (YAML frontmatter), .txt, .pdf (pypdf).
CSV/XLSX: dual-engine — originals in data/csv_lake/; short profile MD under
Documents/ai-service/*-profile.md (see agent.csv_profile / document_watcher).

Requires: Qdrant at QDRANT_URL (default http://127.0.0.1:6333).
Embed: BAAI/bge-m3 on CPU only.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

AI_ROOT = Path(__file__).resolve().parent
REPO_ROOT = AI_ROOT.parent
load_dotenv(REPO_ROOT / ".env", override=False)

# Ensure agent imports resolve when run as script
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from agent.rag_engine import (  # noqa: E402
    DEVICE,
    EMBED_MODEL,
    NODES_PATH,
    SECURE_DOCS_DIR,
    SECURE_RAG_DIR,
    collection_name,
    qdrant_url,
)

SUPPORTED_SUFFIXES = {".md", ".txt", ".pdf"}


def _converted_md_for(root: Path, path: Path) -> Path:
    return root / "ai-service" / f"{path.stem}.md"


def _parse_frontmatter(raw: str) -> tuple[dict, str]:
    if not raw.startswith("---"):
        return {}, raw
    end = raw.find("\n---", 3)
    if end < 0:
        return {}, raw
    block = raw[3:end].strip()
    body = raw[end + 4 :].lstrip("\n")
    meta: dict = {}
    for line in block.splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        meta[k.strip()] = v.strip().strip('"').strip("'")
    return meta, body


def _load_sidecar_meta(path: Path) -> dict:
    """Optional companion: stem.meta.json next to the document."""
    sidecar = path.with_suffix(path.suffix + ".meta.json")
    if not sidecar.is_file():
        sidecar = path.with_name(path.stem + ".meta.json")
    if not sidecar.is_file():
        return {}
    try:
        data = json.loads(sidecar.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception as exc:  # noqa: BLE001
        print(f"  warn sidecar {sidecar.name}: {exc}")
        return {}


def _chunk_text(text: str, chunk_size: int = 400, overlap: int = 50) -> list[str]:
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        return []
    try:
        from llama_index.core.node_parser import SentenceSplitter
        from llama_index.core.schema import Document

        splitter = SentenceSplitter(chunk_size=chunk_size, chunk_overlap=overlap)
        nodes = splitter.get_nodes_from_documents([Document(text=text)])
        return [n.get_content().strip() for n in nodes if n.get_content().strip()]
    except Exception:
        if len(text) <= chunk_size:
            return [text]
        chunks: list[str] = []
        start = 0
        while start < len(text):
            end = min(len(text), start + chunk_size)
            chunks.append(text[start:end].strip())
            if end >= len(text):
                break
            start = max(0, end - overlap)
        return [c for c in chunks if c]


def _load_pdf_text(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError(
            "pypdf is required for PDF ingest. Install: pip install pypdf"
        ) from exc
    reader = PdfReader(str(path))
    parts: list[str] = []
    for page in reader.pages:
        try:
            t = page.extract_text() or ""
        except Exception as exc:  # noqa: BLE001
            print(f"  warn pdf page {path.name}: {exc}")
            continue
        if t.strip():
            parts.append(t)
    return "\n\n".join(parts).strip()


def _load_document(path: Path) -> tuple[dict, str] | None:
    """Return (meta, body) or None if unreadable / empty."""
    suffix = path.suffix.lower()
    sidecar = _load_sidecar_meta(path)
    try:
        if suffix == ".md":
            raw = path.read_text(encoding="utf-8")
            meta, body = _parse_frontmatter(raw)
            meta = {**sidecar, **meta}
            return meta, body
        if suffix == ".txt":
            body = path.read_text(encoding="utf-8")
            return dict(sidecar), body
        if suffix == ".pdf":
            body = _load_pdf_text(path)
            return dict(sidecar), body
    except Exception as exc:  # noqa: BLE001
        print(f"  skip {path.name}: load error: {exc}")
        return None
    print(f"  skip {path.name}: unsupported type {suffix}")
    return None


def _iter_doc_files(root: Path) -> list[Path]:
    """
    Collect ingestible files.
    - Always include .md (native SOPs + Documents/ai-service converted).
    - Include root .txt/.pdf only when Documents/ai-service/<stem>.md is absent.
    - Never ingest raw .csv/.xlsx (convert → md first).
    """
    if not root.is_dir():
        return []
    files: list[Path] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if path.name.endswith(".meta.json"):
            continue
        if path.name.startswith("."):
            continue
        if path.name.upper() in ("README.MD", "README.TXT", "LICENSE", "LICENSE.MD"):
            continue
        suffix = path.suffix.lower()
        under_converted = path.parent.name == "ai-service" and "ai-service" in path.parts
        if suffix == ".md":
            files.append(path)
            continue
        if under_converted:
            print(f"  skip {path.relative_to(root)}: only .md under ai-service/")
            continue
        if suffix in (".txt", ".pdf"):
            if _converted_md_for(root, path).is_file():
                print(
                    f"  skip {path.relative_to(root)}: "
                    f"use ai-service/{path.stem}.md"
                )
                continue
            files.append(path)
            continue
        if suffix in (".csv", ".xlsx"):
            print(
                f"  skip {path.relative_to(root)}: "
                "move to data/csv_lake/ (profile MD only)"
            )
            continue
        print(f"  skip {path.relative_to(root)}: unsupported extension")
    return files


def run_ingest() -> int:
    """Full rebuild of secure_docs collection (same as CLI)."""
    from qdrant_client import QdrantClient
    from qdrant_client.http import models as qm
    from sentence_transformers import SentenceTransformer

    SECURE_DOCS_DIR.mkdir(parents=True, exist_ok=True)
    SECURE_RAG_DIR.mkdir(parents=True, exist_ok=True)
    (SECURE_DOCS_DIR / "ai-service").mkdir(parents=True, exist_ok=True)

    files = _iter_doc_files(SECURE_DOCS_DIR)
    if not files:
        print(
            f"No ingestible docs in {SECURE_DOCS_DIR}. "
            "Add .md or convert pdf/txt/csv/xlsx then re-run."
        )
        return 1

    print(f"Docs dir={SECURE_DOCS_DIR}")
    print(f"Qdrant={qdrant_url()} collection={collection_name()}")
    print(f"Embed={EMBED_MODEL} device={DEVICE}")
    client = QdrantClient(url=qdrant_url())
    embedder = SentenceTransformer(EMBED_MODEL, device=DEVICE)

    dim = len(embedder.encode(["dim"], normalize_embeddings=True)[0])
    name = collection_name()
    existing = {c.name for c in client.get_collections().collections}
    if name in existing:
        client.delete_collection(name)
        print(f"Deleted existing collection {name}")
    client.create_collection(
        collection_name=name,
        vectors_config=qm.VectorParams(size=dim, distance=qm.Distance.COSINE),
    )
    for field in ("doc_id", "title", "category", "process", "security_level"):
        try:
            client.create_payload_index(
                collection_name=name,
                field_name=field,
                field_schema=qm.PayloadSchemaType.KEYWORD,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"index {field}: {exc}")

    nodes: list[dict] = []
    points: list[qm.PointStruct] = []
    point_id = 0
    repo_root = AI_ROOT.parent

    for path in files:
        loaded = _load_document(path)
        if loaded is None:
            continue
        meta, body = loaded
        if not (body or "").strip():
            print(f"  skip {path.name}: empty text")
            continue
        doc_id = str(meta.get("doc_id") or path.stem)
        title = str(meta.get("title") or path.stem)
        category = str(meta.get("category") or "SOP")
        process = str(meta.get("process") or "")
        security_level = str(meta.get("security_level") or "internal")
        chunks = _chunk_text(body)
        if not chunks:
            print(f"  skip {path.name}: no chunks")
            continue
        try:
            rel = str(path.relative_to(repo_root)).replace("\\", "/")
        except ValueError:
            rel = str(path).replace("\\", "/")
        print(f"  {path.name}: {len(chunks)} chunks · {title}")
        for i, chunk in enumerate(chunks):
            payload = {
                "doc_id": doc_id,
                "title": title,
                "category": category,
                "process": process,
                "security_level": security_level,
                "source_path": rel,
                "chunk_index": i,
                "text": chunk,
            }
            nodes.append(
                {
                    "text": chunk,
                    "metadata": {k: v for k, v in payload.items() if k != "text"},
                }
            )
            vec = embedder.encode([chunk], normalize_embeddings=True)[0].tolist()
            uid = int(
                hashlib.md5(
                    f"{doc_id}:{i}".encode(), usedforsecurity=False
                ).hexdigest()[:12],
                16,
            )
            points.append(qm.PointStruct(id=uid or point_id, vector=vec, payload=payload))
            point_id += 1

    if not points:
        print("No points to upsert (all files empty or failed).")
        return 1

    batch = 32
    for i in range(0, len(points), batch):
        client.upsert(collection_name=name, points=points[i : i + batch])

    NODES_PATH.write_text(
        json.dumps(nodes, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Upserted {len(points)} points → {name}")
    print(f"BM25 nodes → {NODES_PATH}")
    return 0


def main() -> int:
    return run_ingest()


if __name__ == "__main__":
    raise SystemExit(main())

"""
Manual secure-doc ingest → Qdrant + BM25 node cache.

Usage (from ai-service/):
  python ingest_secure.py

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
load_dotenv(AI_ROOT / ".env", override=False)

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


def _chunk_text(text: str, chunk_size: int = 700, overlap: int = 100) -> list[str]:
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


def main() -> int:
    from qdrant_client import QdrantClient
    from qdrant_client.http import models as qm
    from sentence_transformers import SentenceTransformer

    SECURE_DOCS_DIR.mkdir(parents=True, exist_ok=True)
    SECURE_RAG_DIR.mkdir(parents=True, exist_ok=True)

    files = sorted(
        list(SECURE_DOCS_DIR.glob("*.md"))
        + list(SECURE_DOCS_DIR.glob("*.txt"))
    )
    if not files:
        print(f"No docs in {SECURE_DOCS_DIR}. Add .md/.txt then re-run.")
        return 1

    print(f"Qdrant={qdrant_url()} collection={collection_name()}")
    print(f"Embed={EMBED_MODEL} device={DEVICE}")
    client = QdrantClient(url=qdrant_url())
    embedder = SentenceTransformer(EMBED_MODEL, device=DEVICE)

    # Probe dim
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
    # Payload indexes for metadata filtering / Self-Query
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

    for path in files:
        raw = path.read_text(encoding="utf-8")
        meta, body = _parse_frontmatter(raw)
        doc_id = str(meta.get("doc_id") or path.stem)
        title = str(meta.get("title") or path.stem)
        category = str(meta.get("category") or "SOP")
        process = str(meta.get("process") or "")
        security_level = str(meta.get("security_level") or "internal")
        chunks = _chunk_text(body)
        print(f"  {path.name}: {len(chunks)} chunks · {title}")
        for i, chunk in enumerate(chunks):
            payload = {
                "doc_id": doc_id,
                "title": title,
                "category": category,
                "process": process,
                "security_level": security_level,
                "source_path": str(path.relative_to(AI_ROOT)).replace("\\", "/"),
                "chunk_index": i,
                "text": chunk,
            }
            nodes.append({"text": chunk, "metadata": {k: v for k, v in payload.items() if k != "text"}})
            vec = embedder.encode([chunk], normalize_embeddings=True)[0].tolist()
            uid = int(
                hashlib.md5(f"{doc_id}:{i}".encode(), usedforsecurity=False).hexdigest()[:12],
                16,
            )
            points.append(qm.PointStruct(id=uid or point_id, vector=vec, payload=payload))
            point_id += 1

    # Upsert in batches
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


if __name__ == "__main__":
    raise SystemExit(main())

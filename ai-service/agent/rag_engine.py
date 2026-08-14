"""
Secure-tab RAG engine (CPU embed + CPU rerank).

Pipeline:
  LlamaIndex Self-Query (VectorIndexAutoRetriever filter parse via vLLM)
  → Qdrant dense + BM25 → Query Fusion (RRF)
  → bge-reranker-v2-m3 (device=cpu)

Guardrails (required — never remove):
  C) empty fused AND had_filters → unfiltered hybrid once
  D) rerank score < SECURE_RERANK_MIN_SCORE → drop hit

Never uses Groq/Gemini. Embed/rerank forced to CPU to leave GPU for vLLM.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from pathlib import Path
from typing import Any, Collection

from agent.doc_clearance import (
    API_ALLOWED_CLEARANCES,
    SECURE_ALLOWED_CLEARANCES,
    clearance_from_path,
    ensure_clearance_tree,
)

logger = logging.getLogger(__name__)

AI_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = AI_ROOT.parent
# Prefer env; default = monorepo root Documents/ (not ai-service/data/secure_docs).
_secure_docs_env = (os.environ.get("SECURE_DOCS_DIR") or "").strip()
SECURE_DOCS_DIR = (
    Path(_secure_docs_env).expanduser()
    if _secure_docs_env
    else REPO_ROOT / "Documents"
)
SECURE_RAG_DIR = AI_ROOT / "data" / "secure_rag"
NODES_PATH = SECURE_RAG_DIR / "bm25_nodes.json"

DEFAULT_COLLECTION = "secure_docs"
NO_DOCS_REPLY = "사내 보안 문서에서 관련 정보를 찾을 수 없습니다."

# Re-export for callers
__all_clearance__ = (
    "API_ALLOWED_CLEARANCES",
    "SECURE_ALLOWED_CLEARANCES",
    "clearance_from_path",
    "ensure_clearance_tree",
)

# Forced CPU — do not override to cuda in this module.
EMBED_MODEL = os.environ.get("SECURE_EMBED_MODEL", "BAAI/bge-m3").strip()
RERANK_MODEL = os.environ.get("SECURE_RERANK_MODEL", "BAAI/bge-reranker-v2-m3").strip()
DEVICE = "cpu"

ALLOWED_CATEGORIES = frozenset({"SOP", "매뉴얼", "규정"})
ALLOWED_PROCESSES = frozenset(
    {
        "sintering",
        "humidity",
        "mixing",
        "coating",
        "lithium_input",
        "metal_impurity",
    }
)


def qdrant_url() -> str:
    return (
        os.environ.get("QDRANT_URL")
        or os.environ.get("SECURE_QDRANT_URL")
        or "http://127.0.0.1:6333"
    ).rstrip("/")


def _qdrant_reachable(timeout_s: float = 0.4) -> bool:
    try:
        import socket
        from urllib.parse import urlparse

        parsed = urlparse(qdrant_url())
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 6333
        with socket.create_connection((host, port), timeout=timeout_s):
            return True
    except OSError:
        return False


def collection_name() -> str:
    return (
        os.environ.get("SECURE_QDRANT_COLLECTION") or DEFAULT_COLLECTION
    ).strip()


def _meta(node_or_dict: Any) -> dict[str, Any]:
    if isinstance(node_or_dict, dict):
        return dict(node_or_dict.get("metadata") or {})
    md = getattr(node_or_dict, "metadata", None)
    return dict(md or {})


def _text(node_or_dict: Any) -> str:
    if isinstance(node_or_dict, dict):
        return str(node_or_dict.get("text") or "")
    return str(getattr(node_or_dict, "text", "") or "")


def source_dict_from_hit(hit: Any, score: float | None = None) -> dict[str, Any]:
    md = _meta(hit)
    return {
        "doc_id": str(md.get("doc_id") or ""),
        "title": str(md.get("title") or md.get("doc_id") or "untitled"),
        "category": md.get("category"),
        "process": md.get("process"),
        "security_level": md.get("security_level") or "internal",
        "clearance": md.get("clearance") or "Confidential",
        "source_path": md.get("source_path"),
        "chunk_index": md.get("chunk_index"),
        "text": _text(hit),
        "score": score,
    }


class SecureRagEngine:
    """Lazy-loaded hybrid retriever for security docs only."""

    def __init__(self) -> None:
        self._embed_model = None
        self._reranker = None
        self._qdrant = None
        self._nodes: list[dict[str, Any]] = []
        self._bm25 = None
        self._tokenized: list[list[str]] = []
        self._bm25_lock = threading.RLock()
        self._ready = False
        self._init_error: str | None = None
        self._auto_retriever = None  # lazy VectorIndexAutoRetriever (Self-Query)

    @property
    def ready(self) -> bool:
        return self._ready

    @property
    def init_error(self) -> str | None:
        return self._init_error

    def ensure(self) -> None:
        if self._ready or self._init_error:
            return
        if not _qdrant_reachable():
            self._init_error = f"Qdrant not reachable at {qdrant_url()}"
            logger.warning("[rag] skip warm: %s", self._init_error)
            return
        try:
            self._load()
            self._ready = True
        except Exception as exc:  # noqa: BLE001
            self._init_error = str(exc)[:400]
            logger.warning("SecureRagEngine init failed: %s", self._init_error)

    def _load(self) -> None:
        from qdrant_client import QdrantClient
        from sentence_transformers import CrossEncoder, SentenceTransformer
        from rank_bm25 import BM25Okapi

        SECURE_RAG_DIR.mkdir(parents=True, exist_ok=True)
        self._qdrant = QdrantClient(url=qdrant_url())
        # Probe collection
        self._qdrant.get_collections()
        name = collection_name()
        existing = {c.name for c in self._qdrant.get_collections().collections}
        if name not in existing:
            raise RuntimeError(
                f"Qdrant collection '{name}' missing. Run: python ingest_secure.py"
            )

        # GPU reserved for vLLM — embed + rerank always on CPU.
        self._embed_model = SentenceTransformer(EMBED_MODEL, device=DEVICE)
        self._reranker = CrossEncoder(RERANK_MODEL, device=DEVICE)

        if NODES_PATH.exists():
            nodes = json.loads(NODES_PATH.read_text(encoding="utf-8"))
        else:
            nodes = []
        tokenized = [_tokenize(n.get("text") or "") for n in nodes]
        bm25 = BM25Okapi(tokenized) if tokenized else None
        with self._bm25_lock:
            self._nodes = nodes
            self._tokenized = tokenized
            self._bm25 = bm25

    def reload_bm25(self) -> None:
        """Hot-reload BM25 from bm25_nodes.json (no process restart)."""
        from rank_bm25 import BM25Okapi

        if NODES_PATH.exists():
            nodes = json.loads(NODES_PATH.read_text(encoding="utf-8"))
        else:
            nodes = []
        if not isinstance(nodes, list):
            nodes = []
        tokenized = [_tokenize(n.get("text") or "") for n in nodes]
        bm25 = BM25Okapi(tokenized) if tokenized else None
        with self._bm25_lock:
            self._nodes = nodes
            self._tokenized = tokenized
            self._bm25 = bm25
        logger.info("[secure-rag] bm25 reloaded n=%s", len(nodes))

    def reload_bm25_nodes(self) -> None:
        """Alias for reload_bm25 (compat)."""
        self.reload_bm25()

    def parse_metadata_filters(self, query: str, llm_invoke: Any | None) -> dict[str, str]:
        """
        Layer A: LlamaIndex Self-Query filter parse (VectorIndexAutoRetriever).

        llama-index-core exposes Self-Query as VectorIndexAutoRetriever (not a
        class named SelfQueryRetriever). Filters only — hybrid B/C/D stay outside.

        When llm_invoke is None (offline score smoke): heuristic only.
        When SECURE_SELF_QUERY=0: heuristic only (skip LM filter call).
        On Self-Query / vLLM failure: heuristic fallback (no cloud).
        """
        if llm_invoke is None:
            return _heuristic_filters(query)
        if os.environ.get("SECURE_SELF_QUERY", "1").strip() in (
            "0",
            "false",
            "False",
            "no",
            "off",
        ):
            return _heuristic_filters(query)
        try:
            filters = self._filters_via_self_query(query)
            if filters:
                return filters
        except Exception as exc:  # noqa: BLE001
            logger.warning("Self-Query filter parse failed: %s", exc)
        return _heuristic_filters(query)

    def _ensure_auto_retriever(self) -> Any:
        """Build LI Self-Query auto-retriever once (filter generation only)."""
        if self._auto_retriever is not None:
            return self._auto_retriever

        from llama_index.core import Settings, VectorStoreIndex
        from llama_index.core.embeddings.mock_embed_model import MockEmbedding
        from llama_index.core.indices.vector_store.retrievers.auto_retriever.auto_retriever import (
            VectorIndexAutoRetriever,
        )
        from llama_index.core.vector_stores.types import MetadataInfo, VectorStoreInfo
        from llama_index.llms.openai import OpenAI

        from agent.secure_llm import vllm_base_url, vllm_model

        # Filter-only: empty index + mock embed (search stays in our hybrid path).
        Settings.embed_model = MockEmbedding(embed_dim=8)
        index = VectorStoreIndex(nodes=[])
        info = VectorStoreInfo(
            content_info=(
                "사내 보안·기밀 공정 문서 (양극재 SOP / 매뉴얼 / 규정). "
                "일반 상식·날씨·메뉴와 무관."
            ),
            metadata_info=[
                MetadataInfo(
                    name="category",
                    type="str",
                    description="문서 유형. One of: SOP, 매뉴얼, 규정",
                ),
                MetadataInfo(
                    name="process",
                    type="str",
                    description=(
                        "공정 키. One of: sintering, humidity, mixing, coating, "
                        "lithium_input, metal_impurity"
                    ),
                ),
            ],
        )
        # Short timeout + small max_tokens: filter JSON only (avoid long GEN on LM Studio).
        sq_timeout = float(os.environ.get("SECURE_SELF_QUERY_TIMEOUT", "20"))
        sq_max_tokens = int(os.environ.get("SECURE_SELF_QUERY_MAX_TOKENS", "256"))
        llm = OpenAI(
            api_base=vllm_base_url(),
            api_key="EMPTY",
            model=vllm_model(),
            temperature=0.0,
            max_retries=0,
            timeout=sq_timeout,
            max_tokens=sq_max_tokens,
        )
        self._auto_retriever = VectorIndexAutoRetriever(
            index=index,
            vector_store_info=info,
            llm=llm,
            verbose=False,
        )
        return self._auto_retriever

    def _filters_via_self_query(self, query: str) -> dict[str, str]:
        """Run LI Self-Query spec generation → category/process dict."""
        from llama_index.core import QueryBundle

        retriever = self._ensure_auto_retriever()
        spec = retriever.generate_retrieval_spec(QueryBundle(query_str=query))
        out: dict[str, str] = {}
        raw_filters = getattr(spec, "filters", None) or []
        for f in raw_filters:
            key = str(getattr(f, "key", "") or "").strip()
            val = getattr(f, "value", None)
            if key not in ("category", "process"):
                continue
            if val is None:
                continue
            s = str(val).strip()
            if not s or s.lower() == "null":
                continue
            if key == "category" and s not in ALLOWED_CATEGORIES:
                continue
            if key == "process" and s not in ALLOWED_PROCESSES:
                continue
            out[key] = s
        return out

    def retrieve(
        self,
        query: str,
        *,
        top_k: int = 12,
        rerank_top_n: int = 6,
        filters: dict[str, str] | None = None,
        llm_invoke: Any | None = None,
        allowed_clearances: Collection[str] | None = None,
    ) -> list[dict[str, Any]]:
        self.ensure()
        if not self._ready:
            raise RuntimeError(self._init_error or "SecureRagEngine not ready")

        allowed = (
            frozenset(allowed_clearances)
            if allowed_clearances is not None
            else SECURE_ALLOWED_CLEARANCES
        )
        if not allowed:
            return []

        filters = filters if filters is not None else self.parse_metadata_filters(
            query, llm_invoke
        )
        dense_hits = self._dense_search(
            query, top_k=top_k, filters=filters, allowed_clearances=allowed
        )
        bm25_hits = self._bm25_search(
            query, top_k=top_k, filters=filters, allowed_clearances=allowed
        )
        fused = _rrf_fuse(dense_hits, bm25_hits, top_k=top_k)
        # Guardrail C: retry without category/process filters, keep clearance ACL.
        if not fused and filters:
            dense_hits = self._dense_search(
                query, top_k=top_k, filters={}, allowed_clearances=allowed
            )
            bm25_hits = self._bm25_search(
                query, top_k=top_k, filters={}, allowed_clearances=allowed
            )
            fused = _rrf_fuse(dense_hits, bm25_hits, top_k=top_k)
        if not fused:
            return []
        return self._rerank(query, fused, top_n=rerank_top_n)

    def _dense_search(
        self,
        query: str,
        *,
        top_k: int,
        filters: dict[str, str],
        allowed_clearances: frozenset[str],
    ) -> list[tuple[str, dict[str, Any], float]]:
        from qdrant_client.http import models as qm

        assert self._embed_model is not None and self._qdrant is not None
        vector = self._embed_model.encode(
            [query], normalize_embeddings=True
        )[0].tolist()

        qfilter = _qdrant_filter(filters, allowed_clearances)

        try:
            points = self._qdrant.search(
                collection_name=collection_name(),
                query_vector=vector,
                query_filter=qfilter,
                limit=top_k,
                with_payload=True,
            )
        except Exception:
            # qdrant-client 1.12+ query_points API
            res = self._qdrant.query_points(
                collection_name=collection_name(),
                query=vector,
                query_filter=qfilter,
                limit=top_k,
                with_payload=True,
            )
            points = list(getattr(res, "points", None) or [])
        out: list[tuple[str, dict[str, Any], float]] = []
        for p in points:
            payload = dict(getattr(p, "payload", None) or {})
            text = str(payload.pop("text", "") or "")
            node = {"text": text, "metadata": payload}
            key = _hit_key(payload, text)
            score = float(getattr(p, "score", 0.0) or 0.0)
            out.append((key, node, score))
        return out

    def _bm25_search(
        self,
        query: str,
        *,
        top_k: int,
        filters: dict[str, str],
        allowed_clearances: frozenset[str],
    ) -> list[tuple[str, dict[str, Any], float]]:
        with self._bm25_lock:
            if not self._bm25 or not self._nodes:
                return []
            scores = self._bm25.get_scores(_tokenize(query))
            ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
            out: list[tuple[str, dict[str, Any], float]] = []
            for idx, score in ranked:
                if score <= 0:
                    continue
                node = self._nodes[idx]
                md = dict(node.get("metadata") or {})
                cl = str(md.get("clearance") or "Confidential")
                if cl not in allowed_clearances:
                    continue
                if filters:
                    ok = True
                    for k, v in filters.items():
                        if str(md.get(k) or "") != v:
                            ok = False
                            break
                    if not ok:
                        continue
                text = str(node.get("text") or "")
                key = _hit_key(md, text)
                out.append((key, {"text": text, "metadata": md}, float(score)))
                if len(out) >= top_k:
                    break
            return out

    def _rerank(
        self,
        query: str,
        fused: list[tuple[str, dict[str, Any], float]],
        *,
        top_n: int,
    ) -> list[dict[str, Any]]:
        assert self._reranker is not None
        pairs = [(query, _text(n)) for _, n, _ in fused]
        scores = self._reranker.predict(pairs)
        if hasattr(scores, "tolist"):
            scores = scores.tolist()
        if isinstance(scores, (int, float)):
            scores = [float(scores)]
        scored = list(zip(fused, [float(s) for s in scores], strict=False))
        scored.sort(key=lambda x: x[1], reverse=True)
        min_score = float(os.environ.get("SECURE_RERANK_MIN_SCORE", "0.15"))
        max_score = max((sc for _, sc in scored), default=0.0)
        # Diversify: at most 2 chunks per doc_id (or title fallback), score order.
        per_doc_cap = 2
        per_doc: dict[str, int] = {}
        results: list[dict[str, Any]] = []
        for (key, node, _rrf), sc in scored:
            if sc < min_score:
                continue
            item = source_dict_from_hit(node, score=sc)
            item["hit_key"] = key
            doc_key = str(
                item.get("doc_id") or item.get("title") or key
            ).strip() or key
            if per_doc.get(doc_key, 0) >= per_doc_cap:
                continue
            per_doc[doc_key] = per_doc.get(doc_key, 0) + 1
            results.append(item)
            if len(results) >= top_n:
                break
        # Soft fallback: min_score wiped all hits → keep top fused (RRF) 1–2.
        if not results and fused:
            per_doc = {}
            take = min(2, top_n)
            for key, node, rrf_sc in fused:
                item = source_dict_from_hit(node, score=float(rrf_sc))
                item["hit_key"] = key
                doc_key = str(
                    item.get("doc_id") or item.get("title") or key
                ).strip() or key
                if per_doc.get(doc_key, 0) >= per_doc_cap:
                    continue
                per_doc[doc_key] = per_doc.get(doc_key, 0) + 1
                results.append(item)
                if len(results) >= take:
                    break
            logger.info(
                "[secure-rag] rerank soft_fallback n=%s max_score=%.4f query=%r",
                len(results),
                float(max_score),
                (query or "")[:80],
            )
        # Explicit score order after diversify (defensive; append path is already sorted).
        results.sort(key=lambda x: float(x.get("score") or 0.0), reverse=True)
        return results


_ENGINE: SecureRagEngine | None = None


def get_engine() -> SecureRagEngine:
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = SecureRagEngine()
    return _ENGINE


def _qdrant_filter(
    filters: dict[str, str],
    allowed_clearances: frozenset[str],
) -> Any:
    from qdrant_client.http import models as qm

    must: list[Any] = []
    for key, val in filters.items():
        must.append(qm.FieldCondition(key=key, match=qm.MatchValue(value=val)))
    if allowed_clearances:
        must.append(
            qm.FieldCondition(
                key="clearance",
                match=qm.MatchAny(any=list(allowed_clearances)),
            )
        )
    return qm.Filter(must=must) if must else None


def _tokenize(text: str) -> list[str]:
    # Simple CJK/Latin tokenizer for BM25
    text = text.lower()
    parts = re.findall(r"[\w가-힣]+", text, flags=re.UNICODE)
    return parts or [text]


def _hit_key(md: dict[str, Any], text: str) -> str:
    return f"{md.get('doc_id','')}:{md.get('chunk_index','')}:{hash(text) & 0xFFFFFFFF}"


def _rrf_fuse(
    dense: list[tuple[str, dict[str, Any], float]],
    sparse: list[tuple[str, dict[str, Any], float]],
    *,
    top_k: int,
    k: int = 60,
) -> list[tuple[str, dict[str, Any], float]]:
    """Reciprocal Rank Fusion (LlamaIndex QueryFusion-equivalent)."""
    scores: dict[str, float] = {}
    nodes: dict[str, dict[str, Any]] = {}
    for rank, (key, node, _) in enumerate(dense):
        scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank + 1)
        nodes[key] = node
    for rank, (key, node, _) in enumerate(sparse):
        scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank + 1)
        nodes[key] = node
    ordered = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_k]
    return [(key, nodes[key], sc) for key, sc in ordered]


def _heuristic_filters(query: str) -> dict[str, str]:
    q = query.lower()
    out: dict[str, str] = {}
    process_map = {
        "sinter": "sintering",
        "소성": "sintering",
        "humidity": "humidity",
        "습도": "humidity",
        "혼합": "mixing",
        "mixing": "mixing",
        "코팅": "coating",
        "coating": "coating",
        "lithium": "lithium_input",
        "리튬": "lithium_input",
        "투입비": "lithium_input",
        "metal_impurity": "metal_impurity",
        "금속": "metal_impurity",
        "불순물": "metal_impurity",
    }
    for needle, val in process_map.items():
        if needle in q:
            out["process"] = val
            break
    if "sop" in q or "표준" in q:
        out["category"] = "SOP"
    elif "매뉴얼" in q or "manual" in q:
        out["category"] = "매뉴얼"
    elif "규정" in q:
        out["category"] = "규정"
    return out

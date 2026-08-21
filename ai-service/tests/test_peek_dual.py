"""Unit tests for dense peek_dual (no real BGE/Qdrant)."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from agent.rag_engine import SecureRagEngine


class PeekDualTests(unittest.TestCase):
    def test_encode_once_and_secret_has_no_text(self) -> None:
        eng = SecureRagEngine()
        eng._ready = True
        eng._init_error = None
        encode = MagicMock(return_value=[[0.1, 0.2, 0.3]])
        eng._embed_model = MagicMock()
        eng._embed_model.encode = encode
        eng._qdrant = MagicMock()

        secret_node = {
            "text": "SECRET BODY MUST NOT LEAK",
            "metadata": {
                "doc_id": "sec-1",
                "title": "Secret SOP",
                "clearance": "Secret",
            },
        }
        public_node = {
            "text": "public chunk",
            "metadata": {
                "doc_id": "pub-1",
                "title": "Public guide",
                "clearance": "Public",
            },
        }

        def _dense_vector(vector, *, top_k, filters, allowed_clearances):
            del vector, top_k, filters
            labels = {str(c) for c in allowed_clearances}
            if "Secret" in labels or "TopSecret" in labels:
                return [("k1", secret_node, 0.9)]
            return [("k2", public_node, 0.8)]

        eng._dense_search_vector = MagicMock(side_effect=_dense_vector)  # type: ignore[method-assign]

        with patch.object(eng, "ensure"):
            secret, public, timing = eng.peek_dual("소성로 점검", top_k=3)

        self.assertEqual(encode.call_count, 1)
        self.assertEqual(eng._dense_search_vector.call_count, 2)
        self.assertEqual(len(secret), 1)
        self.assertNotIn("text", secret[0])
        self.assertEqual(secret[0]["doc_id"], "sec-1")
        self.assertEqual(len(public), 1)
        self.assertEqual(public[0].get("text"), "public chunk")
        self.assertIn("embed_ms", timing)
        self.assertIn("qdrant_ms", timing)


if __name__ == "__main__":
    unittest.main()

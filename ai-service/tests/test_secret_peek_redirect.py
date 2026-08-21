"""Unit tests for Secret peek redirect gating (no Qdrant)."""

from __future__ import annotations

import unittest

from agent.api_llm.graph import (
    select_secret_redirect_hits,
    wants_secret_doc_redirect,
)


class WantsSecretDocRedirectTests(unittest.TestCase):
    def test_general_qc_no_intent(self) -> None:
        self.assertFalse(wants_secret_doc_redirect("불량확률 왜 높아"))
        self.assertFalse(wants_secret_doc_redirect("SOP 찾아줘"))
        self.assertFalse(wants_secret_doc_redirect("모델 성능 알려줘"))

    def test_classified_doc_intent(self) -> None:
        self.assertTrue(wants_secret_doc_redirect("기밀문서 내용 뭐야"))
        self.assertTrue(wants_secret_doc_redirect("시크릿 폴더 자료 찾아줘"))
        self.assertTrue(wants_secret_doc_redirect("top secret report summary"))


class SelectSecretRedirectHitsTests(unittest.TestCase):
    def test_no_intent_suppresses_even_strong_secret(self) -> None:
        secret = [{"doc_id": "s1", "score": 0.95, "title": "Secret SOP"}]
        public = [{"doc_id": "p1", "score": 0.40, "title": "Public guide"}]
        hits = select_secret_redirect_hits(
            secret,
            public,
            message="불량확률 왜 높아",
            min_score=0.88,
            margin=0.18,
        )
        self.assertEqual(hits, [])

    def test_weak_secret_vs_stronger_public_no_redirect(self) -> None:
        secret = [{"doc_id": "s1", "score": 0.50, "title": "Secret SOP"}]
        public = [{"doc_id": "p1", "score": 0.60, "title": "Public guide"}]
        hits = select_secret_redirect_hits(
            secret,
            public,
            message="기밀문서 찾아줘",
            min_score=0.88,
            margin=0.18,
        )
        self.assertEqual(hits, [])

    def test_mid_secret_below_threshold_no_redirect(self) -> None:
        secret = [{"doc_id": "s1", "score": 0.80, "title": "Secret SOP"}]
        public = [{"doc_id": "p1", "score": 0.40, "title": "Public guide"}]
        hits = select_secret_redirect_hits(
            secret,
            public,
            message="기밀문서 찾아줘",
            min_score=0.88,
            margin=0.18,
        )
        self.assertEqual(hits, [])

    def test_strong_secret_with_intent_redirects(self) -> None:
        secret = [{"doc_id": "s1", "score": 0.92, "title": "Secret SOP"}]
        public = [{"doc_id": "p1", "score": 0.50, "title": "Public guide"}]
        hits = select_secret_redirect_hits(
            secret,
            public,
            message="기밀문서 내용 알려줘",
            min_score=0.88,
            margin=0.18,
        )
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]["doc_id"], "s1")

    def test_secret_above_threshold_but_within_margin_suppressed(self) -> None:
        secret = [{"doc_id": "s1", "score": 0.90, "title": "Secret SOP"}]
        public = [{"doc_id": "p1", "score": 0.80, "title": "Public guide"}]
        hits = select_secret_redirect_hits(
            secret,
            public,
            message="기밀문서 찾아줘",
            min_score=0.88,
            margin=0.18,
        )
        self.assertEqual(hits, [])


if __name__ == "__main__":
    unittest.main()

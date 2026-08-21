"""Unit tests for general-chat Qdrant peek gate (no Qdrant required)."""

from __future__ import annotations

import unittest

from agent.api_llm.graph import should_peek_docs


class ShouldPeekDocsTests(unittest.TestCase):
    def test_page_summary_skips(self) -> None:
        self.assertFalse(
            should_peek_docs("지금 보고 있는 화면 데이터를 요약해 주세요")
        )

    def test_screen_ui_skips(self) -> None:
        self.assertFalse(should_peek_docs("이 화면 KPI 몇 건이야"))
        self.assertFalse(should_peek_docs("폰트 설정 어디 있어"))

    def test_offscreen_primary_skips(self) -> None:
        pc = {"page_payload": {"primary_table": "offscreen", "empty_hint": "x"}}
        self.assertFalse(should_peek_docs("문의 게시판 열어줘", pc))

    def test_general_utterance_peeks(self) -> None:
        self.assertTrue(should_peek_docs("소성로 점검 절차가 어떻게 되지"))
        self.assertTrue(should_peek_docs("양극재 배합 비율 설명해줘"))

    def test_doc_intent_still_peeks(self) -> None:
        self.assertTrue(should_peek_docs("SOP 찾아줘"))


if __name__ == "__main__":
    unittest.main()

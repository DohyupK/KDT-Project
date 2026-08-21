"""Unit tests for page-summary intent (no Qdrant / LLM)."""

from __future__ import annotations

import unittest

from agent.api_llm.grounding import is_page_summary_intent
from agent.api_llm.llm import polish_reply


class PageSummaryIntentTests(unittest.TestCase):
    def test_chip_message_matches(self) -> None:
        self.assertTrue(
            is_page_summary_intent("지금 보고 있는 화면 데이터를 요약해 주세요.")
        )

    def test_freeform_without_jigeum_matches(self) -> None:
        self.assertTrue(is_page_summary_intent("내가 보고 있는 화면 요약해줘"))

    def test_about_screen_summary_matches(self) -> None:
        self.assertTrue(is_page_summary_intent("화면에 대해 요약해 주세요"))

    def test_short_screen_summary_matches(self) -> None:
        self.assertTrue(is_page_summary_intent("이 화면 좀 요약"))

    def test_doc_search_does_not_match(self) -> None:
        self.assertFalse(is_page_summary_intent("SOP 찾아줘"))


class PageSummaryPolishSkipTests(unittest.TestCase):
    def test_polish_skips_second_llm_for_summary(self) -> None:
        draft = "위험 LOT 3건이 보입니다."
        out = polish_reply(
            draft,
            current_question="내가 보고 있는 화면 요약해줘",
            llm_mode="auto",
            llm_credentials=[],
        )
        self.assertIn("위험 LOT", out)


if __name__ == "__main__":
    unittest.main()

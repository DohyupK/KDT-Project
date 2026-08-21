"""Unit tests for issue remediation soft proposals."""

from __future__ import annotations

import unittest

from agent.api_llm.remediation import (
    attach_remediation_to_compose,
    fallback_remediation,
    parse_remediation_block,
    should_emit_remediation,
    wants_remediation_proposals,
)


class RemediationIntentTests(unittest.TestCase):
    def test_remedy_intent(self) -> None:
        self.assertTrue(wants_remediation_proposals("ISS-250801 해결방안 알려줘"))
        self.assertFalse(wants_remediation_proposals("ISS-250801 상태 알려줘"))

    def test_should_emit_needs_issue_and_intent(self) -> None:
        self.assertTrue(
            should_emit_remediation("ISS-250801 조치 어떻게 해", None)
        )
        self.assertFalse(should_emit_remediation("조치 어떻게 해", None))


class RemediationParseTests(unittest.TestCase):
    def test_parse_block(self) -> None:
        reply = (
            "관찰 요약입니다.\n"
            "###REMEDIATION_JSON###\n"
            '{"issueId":"ISS-250801","proposals":['
            '{"id":"p1","title":"습도","narrative":"해당 설비에서 습도 점검을 실시하겠습니다."}'
            "]}\n"
            "###END###"
        )
        clean, rem = parse_remediation_block(reply, fallback_issue_id="ISS-250801")
        self.assertIn("관찰", clean)
        self.assertNotIn("REMEDIATION", clean)
        assert rem is not None
        self.assertEqual(rem["issueId"], "ISS-250801")
        self.assertEqual(len(rem["proposals"]), 1)

    def test_fallback_attach(self) -> None:
        clean, rem = attach_remediation_to_compose(
            message="ISS-250801 해결방안 알려줘",
            page_context=None,
            reply="짧게 설명합니다.",
        )
        self.assertEqual(clean, "짧게 설명합니다.")
        assert rem is not None
        self.assertGreaterEqual(len(rem["proposals"]), 2)

    def test_fallback_factory(self) -> None:
        rem = fallback_remediation("ISS-1")
        self.assertEqual(rem["issueId"], "ISS-1")
        self.assertEqual(len(rem["proposals"]), 3)


if __name__ == "__main__":
    unittest.main()

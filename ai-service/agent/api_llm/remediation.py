"""Issue remediation soft proposals for general chat (no PLC / hardware)."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from agent.api_llm.grounding import message_lot_issue_ids

_REMEDY_INTENT_RE = re.compile(
    r"(해결|방안|조치|대응|어떻게\s*(하|해)|뭘\s*하|개선\s*(안|방안))",
    re.I,
)
_DEFECT_REDUCE_RE = re.compile(r"불량률\s*감소\s*방안", re.I)
_ISSUE_ID_RE = re.compile(r"ISS-[A-Za-z0-9_-]+", re.I)
_JSON_FENCE_RE = re.compile(
    r"###REMEDIATION_JSON###\s*(\{[\s\S]*?\})\s*(?:###END###)?\s*\Z",
    re.I,
)
_JSON_FENCE_ANY_RE = re.compile(
    r"###REMEDIATION_JSON###\s*(\{[\s\S]*?\})",
    re.I,
)

REMEDIATION_PROMPT_SUFFIX = (
    "\n\n[이슈 소프트 조치 카드]\n"
    "이 질문은 이슈·불량률 감소 소프트 조치 요청입니다. 한국어 본문으로 관찰·원인을 짧게 답한 뒤, "
    "반드시 아래 형식으로만 JSON을 붙이세요 (PLC·자동 설정·수치 조작 금지).\n"
    "각 narrative는 「○○(설비/공정)에서 ○○ 조치하시겠습니까?」형태, 2~3개.\n"
    "###REMEDIATION_JSON###\n"
    '{"issueId":"ISS-…","proposals":[{"id":"p1","title":"한줄제목","narrative":"…조치하시겠습니까?"}]}\n'
    "###END###\n"
)


def wants_remediation_proposals(message: str) -> bool:
    m = (message or "").strip()
    if not m:
        return False
    if _DEFECT_REDUCE_RE.search(m):
        return True
    return bool(_REMEDY_INTENT_RE.search(m))


def _as_issue_id(raw: Any) -> str | None:
    if isinstance(raw, str) and raw.upper().startswith("ISS-"):
        return raw.upper()
    return None


def _issue_from_mapping(blob: dict[str, Any] | None) -> str | None:
    if not isinstance(blob, dict):
        return None
    for key in ("issueId", "id", "issue_id"):
        got = _as_issue_id(blob.get(key))
        if got:
            return got
    rec = blob.get("record") if isinstance(blob.get("record"), dict) else None
    if isinstance(rec, dict):
        for key in ("issueId", "id", "issue_id"):
            got = _as_issue_id(rec.get(key))
            if got:
                return got
    return None


def _issue_from_page_lists(page_context: dict[str, Any]) -> str | None:
    payload = page_context.get("page_payload") or page_context.get("pagePayload")
    if not isinstance(payload, dict):
        return None
    selected = payload.get("selected")
    got = _issue_from_mapping(selected if isinstance(selected, dict) else None)
    if got:
        return got
    for list_key in ("issues", "lotRisks", "openIssues", "items"):
        items = payload.get(list_key)
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict):
                got = _issue_from_mapping(item)
                if got:
                    return got
    return None


def resolve_issue_id(
    message: str,
    page_context: dict[str, Any] | None,
) -> str | None:
    ents = message_lot_issue_ids(message)
    for e in ents:
        if e.upper().startswith("ISS"):
            return e.upper() if e.upper().startswith("ISS-") else e
    found = _ISSUE_ID_RE.findall(message or "")
    if found:
        return found[0].upper()
    if not isinstance(page_context, dict):
        return None
    focus_id = page_context.get("focus_id") or page_context.get("focusId")
    got = _as_issue_id(focus_id)
    if got:
        return got
    focus = page_context.get("focus_payload") or page_context.get("focusPayload")
    got = _issue_from_mapping(focus if isinstance(focus, dict) else None)
    if got:
        return got
    return _issue_from_page_lists(page_context)


def should_emit_remediation(
    message: str,
    page_context: dict[str, Any] | None,
) -> bool:
    if not wants_remediation_proposals(message):
        return False
    if resolve_issue_id(message, page_context) is not None:
        return True
    # 「불량률 감소 방안 추천」칩: 화면 이슈가 없어도 소프트 카드 표시
    return bool(_DEFECT_REDUCE_RE.search(message or ""))


def _norm_proposal(raw: dict[str, Any], idx: int) -> dict[str, str] | None:
    title = str(raw.get("title") or "").strip()
    narrative = str(raw.get("narrative") or "").strip()
    if not narrative:
        return None
    if not title:
        title = f"조치 제안 {idx}"
    pid = str(raw.get("id") or "").strip() or f"p{idx}-{uuid.uuid4().hex[:6]}"
    return {"id": pid[:64], "title": title[:120], "narrative": narrative[:500]}


def parse_remediation_block(
    reply: str,
    *,
    fallback_issue_id: str | None,
) -> tuple[str, dict[str, Any] | None]:
    """
    Strip ###REMEDIATION_JSON### … from reply; return (clean_text, remediation).
    """
    text = (reply or "").strip()
    if not text:
        return "", None
    m = _JSON_FENCE_RE.search(text) or _JSON_FENCE_ANY_RE.search(text)
    if not m:
        return text, None
    clean = text[: m.start()].rstrip()
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError:
        return clean, None
    if not isinstance(data, dict):
        return clean, None
    issue_id = str(data.get("issueId") or fallback_issue_id or "").strip().upper()
    props_raw = data.get("proposals")
    if not issue_id.startswith("ISS-") or not isinstance(props_raw, list):
        return clean, None
    proposals: list[dict[str, str]] = []
    for i, item in enumerate(props_raw[:5], start=1):
        if not isinstance(item, dict):
            continue
        norm = _norm_proposal(item, i)
        if norm:
            proposals.append(norm)
    if len(proposals) < 1:
        return clean, None
    return clean, {"issueId": issue_id, "proposals": proposals[:3]}


def _steps_from_page(page_context: dict[str, Any] | None) -> list[str]:
    if not isinstance(page_context, dict):
        return []
    blobs: list[Any] = []
    for key in ("focus_payload", "focusPayload", "page_payload", "pagePayload"):
        blobs.append(page_context.get(key))
    supplement = page_context.get("supplement")
    if isinstance(supplement, dict):
        blobs.append(supplement.get("issue"))
        blobs.append(supplement.get("result"))
    out: list[str] = []
    for blob in blobs:
        if not isinstance(blob, dict):
            continue
        for nest_key in (
            "recommendedAction",
            "recommended_action",
            "action",
            "record",
            "detail",
        ):
            nest = blob.get(nest_key)
            if isinstance(nest, dict):
                steps = nest.get("steps")
                if isinstance(steps, list):
                    for s in steps:
                        if isinstance(s, dict):
                            t = str(s.get("text") or s.get("title") or "").strip()
                        else:
                            t = str(s).strip()
                        if t:
                            out.append(t)
                summary = str(nest.get("summary") or "").strip()
                if summary:
                    out.append(summary)
        action = str(blob.get("actionContent") or blob.get("action_content") or "").strip()
        if action:
            out.append(action[:200])
    # dedupe preserve order
    seen: set[str] = set()
    uniq: list[str] = []
    for t in out:
        if t in seen:
            continue
        seen.add(t)
        uniq.append(t)
    return uniq[:5]


def fallback_remediation(
    issue_id: str,
    page_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Soft narratives when LLM omits the JSON block — still no hardware."""
    steps = _steps_from_page(page_context)
    proposals: list[dict[str, str]] = []
    if steps:
        for i, step in enumerate(steps[:3], start=1):
            proposals.append(
                {
                    "id": f"fb{i}-{uuid.uuid4().hex[:6]}",
                    "title": f"권고 조치 {i}",
                    "narrative": (
                        f"{issue_id} 관련 해당 공정에서 「{step[:80]}」 "
                        f"점검 조치하시겠습니까?"
                    ),
                }
            )
    if not proposals:
        proposals = [
            {
                "id": f"fb1-{uuid.uuid4().hex[:6]}",
                "title": "습도·분위기 점검",
                "narrative": (
                    f"{issue_id} 관련 해당 설비에서 습도·분위기 점검 조치하시겠습니까?"
                ),
            },
            {
                "id": f"fb2-{uuid.uuid4().hex[:6]}",
                "title": "소성 조건 확인",
                "narrative": (
                    f"{issue_id} 관련 소성 구간에서 온도·체류 조건 확인 조치하시겠습니까?"
                ),
            },
            {
                "id": f"fb3-{uuid.uuid4().hex[:6]}",
                "title": "샘플·SPC 재확인",
                "narrative": (
                    f"{issue_id} 관련 검사 구간에서 샘플·SPC 재확인 조치하시겠습니까?"
                ),
            },
        ]
    return {"issueId": issue_id.upper(), "proposals": proposals[:3]}


def attach_remediation_to_compose(
    *,
    message: str,
    page_context: dict[str, Any] | None,
    reply: str,
) -> tuple[str, dict[str, Any] | None]:
    """Parse LLM block or build fallback when issue+remedy intent."""
    if not should_emit_remediation(message, page_context):
        clean, _ = parse_remediation_block(reply, fallback_issue_id=None)
        # strip accidental blocks even if intent miss
        return clean if clean else reply, None
    issue_id = resolve_issue_id(message, page_context) or "ISS-SCREEN"
    clean, rem = parse_remediation_block(reply, fallback_issue_id=issue_id)
    if rem:
        return clean or reply, rem
    return clean or reply, fallback_remediation(issue_id, page_context)

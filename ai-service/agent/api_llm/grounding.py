"""
Page-context grounding helpers for general chat:
- Korean reply normalize (spacing / de-dupe)
- Query-based page_context slice + row filter
- Topic-shift detection
- Grounding block for compose (allowed metrics only)
"""

from __future__ import annotations

import json
import re
from typing import Any

_ENTITY_RE = re.compile(
    r"(LOT[-_]?\w+|ISS[-_]?\w+|문의\s*\d+|\bINQ[-_]?\w+)",
    re.IGNORECASE,
)
# Explicit subject change only. 문서/지식 키워드만으로는 히스토리를 자르지 않는다.
_SHIFT_RE = re.compile(
    r"(다른\s*얘기|그건\s*말고|이제|오늘은|금일|이\s*화면|"
    r"인수인계|지식|문서|문의|설정|SPC|관리도|Q-?\s*COST|큐코스트|"
    r"불량유발|공정\s*변수|기준은)",
    re.IGNORECASE,
)
_DATE_SHIFT_RE = re.compile(r"\d{1,2}\s*일")
_ANALYSIS_RE = re.compile(
    r"(요약|분석|왜|의미|비교|해석|패턴|우선|몇\s*건|얼마나)",
    re.I,
)
_HANDOVER_RE = re.compile(r"(인수인계|특이사항|전달사항|주의사항|수리)", re.I)
_PAST_RE = re.compile(r"(과거\s*(이슈|자료)|완료\s*이슈|past)", re.I)
_DOC_RE = re.compile(r"(문서|Markdown|파일|폴더|Public|Confidential)", re.I)
_LOT_RE = re.compile(r"(위험\s*LOT|LOT|로트|불량확률|잔류|위험등급|risk)", re.I)
_KPI_RE = re.compile(r"(KPI|양품|불량수|금일|오늘)", re.I)
_INQUIRY_RE = re.compile(r"(문의|게시판)", re.I)
_SETTING_RE = re.compile(r"(설정|폰트|테마|새로고침|알림)", re.I)
_SPC_RE = re.compile(r"(SPC|관리도|공정\s*변수|No\s*data|그래프)", re.I)
_PAGE_LABEL_RE = re.compile(
    r"(인수인계|지식\s*라이브러리|/knowledge|/inquiry|문의\s*게시판|"
    r"/management|SPC|/setting|설정|/main|/dashboard)",
    re.I,
)

_DEICTIC_RE = re.compile(
    r"(이거|그것|저거|방금|해당|"
    r"이\s*LOT|이\s*로트|이\s*이슈|이\s*문의|"
    r"선택(한|된)?\s*(로트|LOT)|방금\s*클릭)",
    re.I,
)
_FULL_DETAIL_RE = re.compile(r"(모두|전부|전체|상세|자세히|상세히)", re.I)
_RULE_ECHO_RE = re.compile(
    r"없는\s*문의?\s*탭이\s*활성[^\n.]*\.?|"
    r"없는문의탭이활성[^\n.]*\.?|"
    r"말하지\s*마세요\.?|"
    r"말하지마세요\.?",
    re.I,
)
# User-facing "this screen only shows …" (keep page_context internally).
_SCREEN_ONLY_RE = re.compile(
    r"현재\s*화면은\s*.{0,80}?(만\s*)?보입니다\.?|"
    r"현재\s*화면은\s*.{0,80}?입니다\.?|"
    r"이\s*화면에\s*보이는\s*것은\s*.{0,120}?(뿐입니다|입니다)\.?|"
    r"보이는\s*것은\s*.{0,120}?뿐입니다\.?",
    re.I,
)
_FOCUS_IDENTITY_RE = re.compile(
    r"(지금\s*(로트|LOT)|이\s*(로트|LOT)|이거\s*뭐|뭐야|뭔가요|어떤\s*(로트|LOT)|로트\s*이거)",
    re.I,
)
# Chip: 「지금 보고 있는 화면 데이터를 요약해 주세요」 + 이 페이지/이 화면 요약
_PAGE_SUMMARY_RE = re.compile(
    r"(이\s*(화면|페이지)\s*요약|"
    r"지금\s*보고\s*있는\s*화면|"
    r"화면\s*데이터를\s*요약|"
    r"페이지를\s*요약|"
    r"(화면|페이지)\s*(데이터\s*)?((을|를)\s*)?(요약|정리)\s*해)",
    re.I,
)
_SENTENCE_END_RE = re.compile(
    r"(입니다\.|합니다\.|습니다\.|됩니다\.|니다\.|요\.)(?!\n)",
)
# Hangul ↔ non-Hangul (latin, digit, paren, special). Decimal 8.3 stays intact.
# Comma/semicolon handled separately (space after, not before).
_NON_HANGUL_CHAR = (
    r"A-Za-z0-9"
    r"%#@&*/\\|_+=<>\[\]{}()（）「」『』·•…$€¥£!?"
    r"\"'`~^"
)
_SETTING_UI_KEYS = (
    "fontSize",
    "themeMode",
    "autoRefreshEnabled",
    "refreshIntervalMinutes",
    "n8nAlertEnabled",
    "sections",
    "llmApiKeysNote",
)
_NO_LOT_TABLE_ROUTES = ("/setting", "/inquiry", "/management")
_LIST_LIMIT = 10

_RECORD_KEYS = (
    "sintering_temp",
    "humidity",
    "d50",
    "d90",
    "lithium_input",
    "additive_ratio",
    "process_time",
    "metal_impurity",
    "tank_pressure",
)


def wants_full_detail(message: str) -> bool:
    return bool(_FULL_DETAIL_RE.search(message or ""))


def is_page_summary_intent(message: str) -> bool:
    """Chip or explicit 「이 화면/이 페이지 요약」 — ignore prior turns."""
    return bool(_PAGE_SUMMARY_RE.search((message or "").strip()))


def message_lot_issue_ids(message: str) -> set[str]:
    """LOT-/ISS-/INQ- ids mentioned in the user message."""
    out: set[str] = set()
    for raw in _ENTITY_RE.findall(message or ""):
        token = str(raw).upper()
        if token.startswith(("LOT", "ISS", "INQ")):
            out.add(token)
    return out


def is_lot_why_intent(message: str) -> bool:
    """Causal question about a LOT / defect rate — RAG + that LOT's fields."""
    m = (message or "").strip()
    if not m:
        return False
    if not re.search(r"(왜|원인|이유)", m):
        return False
    if message_lot_issue_ids(m):
        return True
    return bool(re.search(r"(불량률|불량\s*확률|불량|잔류|위험등급)", m))


def _focus_matches_entities(focus: Any, focus_id: Any, ents: set[str]) -> bool:
    if not ents:
        return False
    blob = json.dumps({"f": focus, "id": focus_id}, ensure_ascii=False, default=str).upper()
    return any(e in blob for e in ents)


def route_without_lot_table(route: str) -> bool:
    r = (route or "").lower()
    return any(x in r for x in _NO_LOT_TABLE_ROUTES)


def filter_history_for_entities(history_text: str | None, message: str) -> str:
    """Keep only turns that mention the LOT/ISS ids in the current question."""
    ents = message_lot_issue_ids(message)
    raw = (history_text or "").strip()
    if not ents or not raw:
        return raw
    kept: list[str] = []
    buf: list[str] = []

    def flush() -> None:
        if not buf:
            return
        block = "\n".join(buf)
        blob = block.upper()
        if any(e in blob for e in ents):
            kept.append(block)
        buf.clear()

    for line in raw.splitlines():
        if line.startswith("User:") and buf:
            flush()
        buf.append(line)
    flush()
    return "\n".join(kept)


def _slim_focus_payload(focus: Any, full: bool) -> Any:
    if not isinstance(focus, dict) or full:
        return focus
    out = dict(focus)
    rec = out.get("record")
    if isinstance(rec, dict):
        out["record"] = {k: rec[k] for k in _RECORD_KEYS if k in rec}
    return out


def should_prefer_focus(
    message: str,
    page_context: dict[str, Any] | None,
) -> bool:
    """Focus wins unless the question clearly leaves the selected entity."""
    if not page_context:
        return False
    focus = page_context.get("focus_payload") or page_context.get("focusPayload")
    focus_id = page_context.get("focus_id") or page_context.get("focusId")
    if focus is None or not focus_id:
        return False
    m = (message or "").strip()
    if not m:
        return True
    if is_page_summary_intent(m):
        return False
    msg_ents = message_lot_issue_ids(m)
    route = str(page_context.get("route") or "").lower()
    if msg_ents and route_without_lot_table(route):
        if not _focus_matches_entities(focus, focus_id, msg_ents):
            return False
    if re.search(r"(그건\s*말고|다른\s*얘기)", m):
        return False
    # 「이 로트 / 방금 클릭」 등은 항상 선택 행 우선 (SPC·왜 포함)
    if _DEICTIC_RE.search(m):
        return True
    focus_ents = {e.upper() for e in _ENTITY_RE.findall(json.dumps(focus, ensure_ascii=False, default=str))}
    msg_ents = {e.upper() for e in _ENTITY_RE.findall(m)}
    if msg_ents and focus_ents and msg_ents.isdisjoint(focus_ents):
        return False
    # Broad list / other-domain questions without deixis → use page list
    if re.search(
        r"(이\s*화면|목록|전체\s*요약|몇\s*건|건수|KPI|Q-?\s*COST|설정|문의\s*게시판|인수인계\s*탭)",
        m,
        re.I,
    ) and not _DEICTIC_RE.search(m):
        return False
    return True


def _spc_value_blank(value: Any) -> bool:
    if value is None:
        return True
    s = str(value).strip()
    return s == "" or s in {"-", "—", "none", "null", "None", "N/A", "n/a"}


def _focus_lot_id(focus: Any, focus_id: Any = None) -> str:
    if isinstance(focus, dict):
        for key in ("lotId", "lot_id", "id"):
            v = focus.get(key)
            if v is not None and str(v).strip():
                return str(v).strip()
        row = focus.get("row")
        if isinstance(row, dict) and row.get("lotId"):
            return str(row["lotId"]).strip()
    fid = str(focus_id or "").strip()
    if fid.upper().startswith("LOT"):
        return fid
    return fid or "(선택 LOT)"


def focus_spc_graph_absent(focus: Any) -> bool:
    """True when focused LOT has no SPC graph / blank status."""
    if not isinstance(focus, dict):
        return False
    if str(focus.get("spcGraph") or "").lower() == "none":
        return True
    row = focus.get("row") if isinstance(focus.get("row"), dict) else {}
    detail = focus.get("detail") if isinstance(focus.get("detail"), dict) else {}
    analysis = focus.get("analysis") if isinstance(focus.get("analysis"), dict) else {}
    spc = (
        focus.get("spcStatus")
        if focus.get("spcStatus") is not None
        else focus.get("spc")
        if focus.get("spc") is not None
        else row.get("spc")
        if row.get("spc") is not None
        else detail.get("spcStatus")
        if detail.get("spcStatus") is not None
        else analysis.get("spcStatus")
    )
    metrics = detail.get("metrics") if detail else None
    if isinstance(metrics, list) and len(metrics) > 0 and not _spc_value_blank(spc):
        return False
    if _spc_value_blank(spc):
        return True
    if isinstance(metrics, list) and len(metrics) == 0:
        return True
    return False


def focus_spc_absent_hint(focus: Any, focus_id: Any = None) -> str:
    lot_id = _focus_lot_id(focus, focus_id)
    return (
        f"선택하신 LOT {lot_id}의 SPC 상태는 '-'이며, "
        f"이 LOT에 대한 SPC 그래프(메트릭) 데이터가 없습니다. "
        f"현재 화면에서 선택한 이 LOT 기준입니다."
    )


def deterministic_user_reply(page_context: dict[str, Any] | None) -> str | None:
    """User-facing fixed reply (skip LLM) for offscreen / SPC-absent / focus summary."""
    if not page_context:
        return None
    # An authenticated read tool can answer an explicit off-screen entity query.
    # Do not let the generic off-screen hint hide that result.
    if isinstance(page_context.get("supplement"), dict):
        return None
    pp = _page_payload(page_context)
    if not isinstance(pp, dict):
        return None
    hint = pp.get("empty_hint")
    if not hint or not str(hint).strip():
        return None
    primary = str(pp.get("primary_table") or "")
    if primary in {"offscreen", "focus_spc_absent", "focus_summary"} or pp.get(
        "deterministic"
    ):
        return str(hint).strip()
    return None


def join_spaced_parts(parts: list[Any] | tuple[Any, ...], *, sep: str = " ") -> str:
    """Join DB/chunk fragments with a single space (or newline) between each."""
    cleaned: list[str] = []
    for p in parts:
        if p is None:
            continue
        t = str(p).strip()
        if t:
            cleaned.append(t)
    if not cleaned:
        return ""
    joined = sep.join(cleaned)
    return re.sub(r" {2,}", " ", joined).strip()


def wants_focus_identity_summary(message: str) -> bool:
    return bool(_FOCUS_IDENTITY_RE.search(message or ""))


def _pick_focus_number(focus: dict[str, Any], *keys: str) -> Any:
    row = focus.get("row") if isinstance(focus.get("row"), dict) else {}
    detail = focus.get("detail") if isinstance(focus.get("detail"), dict) else {}
    analysis = focus.get("analysis") if isinstance(focus.get("analysis"), dict) else {}
    for src in (focus, row, detail, analysis):
        for k in keys:
            if k in src and src[k] is not None and str(src[k]).strip() != "":
                return src[k]
    return None


def _fmt_metric(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, float):
        return f"{value:.4g}"
    if isinstance(value, int):
        return str(value)
    s = str(value).strip()
    return s or None


def _fmt_prob_percent(value: Any) -> str | None:
    """Format defect probability as percent text (no % sign)."""
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        s = str(value).strip().rstrip("%")
        return s or None
    if 0.0 <= v <= 1.0:
        v = v * 100.0
    txt = f"{v:.1f}".rstrip("0").rstrip(".")
    return txt or None


def build_spaced_focus_summary(
    focus: Any,
    focus_id: Any = None,
    route: str | None = None,
) -> str:
    """Build a user-facing LOT summary with spaces between every DB field."""
    if not isinstance(focus, dict):
        focus = {}
    _ = route
    lot_id = _focus_lot_id(focus, focus_id)
    bits: list[str] = [f"선택 LOT {lot_id} 입니다."]

    prob = _pick_focus_number(
        focus, "prob", "defectProb", "probability", "riskScore"
    )
    prob_txt = _fmt_prob_percent(prob)
    if prob_txt is not None:
        bits.append(f"불량확률은 {prob_txt}% 입니다.")

    residual = _pick_focus_number(
        focus, "predLi", "residualLithium", "residual"
    )
    residual_txt = _fmt_metric(residual)
    if residual_txt is not None:
        bits.append(f"잔류리튬은 {residual_txt} ppm 입니다.")

    margin = _pick_focus_number(focus, "margin", "residualMargin")
    margin_txt = _fmt_metric(margin)
    if margin_txt is not None:
        bits.append(f"여유량은 {margin_txt} ppm 입니다.")

    grade = _pick_focus_number(focus, "grade", "riskLevel", "status")
    if grade is not None and str(grade).strip():
        bits.append(f"위험등급은 {str(grade).strip()} 입니다.")

    spc = _pick_focus_number(focus, "spcStatus", "spc")
    if focus.get("spcGraph") == "none" or _spc_value_blank(spc):
        bits.append("SPC는 - 입니다.")
    elif spc is not None:
        bits.append(f"SPC는 {str(spc).strip()} 입니다.")

    return join_spaced_parts(bits, sep=" ")


_ROUTE_PAGE = {
    "/knowledge": "knowledge",
    "/inquiry": "inquiry",
    "/management": "spc",
    "/setting": "setting",
    "/main": "main",
    "/dashboard": "dashboard",
    "/issue": "issue",
}


def _space_hangul_nonhangul(text: str) -> str:
    """Insert one space wherever Hangul meets latin/digit/paren/special."""
    s = text
    # Hangul → non-Hangul
    s = re.sub(
        rf"([가-힣])([{_NON_HANGUL_CHAR}])",
        r"\1 \2",
        s,
    )
    # non-Hangul → Hangul
    s = re.sub(
        rf"([{_NON_HANGUL_CHAR}])([가-힣])",
        r"\1 \2",
        s,
    )
    # digit ↔ latin (e.g. 3071ppm → 3071 ppm), keep LOT-2026 via hyphen
    s = re.sub(r"([0-9])([A-Za-z])", r"\1 \2", s)
    s = re.sub(r"([A-Za-z])([0-9])", r"\1 \2", s)
    # space after comma/semicolon when glued to next token
    s = re.sub(r"([,，;；])([^\s\n])", r"\1 \2", s)
    # Collapse runs of spaces (keep newlines)
    s = re.sub(r"[^\S\n]+", " ", s)
    return s


def normalize_korean_reply(text: str) -> str:
    """
    Reply spacing rewrite:
    - Hangul ↔ latin/digit/paren/special → exactly one space
    - Blank line after 입니다/합니다/습니다/됩니다/니다/요. (not every period)
    - Deduplicate near-identical lines
    """
    if not text:
        return text
    raw = text.strip()
    if not raw:
        return raw

    raw = raw.replace("\ufeff", "").replace("\u200b", "")
    raw = _RULE_ECHO_RE.sub("", raw)
    raw = _SCREEN_ONLY_RE.sub("", raw)
    raw = re.sub(r"[^\S\n]{2,}", " ", raw)
    raw = raw.strip()
    if not raw:
        return ""

    raw = _space_hangul_nonhangul(raw)

    raw = _SENTENCE_END_RE.sub(r"\1\n\n", raw)
    raw = re.sub(r"\n{3,}", "\n\n", raw)

    lines = re.split(r"\n+", raw)
    out: list[str] = []
    seen: set[str] = set()
    for line in lines:
        t = line.strip()
        if not t:
            continue
        norm = re.sub(r"\s+", "", t)
        if not norm or norm in seen:
            continue
        if any(norm[:24] == s[:24] and len(norm) > 20 and len(s) > 20 for s in seen):
            continue
        out.append(t)
        seen.add(norm)
    if not out:
        return raw.strip()
    return "\n\n".join(out)


def analysis_mode(message: str) -> bool:
    return bool(_ANALYSIS_RE.search(message or ""))


def route_label(route: str) -> str:
    r = (route or "").lower()
    for key, label in _ROUTE_PAGE.items():
        if key in r:
            return label
    return "unknown"


def menu_answer_contract(route: str) -> list[str]:
    """Stable user-facing output order for each shell menu."""
    label = route_label(route)
    contracts: dict[str, list[str]] = {
        "dashboard": [
            "위험 LOT 건수와 현재 화면 범위",
            "우선 확인할 LOT와 근거 지표",
            "다음 확인 또는 조치",
        ],
        "main": [
            "주요 KPI와 위험 LOT 현황",
            "Q-COST 현황",
            "우선 확인할 변화",
        ],
        "issue": [
            "열린 이슈와 현재 필터 결과",
            "고위험·담당자 미지정·미조치 이슈",
            "다음 처리 순서",
        ],
        "knowledge": [
            "과거 이슈·인수인계·문서 현황",
            "현재 선택 또는 검색 결과",
            "참고할 자료와 후속 작업",
        ],
        "inquiry": [
            "문의 건수와 현재 필터 결과",
            "처리 상태별 현황",
            "우선 답변할 문의",
        ],
        "spc": [
            "조회 기간과 표시 패널",
            "현재 선택 패널",
            "차트 확인 시 유의사항",
        ],
        "setting": [
            "현재 화면 설정",
            "자동 새로고침·알림 상태",
            "변경 가능한 항목",
        ],
    }
    return contracts.get(label, ["현재 화면 핵심 정보", "확인할 항목", "다음 행동"])


def _menu_rows(value: Any, *keys: str) -> list[dict[str, Any]]:
    src = value if isinstance(value, dict) else {}
    for key in keys:
        rows = src.get(key)
        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]
    return []


def _menu_value(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip() != "":
            return value
    return None


def _menu_count(value: Any, fallback: int = 0) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return max(0, fallback)


def _menu_percent(value: Any) -> str | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if 0 <= number <= 1:
        number *= 100
    return f"{number:.1f}%"


def _menu_money(value: Any) -> str | None:
    try:
        return f"{float(value):,.0f}원"
    except (TypeError, ValueError):
        return None


def _menu_short(value: Any, limit: int = 80) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _menu_display(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    labels = {
        "critical": "매우 높음",
        "high": "높음",
        "medium": "중간",
        "low": "낮음",
        "warning": "경고",
        "normal": "정상",
        "pending": "대기",
        "open": "진행 중",
        "in_progress": "처리 중",
        "completed": "완료",
        "closed": "완료",
        "dark": "다크",
        "light": "라이트",
        "system": "시스템 설정",
    }
    return labels.get(text.lower(), text)


def build_read_tool_reply(page_context: dict[str, Any] | None) -> str | None:
    """Render authenticated read-tool output without exposing raw JSON."""
    if not page_context:
        return None
    tool_data = page_context.get("supplement")
    if not isinstance(tool_data, dict):
        return None

    category = _menu_short(tool_data.get("category"), 40) or "데이터 조회"
    error = _menu_short(tool_data.get("error"), 180)
    checks = [
        str(value).strip()
        for value in (tool_data.get("recommendedChecks") or [])
        if str(value).strip()
    ]
    evidence = [
        str(value).strip()
        for value in (tool_data.get("evidence") or [])
        if str(value).strip()
    ]
    if error:
        lines = [f"[{category}]", f"- 조회 실패: {error}"]
        if checks:
            lines.extend(["[권장 확인]", *[f"- {value}" for value in checks[:3]]])
        return join_spaced_parts(lines, sep="\n")

    result = tool_data.get("result")
    if not isinstance(result, dict):
        return None
    tool = str(tool_data.get("tool") or "")
    lines: list[str] = ["[조회 결과]"]
    process_labels = {
        "d50": "D50",
        "d90": "D90",
        "metalImpurity": "금속 불순물",
        "lithiumInput": "리튬 투입량",
        "additiveRatio": "첨가제 비율",
        "processTime": "공정 시간",
        "sinteringTemp": "소성 온도",
        "humidity": "습도",
        "tankPressure": "탱크 압력",
    }

    def add_lot_summary(row: dict[str, Any], prefix: str = "") -> None:
        lot_id = _menu_value(row, "lotId", "id") or "LOT 미상"
        facts = []
        risk = _menu_display(_menu_value(row, "riskLevel", "risk"))
        probability = _menu_percent(_menu_value(row, "defectProb", "probability"))
        residual = _fmt_metric(_menu_value(row, "residualLithium", "residual"))
        margin = _fmt_metric(_menu_value(row, "residualMargin", "margin"))
        spc = _menu_display(_menu_value(row, "spcStatus", "spc"))
        if risk:
            facts.append(f"위험도 {risk}")
        if probability:
            facts.append(f"불량 가능성 {probability}")
        if residual:
            facts.append(f"잔류 리튬 {residual} ppm")
        if margin:
            facts.append(f"여유 {margin} ppm")
        if spc:
            facts.append(f"SPC {spc}")
        label = f"{prefix}{lot_id}" if prefix else str(lot_id)
        lines.append(f"- {label}" + (f": {' · '.join(facts)}" if facts else ""))

    if tool == "lot_lookup":
        add_lot_summary(result)
        recorded = _menu_short(result.get("recordedAt"), 40)
        if recorded:
            lines.append(f"- 기록 시각: {recorded}")
        process = _as_dict(result.get("process")) or {}
        process_bits = [
            f"{process_labels[key]} {_fmt_metric(value)}"
            for key, value in process.items()
            if key in process_labels and _fmt_metric(value) is not None
        ]
        if process_bits:
            lines.append("- 공정값: " + " · ".join(process_bits))
    elif tool == "lot_compare":
        a = _as_dict(result.get("a")) or {}
        b = _as_dict(result.get("b")) or {}
        add_lot_summary(a, "A · ")
        add_lot_summary(b, "B · ")
        delta = _as_dict(result.get("deltaBMinusA")) or {}
        delta_bits = []
        for key, label in (
            ("defectProb", "불량 확률"),
            ("residualLithium", "잔류 리튬"),
            ("residualMargin", "잔류 여유"),
        ):
            value = delta.get(key)
            if isinstance(value, (int, float)):
                shown = value * 100 if key == "defectProb" else value
                unit = "%p" if key == "defectProb" else " ppm"
                delta_bits.append(f"{label} {shown:+.4g}{unit}")
        if delta_bits:
            lines.append("- B-A 차이: " + " · ".join(delta_bits))
        process_delta = _as_dict(delta.get("process")) or {}
        ranked = sorted(
            (
                (key, float(value))
                for key, value in process_delta.items()
                if isinstance(value, (int, float)) and float(value) != 0
            ),
            key=lambda item: abs(item[1]),
            reverse=True,
        )
        if ranked:
            lines.append(
                "- 공정값 차이 상위: "
                + " · ".join(
                    f"{process_labels.get(key, key)} {value:+.4g}"
                    for key, value in ranked[:4]
                )
            )
    elif tool == "issue_lookup":
        lines.append(f"- 이슈: {_menu_value(result, 'issueId', 'id') or '미상'}")
        lines.append(f"- 관련 LOT: {_menu_value(result, 'lotId', 'lot') or '미상'}")
        lines.append(
            f"- 상태: {'완료' if result.get('completed') else '열림'} · "
            f"위험도 {_menu_display(result.get('riskLevel')) or '미상'} · "
            f"담당자 {_menu_short(result.get('assigneeName'), 40) or '미지정'}"
        )
        content = _menu_short(result.get("issueContent"), 180)
        if content:
            lines.append(f"- 내용: {content}")
    elif tool == "issue_list":
        lines.append(
            f"- 열린 이슈 {result.get('total', 0)}건 · 고위험 {result.get('highRisk', 0)}건 · "
            f"조치 미등록 {result.get('missingAction', 0)}건"
        )
        for row in (result.get("items") or [])[:5]:
            if not isinstance(row, dict):
                continue
            lines.append(
                f"- {_menu_value(row, 'issueId', 'id') or '이슈 미상'} · "
                f"LOT {_menu_value(row, 'lotId') or '미상'} · "
                f"위험도 {_menu_display(row.get('riskLevel')) or '미상'} · "
                f"조치 {'등록' if row.get('hasAction') else '대기'}"
            )
    elif tool == "inquiry_lookup":
        lines.append(f"- 문의: {_menu_value(result, 'id') or '미상'}")
        lines.append(
            f"- 분류: {_menu_display(result.get('category')) or '미상'} · "
            f"상태 {_menu_display(result.get('status')) or '미상'}"
        )
        title = _menu_short(result.get("title"), 160)
        content = _menu_short(result.get("content"), 220)
        if title:
            lines.append(f"- 제목: {title}")
        if content:
            lines.append(f"- 내용: {content}")
    elif tool == "inquiry_list":
        status_counts = _as_dict(result.get("statusCounts")) or {}
        status_text = " · ".join(f"{key} {value}건" for key, value in status_counts.items())
        lines.append(f"- 문의 {result.get('total', 0)}건" + (f" · {status_text}" if status_text else ""))
        for row in (result.get("items") or [])[:5]:
            if not isinstance(row, dict):
                continue
            lines.append(
                f"- {_menu_value(row, 'id') or '문의 미상'} · "
                f"{_menu_short(row.get('title'), 80) or '제목 없음'} · "
                f"상태 {_menu_display(row.get('status')) or '미상'}"
            )

    lines.append("[판단 근거]")
    lines.append("- " + (" · ".join(evidence) if evidence else "인증된 읽기 전용 조회 결과"))
    risk_reason = _menu_short(result.get("riskReason"), 180)
    if risk_reason:
        lines.append(f"- 저장된 위험 사유: {risk_reason}")
    if checks:
        lines.append("[권장 확인]")
        lines.extend(f"- {value}" for value in checks[:4])
    return join_spaced_parts(lines, sep="\n")


def build_menu_context_reply(
    message: str,
    page_context: dict[str, Any] | None,
) -> str | None:
    """Natural fallback for shell menus; never expose raw page JSON."""
    _ = message
    if not page_context:
        return None
    route = str(page_context.get("route") or "").lower()
    label = route_label(route)
    pp = _page_payload(page_context)
    if not pp or label == "unknown":
        return None

    lines: list[str] = []

    if label == "dashboard":
        risk = _as_dict(pp.get("lotRisks")) or {}
        rows = _menu_rows(risk, "items", "lots")
        total = _menu_count(risk.get("total"), len(rows))
        lines.append("대시보드 위험 현황입니다.")
        lines.append(f"- 위험 LOT: 총 {total}건, 현재 화면 {len(rows)}건")
        for row in rows[:3]:
            lot_id = _menu_value(row, "lotId", "id") or "LOT 미상"
            risk_level = _menu_display(_menu_value(row, "riskLevel", "grade", "status"))
            probability = _menu_percent(
                _menu_value(row, "defectProb", "prob", "riskScore")
            )
            spc = _menu_display(_menu_value(row, "spcStatus", "spc"))
            facts = [
                f"위험도 {risk_level}" if risk_level else None,
                f"불량 가능성 {probability}" if probability else None,
                f"SPC {spc}" if spc else None,
            ]
            detail = " · ".join(str(v) for v in facts if v)
            lines.append(f"- 우선 확인: {lot_id}" + (f" · {detail}" if detail else ""))
        if not rows:
            lines.append("- 현재 필터에 표시된 위험 LOT이 없습니다.")
        else:
            lines.append("- 다음 확인: 불량 가능성, 잔류 리튬, SPC 경고 순으로 상세를 확인하세요.")

    elif label == "main":
        risk = _as_dict(pp.get("riskTop")) or {}
        rows = _menu_rows(risk, "items", "lots")
        total = _menu_count(risk.get("total"), len(rows))
        kpis = pp.get("dailyKpi")
        kpi_rows = [row for row in kpis if isinstance(row, dict)] if isinstance(kpis, list) else []
        qcost = _as_dict(pp.get("qCost")) or {}
        lines.append("메인 현황 요약입니다.")
        lines.append(f"- 위험 LOT: 총 {total}건, 현재 화면 {len(rows)}건")
        if kpi_rows:
            kpi_bits = []
            for row in kpi_rows[:4]:
                title = _menu_value(row, "title", "label", "id")
                value = _menu_value(row, "value", "count")
                if title is not None and value is not None:
                    kpi_bits.append(f"{title} {value}")
            if kpi_bits:
                lines.append("- 주요 KPI: " + " · ".join(kpi_bits))
        total_qcost = _menu_money(qcost.get("totalQCost"))
        if total_qcost:
            lines.append(f"- Q-COST: {total_qcost} ({qcost.get('month') or '현재 조회 기간'})")
        if rows:
            first = rows[0]
            lot_id = _menu_value(first, "lotId", "id") or "LOT 미상"
            reason = _menu_short(_menu_value(first, "riskReason", "reason"), 60)
            lines.append(f"- 우선 확인: {lot_id}" + (f" · {reason}" if reason else ""))

    elif label == "issue":
        issues = _as_dict(pp.get("issues")) or {}
        rows = _menu_rows(issues, "items", "issues")
        if not rows and isinstance(pp.get("issues"), list):
            rows = [row for row in pp["issues"] if isinstance(row, dict)]
        total = _menu_count(issues.get("total", pp.get("totalOpen")), len(rows))
        high = sum(
            1
            for row in rows
            if str(_menu_value(row, "riskLevel", "risk", "severity") or "").lower()
            in {"high", "critical", "고위험", "위험"}
        )
        unassigned = sum(
            1
            for row in rows
            if str(_menu_value(row, "assignee", "manager") or "").strip()
            in {"", "-", "미지정", "없음"}
        )
        missing_action = sum(
            1
            for row in rows
            if row.get("hasAction") is False
            or str(row.get("processStatus") or "").lower() in {"pending", "대기"}
        )
        lines.append("이슈 메뉴 현황입니다.")
        lines.append(f"- 열린 이슈: 총 {total}건, 현재 화면 {len(rows)}건")
        lines.append(
            f"- 우선순위 점검: 고위험 {high}건 · 담당자 미지정 {unassigned}건 · 조치 대기 {missing_action}건"
        )
        for row in rows[:3]:
            issue_id = _menu_value(row, "issueId", "id") or "이슈 미상"
            lot_id = _menu_value(row, "lotId", "lot")
            risk_level = _menu_display(_menu_value(row, "riskLevel", "risk", "severity"))
            facts = [f"LOT {lot_id}" if lot_id else None, f"위험도 {risk_level}" if risk_level else None]
            details = " · ".join(str(v) for v in facts if v)
            lines.append(f"- 확인 대상: {issue_id}" + (f" · {details}" if details else ""))
        lines.append("- 다음 처리: 고위험 → 담당자 미지정 → 조치 대기 순으로 확인하세요.")

    elif label == "knowledge":
        past = _as_dict(pp.get("pastIssues")) or {}
        handover = _as_dict(pp.get("handover")) or {}
        past_rows = _menu_rows(past, "items")
        handover_rows = _menu_rows(handover, "items")
        past_total = _menu_count(past.get("filteredTotal", past.get("total")), len(past_rows))
        handover_total = _menu_count(
            handover.get("filteredTotal", handover.get("total")), len(handover_rows)
        )
        docs = _as_dict(pp.get("documentsMeta")) or {}
        selected_docs = _menu_count(docs.get("selectedPathCount"), 0)
        lines.append("지식 메뉴 현황입니다.")
        lines.append(f"- 과거 이슈: {past_total}건 · 인수인계: {handover_total}건")
        lines.append(f"- 선택 문서: {selected_docs}건")
        for row in past_rows[:2]:
            title = _menu_short(_menu_value(row, "title", "issueContent"), 70)
            if title:
                lines.append(f"- 참고할 과거 이슈: {title}")
        for row in handover_rows[:2]:
            content = _menu_short(_menu_value(row, "handoverContent", "action", "title"), 70)
            if content:
                lines.append(f"- 확인할 인수인계: {content}")
        lines.append("- 다음 확인: 선택 자료의 상세 내용과 근거 문서를 열어 확인하세요.")

    elif label == "inquiry":
        rows = [row for row in (pp.get("items") or []) if isinstance(row, dict)]
        total = _menu_count(pp.get("total"), len(rows))
        filtered = _menu_count(pp.get("filteredTotal"), len(rows))
        pending = sum(
            1
            for row in rows
            if str(row.get("status") or "").lower()
            in {"pending", "open", "접수", "대기", "미답변"}
        )
        lines.append("문의 메뉴 현황입니다.")
        lines.append(f"- 전체 문의: {total}건 · 현재 필터 결과: {filtered}건")
        lines.append(f"- 현재 화면의 답변 대기 문의: {pending}건")
        for row in rows[:3]:
            title = _menu_short(row.get("title"), 70)
            if title:
                status = _menu_display(row.get("status")) or "미상"
                lines.append(f"- 확인 대상: {title} · 상태 {status}")
        lines.append("- 다음 처리: 답변 대기 문의부터 상세 내용을 확인하세요.")

    elif label == "setting":
        lines.append("설정 메뉴 현황입니다.")
        lines.append(
            f"- 화면: 글자 크기 {pp.get('fontSize') or '기본'} · 테마 {_menu_display(pp.get('themeMode')) or '기본'}"
        )
        refresh = "사용" if pp.get("autoRefreshEnabled") else "사용 안 함"
        alert = "사용" if pp.get("n8nAlertEnabled") else "사용 안 함"
        lines.append(
            f"- 자동 새로고침: {refresh}"
            + (f" · {pp.get('refreshIntervalMinutes')}분" if pp.get("autoRefreshEnabled") else "")
        )
        lines.append(f"- 알림 연동: {alert}")
        lines.append("- API 키 값은 챗봇 답변에 표시하지 않습니다.")

    elif label == "spc":
        panels = [row for row in (pp.get("panels") or []) if isinstance(row, dict)]
        date_range = _as_dict(pp.get("dateRange")) or {}
        expanded = _as_dict(pp.get("expandedPanel")) or {}
        start = _menu_value(date_range, "from", "start", "startDate")
        end = _menu_value(date_range, "to", "end", "endDate")
        lines.append("SPC 관리 메뉴 현황입니다.")
        lines.append(f"- 표시 패널: {len(panels)}개")
        if start or end:
            lines.append(f"- 조회 기간: {start or '-'} ~ {end or '-'}")
        if expanded:
            lines.append(f"- 선택 패널: {_menu_value(expanded, 'label', 'key') or '미상'}")
        lines.append("- 챗봇에는 차트 이미지가 아닌 패널과 기간 정보만 전달됩니다.")

    return join_spaced_parts(lines, sep="\n") if lines else None


def build_focus_context_reply(page_context: dict[str, Any] | None) -> str | None:
    """Summarize the selected UI entity without exposing internal JSON."""
    if not page_context:
        return None
    payload = page_context.get("focus_payload") or page_context.get("focusPayload")
    focus_id = page_context.get("focus_id") or page_context.get("focusId")
    if payload is None and not focus_id:
        return None
    if not isinstance(payload, dict):
        return f"선택한 항목: {focus_id}" if focus_id else "선택한 항목을 확인하고 있습니다."

    label = route_label(str(page_context.get("route") or ""))
    entity = {
        "main": "LOT",
        "dashboard": "LOT",
        "issue": "이슈",
        "knowledge": "자료",
        "inquiry": "문의",
        "spc": "SPC 항목",
        "setting": "설정",
    }.get(label, "항목")
    primary = focus_id or _menu_value(
        payload,
        "lotId",
        "lot_id",
        "issueId",
        "issue_id",
        "id",
        "title",
        "label",
    )
    lines = [f"선택한 {entity}: {primary or '현재 항목'}"]

    def add(name: str, value: Any, *, display: bool = False) -> None:
        shown = _menu_display(value) if display else _menu_short(value, 100)
        if shown:
            lines.append(f"- {name}: {shown}")

    if label in {"main", "dashboard"}:
        related_lot = _menu_value(payload, "lotId", "lot_id")
        if related_lot and str(related_lot) != str(primary):
            add("LOT", related_lot)
        add("위험도", _menu_value(payload, "riskLevel", "risk_level", "grade"), display=True)
        probability = _menu_percent(
            _menu_value(payload, "defectProb", "defect_prob", "prob", "riskScore", "risk_score")
        )
        add("불량 가능성", probability)
        add("SPC 상태", _menu_value(payload, "spcStatus", "spc_status", "spc"), display=True)
        add("위험 근거", _menu_value(payload, "riskReason", "risk_reason", "reason"))
    elif label == "issue":
        add("관련 LOT", _menu_value(payload, "lotId", "lot_id", "lot"))
        add("위험도", _menu_value(payload, "riskLevel", "risk_level", "risk", "severity"), display=True)
        add("담당자", _menu_value(payload, "assignee", "manager"))
        add("처리 상태", _menu_value(payload, "processStatus", "process_status", "status"), display=True)
        add("내용", _menu_value(payload, "title", "issueContent", "issue_content", "content"))
    elif label == "knowledge":
        add("제목", _menu_value(payload, "title", "issueContent", "issue_content"))
        add("상태", _menu_value(payload, "status", "processStatus", "process_status"), display=True)
        add("핵심 내용", _menu_value(payload, "handoverContent", "handover_content", "action", "content"))
    elif label == "inquiry":
        add("제목", payload.get("title"))
        add("처리 상태", payload.get("status"), display=True)
        add("내용", _menu_value(payload, "content", "question"))
    elif label == "spc":
        add("패널", _menu_value(payload, "label", "key", "name"))
        add("상태", payload.get("status"), display=True)

    if len(lines) == 1:
        lines.append("- 상세 정보는 현재 화면에서 확인하세요.")
    return join_spaced_parts(lines, sep="\n")


def visible_ui_for_route(
    route: str,
    page_payload: dict[str, Any] | None = None,
) -> list[str]:
    """Human-readable elements actually on the current screen."""
    label = route_label(route)
    pp = page_payload if isinstance(page_payload, dict) else {}
    vt = pp.get("visibleTables")
    if isinstance(vt, list) and vt:
        return [str(x) for x in vt]

    if label == "knowledge":
        items = ["과거자료(pastIssues)", "인수인계(handover)", "사내문서(documents)"]
        tab = pp.get("activeTab")
        if tab:
            items.append(f"activeTab={tab}")
        return items
    if label == "inquiry":
        return ["문의목록(inquiry)", "필터", "선택문의"]
    if label == "main":
        return ["위험LOT(riskTop)", "일일KPI(dailyKpi)", "Q-COST(qCost)"]
    if label == "dashboard":
        return ["LOT위험(lotRisks)", "생산추이", "상세패널"]
    if label == "issue":
        return ["이슈목록", "이슈상세"]
    if label == "spc":
        return ["SPC패널(Grafana)", "날짜필터"]
    if label == "setting":
        return ["폰트", "테마", "새로고침", "알림", "API키설정"]
    return ["현재화면"]


def offscreen_question_hint(
    message: str,
    route: str,
    visible: list[str],
) -> str | None:
    """If user asks about UI not on this page, return a hard empty_answer_hint."""
    m = (message or "").strip()
    label = route_label(route)
    _ = visible

    # Knowledge page: "문의" means inquiry board elsewhere — not a tab here
    if label == "knowledge" and _INQUIRY_RE.search(m) and not re.search(
        r"ISS-|과거\s*(이슈|자료)", m, re.I
    ):
        return "문의 내역은 /inquiry (문의 게시판)으로 이동하세요."
    if label == "knowledge" and _SETTING_RE.search(m) and "인수인계" not in m:
        return "설정은 /setting 으로 이동하세요."
    if label not in {"inquiry", "unknown"} and re.search(
        r"문의\s*(내역|목록|게시판|탭)", m
    ):
        return "문의는 /inquiry 로 이동하세요."
    if label != "spc" and _SPC_RE.search(m) and label == "knowledge":
        return "SPC 관리도는 /management 로 이동하세요."
    return None


def _as_dict(v: Any) -> dict[str, Any] | None:
    return v if isinstance(v, dict) else None


def _keep_route_tables(pp: dict[str, Any], route: str) -> dict[str, Any]:
    """Drop other-page lists so dashboard/main/issue never share rows."""
    out = dict(pp)
    drops: tuple[str, ...] = ()
    if "/knowledge" in route:
        drops = ("lotRisks", "riskTop", "dailyKpi", "qCost", "issues", "selectedLot")
    elif "/inquiry" in route:
        drops = (
            "lotRisks",
            "riskTop",
            "dailyKpi",
            "qCost",
            "issues",
            "handover",
            "pastIssues",
        )
    elif "/setting" in route:
        drops = ("lotRisks", "riskTop", "dailyKpi", "qCost", "issues", "handover")
    elif "/management" in route:
        drops = ("lotRisks", "riskTop", "dailyKpi", "qCost", "issues", "handover")
    elif "/dashboard" in route:
        drops = ("riskTop", "issues", "dailyKpi", "qCost", "handover", "pastIssues")
    elif "/main" in route:
        drops = ("lotRisks", "issues", "handover", "pastIssues", "selectedLot")
    elif "/issue" in route:
        drops = (
            "lotRisks",
            "riskTop",
            "dailyKpi",
            "qCost",
            "handover",
            "pastIssues",
            "selectedLot",
        )
    for key in drops:
        out.pop(key, None)
    if "/setting" not in (route or "").lower():
        for key in _SETTING_UI_KEYS:
            out.pop(key, None)
    return out


def _page_payload(page_context: dict[str, Any] | None) -> dict[str, Any]:
    if not page_context:
        return {}
    pp = page_context.get("page_payload") or page_context.get("pagePayload")
    return pp if isinstance(pp, dict) else {}


def _last_event(page_context: dict[str, Any] | None) -> dict[str, Any] | None:
    if not page_context:
        return None
    ev = page_context.get("last_event") or page_context.get("lastEvent")
    if not isinstance(ev, dict):
        return None
    return {
        "type": ev.get("type"),
        "target": ev.get("target"),
        "entity_id": ev.get("entity_id") or ev.get("entityId"),
        "ts": ev.get("ts"),
    }


def detect_topic_shift(
    message: str,
    history_text: str | None,
    page_context: dict[str, Any] | None,
) -> bool:
    """True when the user clearly changes subject (not a document follow-up)."""
    m = (message or "").strip()
    if not m:
        return False
    if is_page_summary_intent(m):
        return True
    if _SHIFT_RE.search(m) or _DATE_SHIFT_RE.search(m):
        return True

    hist = history_text or ""
    route = str((page_context or {}).get("route") or "")
    rl = route.lower()
    label = route_label(route)

    # History talks about a different shell page than current route
    if hist and _PAGE_LABEL_RE.search(hist):
        hist_l = hist.lower()
        if label == "inquiry" and ("인수인계" in hist_l or "/knowledge" in hist_l):
            return True
        if label == "spc" and ("인수인계" in hist_l or "문의" in hist_l):
            return True
        if label == "setting" and (
            "인수인계" in hist_l or "spc" in hist_l or "불량" in hist_l
        ):
            return True
        if label == "knowledge" and ("문의 게시판" in hist_l or "/inquiry" in hist_l):
            return True
        if label in {"main", "dashboard"} and "인수인계" in hist_l:
            return True

    if not hist:
        return False

    msg_ents = {e.upper() for e in _ENTITY_RE.findall(m)}
    hist_ents = {e.upper() for e in _ENTITY_RE.findall(hist)}
    if msg_ents and hist_ents and msg_ents.isdisjoint(hist_ents):
        return True

    if "/knowledge" in rl and _LOT_RE.search(hist) and not _LOT_RE.search(m):
        return True
    if "/inquiry" in rl and ("인수인계" in hist or _LOT_RE.search(hist)):
        return True
    if "/management" in rl and ("인수인계" in hist or _INQUIRY_RE.search(hist)):
        return True
    if "/setting" in rl and (
        "인수인계" in hist or "SPC" in hist or _LOT_RE.search(hist)
    ):
        return True
    return False


def _filter_items_by_query(items: list[Any], message: str, limit: int | None = None) -> list[Any]:
    lim = limit if limit is not None else _LIST_LIMIT
    tokens = re.findall(r"[\w가-힣\-]+", (message or "").lower())
    tokens = [
        t
        for t in tokens
        if len(t) >= 2
        and t not in {"요약", "내용", "무슨", "알려", "해줘", "주세요", "기준", "기준은"}
    ]
    if not tokens or not items:
        return items[:lim]
    scored: list[tuple[int, Any]] = []
    for it in items:
        blob = json.dumps(it, ensure_ascii=False, default=str).lower()
        score = sum(1 for t in tokens if t in blob)
        if score:
            scored.append((score, it))
    if not scored:
        return []
    scored.sort(key=lambda x: -x[0])
    return [it for _, it in scored[:lim]]


def _handover_slice(pp: dict[str, Any], m: str, primary: str) -> dict[str, Any]:
    ho = _as_dict(pp.get("handover")) or {}
    items = list(ho.get("items") or [])
    filtered = _filter_items_by_query(items, m)
    if filtered:
        use_items = filtered
    elif primary == "handover" and _ENTITY_RE.search(m):
        use_items = []
    else:
        use_items = items[:_LIST_LIMIT]
    sliced: dict[str, Any] = {
        "activeTab": pp.get("activeTab"),
        "filters": pp.get("filters"),
        "primary_table": "handover",
        "handover": {
            "total": ho.get("total"),
            "filteredTotal": ho.get("filteredTotal", ho.get("total")),
            "match_count": len(use_items),
            "items": use_items,
        },
        "selection": pp.get("selection"),
        "documentsMeta": {
            "selectedPathCount": (_as_dict(pp.get("documentsMeta")) or {}).get(
                "selectedPathCount"
            ),
        },
    }
    if primary == "handover" and not use_items and items and _ENTITY_RE.search(m):
        sliced["empty_hint"] = "질문에 해당하는 인수인계 행이 화면에 없습니다."
    return sliced


def _page_payload_empty(pp: dict[str, Any]) -> bool:
    if not pp:
        return True
    return not any(v not in (None, "", [], {}) for v in pp.values())


def _page_summary_slice(pp: dict[str, Any], route: str) -> dict[str, Any]:
    """Current-route tables only; do not token-filter rows (chip tokens would empty lists)."""
    label = route_label(route)
    if _page_payload_empty(pp):
        return {
            "primary_table": "page_summary",
            "page": label,
            "empty_hint": f"{label} 화면 데이터가 아직 없습니다.",
        }
    if "/dashboard" in route:
        risk = pp.get("lotRisks") if isinstance(pp.get("lotRisks"), dict) else {}
        items = list(risk.get("items") or [])[:_LIST_LIMIT]
        total = risk.get("total")
        out: dict[str, Any] = {
            "primary_table": "lotRisks",
            "page": label,
            "lotRisks": {
                "total": total,
                "page": risk.get("page"),
                "filter": risk.get("filter"),
                "match_count": len(items),
                "items": items,
            },
            "selectedLot": pp.get("selectedLot"),
        }
        if total == 0:
            out["empty_hint"] = "위험 LOT가 0건입니다."
        elif not items:
            out["empty_hint"] = "화면에 표시된 위험 LOT 행이 없습니다."
        return out
    if "/main" in route:
        risk = pp.get("riskTop") if isinstance(pp.get("riskTop"), dict) else {}
        lots = list(risk.get("lots") or risk.get("items") or [])[:_LIST_LIMIT]
        return {
            "primary_table": "page_summary",
            "page": label,
            "riskTop": {
                "total": risk.get("total"),
                "page": risk.get("page"),
                "items": lots,
            },
            "dailyKpi": pp.get("dailyKpi") or pp.get("summaryKpis"),
            "qCost": pp.get("qCost") or pp.get("q_cost"),
        }
    if "/issue" in route:
        raw_issues = pp.get("issues")
        if isinstance(raw_issues, dict):
            items = list(raw_issues.get("items") or raw_issues.get("issues") or [])
            total = raw_issues.get("total", pp.get("totalOpen"))
        elif isinstance(raw_issues, list):
            items = list(raw_issues)
            total = pp.get("totalOpen")
        else:
            items = []
            total = pp.get("totalOpen")
        use_items = items[:_LIST_LIMIT]
        out = {
            "primary_table": "issues",
            "page": pp.get("page"),
            "filters": pp.get("filters"),
            "totalOpen": total,
            "issues": {
                "total": total,
                "match_count": len(use_items),
                "items": use_items,
            },
            "selected": pp.get("selected"),
        }
        if total == 0:
            out["empty_hint"] = "열린 이슈가 0건입니다."
        elif not items:
            out["empty_hint"] = "화면에 표시된 이슈 행이 없습니다."
        return out
    if "/knowledge" in route:
        ho = _as_dict(pp.get("handover")) or {}
        past = _as_dict(pp.get("pastIssues")) or {}
        return {
            "primary_table": "both",
            "page": label,
            "activeTab": pp.get("activeTab"),
            "filters": pp.get("filters"),
            "pastIssues": {
                "total": past.get("total"),
                "filteredTotal": past.get("filteredTotal", past.get("total")),
                "items": list(past.get("items") or [])[:_LIST_LIMIT],
            },
            "handover": {
                "total": ho.get("total"),
                "filteredTotal": ho.get("filteredTotal", ho.get("total")),
                "items": list(ho.get("items") or [])[:_LIST_LIMIT],
            },
            "documentsMeta": pp.get("documentsMeta"),
            "selection": pp.get("selection"),
        }
    if "/inquiry" in route:
        return {
            "primary_table": "inquiry",
            "page": pp.get("page") or "inquiry",
            "filters": pp.get("filters"),
            "total": pp.get("total"),
            "filteredTotal": pp.get("filteredTotal"),
            "displayLabel": pp.get("displayLabel"),
            "items": (pp.get("items") or [])[:10],
            "selection": pp.get("selection"),
        }
    if "/setting" in route:
        return {
            "primary_table": "setting",
            "page": "setting",
            "fontSize": pp.get("fontSize"),
            "themeMode": pp.get("themeMode"),
            "autoRefreshEnabled": pp.get("autoRefreshEnabled"),
            "refreshIntervalMinutes": pp.get("refreshIntervalMinutes"),
            "n8nAlertEnabled": pp.get("n8nAlertEnabled"),
            "sections": pp.get("sections"),
            "llmApiKeysNote": pp.get("llmApiKeysNote"),
        }
    if "/management" in route:
        return {
            "primary_table": "spc",
            "page": pp.get("page") or "spc",
            "panels": pp.get("panels"),
            "dateRange": pp.get("dateRange"),
            "expandedPanel": pp.get("expandedPanel"),
            "note": pp.get("note"),
            "uiNote": pp.get("uiNote"),
        }
    return {
        "primary_table": "page_summary",
        "page": label,
        **pp,
    }


def _entity_offpage_slice(
    route: str,
    focus: Any,
    focus_id: Any,
    ents: set[str],
) -> dict[str, Any]:
    """LOT/ISS question on a screen with no LOT table — drop setting/inquiry UI."""
    sliced: dict[str, Any] = {
        "primary_table": "entity",
        "page": route_label(route),
    }
    if _focus_matches_entities(focus, focus_id, ents):
        sliced["matched_entity"] = True
    return sliced


def slice_page_context_for_query(
    message: str,
    page_context: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Keep the current page lists and last event; slim only off-screen asks."""
    if not page_context:
        return None
    out = dict(page_context)
    supplement = out.get("supplement")
    route = str(out.get("route") or "").lower()
    pp = _keep_route_tables(dict(_page_payload(out)), route)
    last_ev = _last_event(out)
    out.pop("lastEvent", None)
    if last_ev is not None:
        out["last_event"] = last_ev
    elif "last_event" in out and not isinstance(out.get("last_event"), dict):
        out.pop("last_event", None)
    m = message or ""
    full = wants_full_detail(m)
    visible = visible_ui_for_route(route, pp)
    off_hint = offscreen_question_hint(m, route, visible)

    # Off-screen ask (e.g. 문의 on /knowledge): do not invent inquiry rows
    if off_hint:
        out["focus_payload"] = None
        out.pop("focusPayload", None)
        out.pop("focus_id", None)
        out.pop("focusId", None)
        out["page_payload"] = {
            "primary_table": "offscreen",
            "page": pp.get("page") or route_label(route),
            "visible_ui": visible,
            "activeTab": pp.get("activeTab"),
            "filters": pp.get("filters"),
            "pastIssues": {
                "total": (_as_dict(pp.get("pastIssues")) or {}).get("total"),
                "filteredTotal": (_as_dict(pp.get("pastIssues")) or {}).get(
                    "filteredTotal"
                ),
            },
            "handover": {
                "total": (_as_dict(pp.get("handover")) or {}).get("total"),
                "filteredTotal": (_as_dict(pp.get("handover")) or {}).get(
                    "filteredTotal"
                ),
            },
            "empty_hint": off_hint,
        }
        out.pop("pagePayload", None)
        out["supplement"] = supplement if isinstance(supplement, dict) else None
        return out

    if should_prefer_focus(m, out):
        focus = out.get("focus_payload") or out.get("focusPayload")
        focus_id = out.get("focus_id") or out.get("focusId")
        slim = _slim_focus_payload(focus, full)
        out["focus_payload"] = slim
        out.pop("focusPayload", None)
        lot_id = _focus_lot_id(slim, focus_id)
        empty_hint = None
        primary = "focus"
        deterministic = False
        # 「지금 로트 / 이거 뭐야」→ DB 필드 공백 요약 (LLM 스킵)
        if wants_focus_identity_summary(m):
            empty_hint = build_spaced_focus_summary(slim, focus_id, route)
            primary = "focus_summary"
            deterministic = True
        # SPC/그래프 질문 + 선택 LOT에 그래프 없음 → 확정 안내
        elif _SPC_RE.search(m) and focus_spc_graph_absent(slim):
            empty_hint = focus_spc_absent_hint(slim, focus_id)
            primary = "focus_spc_absent"
            deterministic = True
        merged = dict(pp)
        merged["primary_table"] = primary
        merged["page"] = pp.get("page") or route_label(route)
        merged["selectedLotId"] = lot_id
        merged["deterministic"] = deterministic
        if empty_hint:
            merged["empty_hint"] = empty_hint
        merged.pop("list_omitted", None)
        merged["note"] = "Focused UI selection — page list kept with last event."
        out["page_payload"] = _keep_route_tables(merged, route)
        out.pop("pagePayload", None)
        out["supplement"] = supplement if isinstance(supplement, dict) else None
        if last_ev is not None:
            out["last_event"] = last_ev
        return out

    if is_page_summary_intent(m):
        sliced = _page_summary_slice(pp, route)
        out["page_payload"] = _keep_route_tables(sliced, route)
        out.pop("pagePayload", None)
        out["supplement"] = supplement if isinstance(supplement, dict) else None
        if last_ev is not None:
            out["last_event"] = last_ev
        return out

    ents = message_lot_issue_ids(m)
    if ents and route_without_lot_table(route):
        focus = out.get("focus_payload") or out.get("focusPayload")
        focus_id = out.get("focus_id") or out.get("focusId")
        sliced = _entity_offpage_slice(route, focus, focus_id, ents)
        if not _focus_matches_entities(focus, focus_id, ents):
            out["focus_payload"] = None
            out.pop("focusPayload", None)
            out.pop("focus_id", None)
            out.pop("focusId", None)
        out["page_payload"] = sliced
        out.pop("pagePayload", None)
        out["supplement"] = supplement if isinstance(supplement, dict) else None
        if last_ev is not None:
            out["last_event"] = last_ev
        return out

    primary = "all"
    if "/knowledge" in route:
        want_ho = bool(_HANDOVER_RE.search(m))
        want_past = bool(_PAST_RE.search(m) or re.search(r"ISS-", m, re.I))
        want_doc = bool(_DOC_RE.search(m))
        countish = bool(re.search(r"\d+\s*건|몇\s*건|건수|필터|날짜|\d{1,2}\s*일", m))
        if want_ho and not want_past:
            primary = "handover"
        elif want_past and not want_ho:
            primary = "pastIssues"
        elif want_doc:
            primary = "documents"
        elif countish or (not want_ho and not want_past and not want_doc):
            # Keep both table counts/rows as shown on UI (filter-aware)
            primary = "both"
        else:
            primary = "both"

    if primary == "both" and "/knowledge" in route:
        ho = _as_dict(pp.get("handover")) or {}
        past = _as_dict(pp.get("pastIssues")) or {}
        ho_items = list(ho.get("items") or [])[:_LIST_LIMIT]
        past_items = list(past.get("items") or [])[:_LIST_LIMIT]
        # Date token soft-filter when present
        day_m = re.search(r"(\d{1,2})\s*일", m)
        if day_m:
            day = day_m.group(1).zfill(2)

            def _day_match(row: Any) -> bool:
                blob = json.dumps(row, ensure_ascii=False, default=str)
                return f"-{day}" in blob or f".{day}" in blob or f"/{day}" in blob

            ho_f = [x for x in ho_items if _day_match(x)]
            past_f = [x for x in past_items if _day_match(x)]
            if ho_f or past_f:
                ho_items, past_items = ho_f or [], past_f or []
        pp = {
            "activeTab": pp.get("activeTab"),
            "filters": pp.get("filters"),
            "primary_table": "both",
            "pastIssues": {
                "total": past.get("total"),
                "filteredTotal": past.get("filteredTotal", past.get("total")),
                "items": past_items,
            },
            "handover": {
                "total": ho.get("total"),
                "filteredTotal": ho.get("filteredTotal", ho.get("total")),
                "items": ho_items,
            },
            "documentsMeta": pp.get("documentsMeta"),
            "selection": pp.get("selection"),
            "empty_hint": (
                "해당 날짜·필터에 맞는 화면 행이 없습니다."
                if day_m and not ho_items and not past_items
                else None
            ),
        }
    elif primary == "handover":
        pp = _handover_slice(pp, m, primary)
    elif primary == "pastIssues":
        past = _as_dict(pp.get("pastIssues")) or {}
        items = list(past.get("items") or [])
        filtered = _filter_items_by_query(items, m)
        use_items = filtered if filtered else (items[:_LIST_LIMIT] if not _ENTITY_RE.search(m) else [])
        pp = {
            "primary_table": "pastIssues",
            "filters": pp.get("filters"),
            "pastIssues": {
                "total": past.get("total"),
                "filteredTotal": past.get("filteredTotal", past.get("total")),
                "match_count": len(use_items),
                "items": use_items,
            },
            "empty_hint": (
                "해당 이슈가 목록에 없습니다."
                if _ENTITY_RE.search(m) and not use_items
                else None
            ),
        }
    elif primary == "documents":
        pp = {
            "primary_table": "documents",
            "documentsMeta": pp.get("documentsMeta"),
            "selection": pp.get("selection"),
        }
    elif "/inquiry" in route:
        pp = {
            "primary_table": "inquiry",
            "page": pp.get("page") or "inquiry",
            "filters": pp.get("filters"),
            "total": pp.get("total"),
            "filteredTotal": pp.get("filteredTotal"),
            "displayLabel": pp.get("displayLabel"),
            "items": (pp.get("items") or [])[:10],
            "selection": pp.get("selection"),
        }
    elif "/setting" in route:
        pp = {
            "primary_table": "setting",
            "page": "setting",
            "fontSize": pp.get("fontSize"),
            "themeMode": pp.get("themeMode"),
            "autoRefreshEnabled": pp.get("autoRefreshEnabled"),
            "refreshIntervalMinutes": pp.get("refreshIntervalMinutes"),
            "n8nAlertEnabled": pp.get("n8nAlertEnabled"),
            "sections": pp.get("sections"),
            "llmApiKeysNote": pp.get("llmApiKeysNote"),
        }
    elif "/management" in route:
        pp = {
            "primary_table": "spc",
            "page": pp.get("page") or "spc",
            "panels": pp.get("panels"),
            "dateRange": pp.get("dateRange"),
            "expandedPanel": pp.get("expandedPanel"),
            "note": pp.get("note"),
            "uiNote": pp.get("uiNote"),
        }
    elif "/dashboard" in route:
        risk = pp.get("lotRisks") if isinstance(pp.get("lotRisks"), dict) else {}
        items = list(risk.get("items") or [])
        filtered = _filter_items_by_query(items, m) if _LOT_RE.search(m) else items[:_LIST_LIMIT]
        use_items = filtered if filtered else items[:_LIST_LIMIT]
        total = risk.get("total")
        pp = {
            "primary_table": "lotRisks",
            "lotRisks": {
                "total": total,
                "page": risk.get("page"),
                "filter": risk.get("filter"),
                "match_count": len(use_items),
                "items": use_items,
            },
            "selectedLot": pp.get("selectedLot"),
        }
        if total == 0:
            pp["empty_hint"] = "위험 LOT가 0건입니다."
        elif not items:
            pp["empty_hint"] = "화면에 표시된 위험 LOT 행이 없습니다."
    elif "/main" in route:
        if re.search(r"Q-?\s*COST|큐코스트|평가\s*비용|예방\s*비용", m, re.I):
            pp = {
                "primary_table": "qCost",
                "qCost": pp.get("qCost") or pp.get("q_cost"),
                "dailyKpi": pp.get("dailyKpi"),
            }
        elif _KPI_RE.search(m) and not _LOT_RE.search(m):
            pp = {
                "primary_table": "dailyKpi",
                "dailyKpi": pp.get("dailyKpi") or pp.get("summaryKpis"),
            }
        elif _LOT_RE.search(m):
            risk = pp.get("riskTop") if isinstance(pp.get("riskTop"), dict) else {}
            items = list(risk.get("lots") or risk.get("items") or [])
            filtered = _filter_items_by_query(items, m)
            use_items = filtered if filtered else items[:_LIST_LIMIT]
            total = risk.get("total")
            pp = {
                "primary_table": "riskTop",
                "riskTop": {
                    "total": total,
                    "page": risk.get("page"),
                    "match_count": len(use_items),
                    "items": use_items,
                },
            }
            if total == 0:
                pp["empty_hint"] = "위험 LOT가 0건입니다."
            elif not items:
                pp["empty_hint"] = "화면에 표시된 위험 LOT 행이 없습니다."
    elif "/issue" in route:
        raw_issues = pp.get("issues")
        if isinstance(raw_issues, dict):
            items = list(raw_issues.get("items") or raw_issues.get("issues") or [])
            total = raw_issues.get("total", pp.get("totalOpen"))
        elif isinstance(raw_issues, list):
            items = list(raw_issues)
            total = pp.get("totalOpen")
        else:
            items = []
            total = pp.get("totalOpen")
        filtered = _filter_items_by_query(items, m)
        use_items = filtered if filtered else items[:_LIST_LIMIT]
        pp = {
            "primary_table": "issues",
            "filters": pp.get("filters"),
            "page": pp.get("page"),
            "totalOpen": total,
            "issues": {
                "total": total,
                "match_count": len(use_items),
                "items": use_items,
            },
            "selected": pp.get("selected"),
        }
        if total == 0:
            pp["empty_hint"] = "열린 이슈가 0건입니다."
        elif not items:
            pp["empty_hint"] = "화면에 표시된 이슈 행이 없습니다."

    out["page_payload"] = _keep_route_tables(pp if isinstance(pp, dict) else {}, route)
    out.pop("pagePayload", None)
    out["supplement"] = supplement if isinstance(supplement, dict) else None
    return out


def build_grounding(
    message: str,
    page_context: dict[str, Any] | None,
    predict_result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Explicit allow-list for metrics the model may cite."""
    pc = page_context or {}
    route = str(pc.get("route") or "")
    pp = _keep_route_tables(_page_payload(pc), route)
    focus = pc.get("focus_payload") or pc.get("focusPayload")
    supplement = pc.get("supplement") if isinstance(pc.get("supplement"), dict) else None
    allowed: list[str] = []
    empty_hint = pp.get("empty_hint") if isinstance(pp, dict) else None
    analyzing = analysis_mode(message)
    visible = visible_ui_for_route(route, pp if isinstance(pp, dict) else None)
    off_hint = offscreen_question_hint(message, route, visible)
    if off_hint and not supplement:
        empty_hint = off_hint
    if supplement:
        empty_hint = None

    def add_keys(obj: Any, prefix: str = "") -> None:
        if not isinstance(obj, dict):
            return
        for k, v in obj.items():
            if v is None:
                continue
            if isinstance(v, (int, float, str)) and k not in (
                "note",
                "empty_hint",
                "primary_table",
                "llmApiKeysNote",
            ):
                allowed.append(f"{prefix}{k}={v}" if prefix else f"{k}")
            elif isinstance(v, list) and v and isinstance(v[0], dict):
                for i, row in enumerate(v[:5]):
                    if isinstance(row, dict):
                        for rk in (
                            "lotId",
                            "id",
                            "issueId",
                            "status",
                            "risk",
                            "riskLevel",
                            "defectProb",
                            "riskScore",
                            "title",
                            "handoverContent",
                            "category",
                            "visibility",
                            "date",
                            "filteredTotal",
                        ):
                            if row.get(rk) is not None:
                                allowed.append(f"{prefix}items[{i}].{rk}")

    add_keys(focus, "focus.")
    add_keys(pp)
    add_keys(supplement, "tool.")
    if predict_result:
        allowed.append("predict.probability")
        allowed.append("predict.defect_status")

    if isinstance(pp.get("riskTop"), dict) and pp["riskTop"].get("total") == 0:
        empty_hint = (
            empty_hint
            or "위험 LOT가 0건입니다. 화면에 있는 건수만 말씀드립니다."
        )
    if isinstance(pp.get("lotRisks"), dict) and pp["lotRisks"].get("total") == 0:
        empty_hint = (
            empty_hint
            or "위험 LOT가 0건입니다. 화면에 있는 건수만 말씀드립니다."
        )

    analysis_hint = None
    if supplement:
        analysis_hint = (
            "인증된 읽기 전용 도구 결과입니다. 조회 결과, 판단 근거, 권장 확인 순서로 답하고 "
            "데이터를 변경했다고 표현하지 마세요."
        )
    elif is_lot_why_intent(message):
        analysis_hint = (
            "해당 LOT의 page_payload/focus 필드와 rag_sources로 원인을 설명하세요. "
            "폰트·테마·새로고침·n8n은 말하지 마세요."
        )
    elif analyzing:
        analysis_hint = (
            "건수·필터·빈 칸(No data)·위험 순서를 2~5문장으로 풀어 주세요."
        )

    return {
        "must_match_route": route or "/",
        "route_label": route_label(route),
        "visible_ui": visible,
        "analysis_mode": analyzing,
        "analysis_hint": analysis_hint,
        "read_tool": {
            "tool": supplement.get("tool"),
            "category": supplement.get("category"),
            "scope": supplement.get("scope"),
            "response_contract": supplement.get("responseContract"),
        }
        if supplement
        else None,
        "allowed_metric_keys": allowed[:80],
        "empty_answer_hint": empty_hint,
        "last_event": _last_event(pc),
    }

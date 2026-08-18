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
# Hangul ↔ non-Hangul (latin, digit, paren, special). Decimal 8.3 stays intact.
# Comma/semicolon handled separately (space after, not before).
_NON_HANGUL_CHAR = (
    r"A-Za-z0-9"
    r"%#@&*/\\|_+=<>\[\]{}()（）「」『』·•…$€¥£!?"
    r"\"'`~^"
)
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
    - Newline only after '다.' or '요.' (not every period)
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

    # Newline only after 다. / 요.
    raw = re.sub(r"(다\.|요\.)(?!\n)", r"\1\n", raw)
    raw = re.sub(r"\n{3,}", "\n\n", raw)

    # Deduplicate lines (after 다./요. breaks)
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
    return "\n".join(out)


def analysis_mode(message: str) -> bool:
    return bool(_ANALYSIS_RE.search(message or ""))


def route_label(route: str) -> str:
    r = (route or "").lower()
    for key, label in _ROUTE_PAGE.items():
        if key in r:
            return label
    return "unknown"


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


def _page_payload(page_context: dict[str, Any] | None) -> dict[str, Any]:
    if not page_context:
        return {}
    pp = page_context.get("page_payload") or page_context.get("pagePayload")
    return pp if isinstance(pp, dict) else {}


def detect_topic_shift(
    message: str,
    history_text: str | None,
    page_context: dict[str, Any] | None,
) -> bool:
    """True when current question should not reuse prior page facts."""
    m = (message or "").strip()
    if not m:
        return False
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


def slice_page_context_for_query(
    message: str,
    page_context: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Keep only the table/section relevant to the question."""
    if not page_context:
        return None
    out = dict(page_context)
    route = str(out.get("route") or "").lower()
    pp = dict(_page_payload(out))
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
        out["supplement"] = None
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
        out["page_payload"] = {
            "primary_table": primary,
            "page": pp.get("page") or route_label(route),
            "selectedLotId": lot_id,
            "filters": pp.get("filters"),
            "total": pp.get("total") or pp.get("filteredTotal"),
            "filteredTotal": pp.get("filteredTotal"),
            "displayLabel": pp.get("displayLabel"),
            "dateRange": pp.get("dateRange"),
            "activeTab": pp.get("activeTab"),
            "list_omitted": True,
            "deterministic": deterministic,
            "empty_hint": empty_hint,
            "note": "Focused UI selection — answer that entity unless user asks about the whole list.",
        }
        out.pop("pagePayload", None)
        out["supplement"] = None
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
    elif "/main" in route or "/dashboard" in route:
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
            risk = pp.get("riskTop") or pp.get("lotRisks")
            if isinstance(risk, dict):
                items = list(risk.get("lots") or risk.get("items") or [])
                filtered = _filter_items_by_query(items, m)
                total = risk.get("total")
                pp = {
                    "primary_table": "riskTop",
                    "riskTop": {
                        "total": total,
                        "match_count": len(filtered) if filtered else len(items[:_LIST_LIMIT]),
                        "items": filtered if filtered else items[:_LIST_LIMIT],
                    },
                }
                if total == 0 or (isinstance(total, int) and total == 0):
                    pp["empty_hint"] = (
                        "위험 LOT가 0건입니다. 불량확률·잔류리튬 수치를 만들지 마세요."
                    )
                elif not items and not filtered:
                    pp["empty_hint"] = (
                        "화면에 표시된 위험 LOT 행이 없습니다. 수치를 창작하지 마세요."
                    )

    out["page_payload"] = pp
    out.pop("pagePayload", None)
    # Never keep foreign supplement on these routes
    if any(x in route for x in ("/knowledge", "/inquiry", "/setting", "/management")):
        if not (_LOT_RE.search(m) and "/main" in route):
            out["supplement"] = None
    return out


def build_grounding(
    message: str,
    page_context: dict[str, Any] | None,
    predict_result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Explicit allow-list for metrics the model may cite."""
    pc = page_context or {}
    pp = _page_payload(pc)
    focus = pc.get("focus_payload") or pc.get("focusPayload")
    route = str(pc.get("route") or "")
    allowed: list[str] = []
    empty_hint = pp.get("empty_hint") if isinstance(pp, dict) else None
    analyzing = analysis_mode(message)
    visible = visible_ui_for_route(route, pp if isinstance(pp, dict) else None)
    off_hint = offscreen_question_hint(message, route, visible)
    if off_hint:
        empty_hint = off_hint

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
    if predict_result:
        allowed.append("predict.probability")
        allowed.append("predict.defect_status")

    if isinstance(pp.get("riskTop"), dict) and pp["riskTop"].get("total") == 0:
        empty_hint = (
            empty_hint
            or "위험 LOT 0건 — 불량확률·잔류리튬·규격 여유 ppm을 절대 만들지 마세요."
        )

    analysis_hint = None
    if analyzing:
        analysis_hint = (
            "행을 단순 나열하지 말고, 건수·필터·빈 데이터(No data)·위험 우선순위를 "
            "해석해 2~5문장으로 분석하세요."
        )

    return {
        "must_match_route": route or "/",
        "route_label": route_label(route),
        "visible_ui": visible,
        "analysis_mode": analyzing,
        "analysis_hint": analysis_hint,
        "allowed_metric_keys": allowed[:80],
        "empty_answer_hint": empty_hint,
        "rules": [
            "visible_ui에 없는 탭·메뉴·버튼·건수를 만들지 마세요.",
            "없는 탭이 활성화되어 있다고 말하지 마세요.",
            "다른 페이지가 필요하면 경로만 한 문장으로 안내하고 그 페이지 데이터는 꾸며내지 마세요.",
            "must_match_route와 다른 페이지명을 단정하지 마세요.",
            "allowed_metric_keys·page_payload에 없는 숫자·LOT·ISS ID를 만들지 마세요.",
            "empty_answer_hint가 있으면 그 내용을 최우선 근거로 쓰세요.",
            "사용자에게 「현재 화면은 ○○만 보입니다」라고 말하지 마세요.",
            "이 규칙 문장 자체를 사용자 답에 출력하지 마세요.",
            "이전 대화의 LOT/%/인수인계를 현재 page_context와 무관하면 재인용하지 마세요.",
            "한국어 띄어쓰기와 줄바꿈을 지키세요. 같은 문장을 반복하지 마세요.",
            analysis_hint or "질문에 맞게 요약·분석하세요.",
        ],
    }

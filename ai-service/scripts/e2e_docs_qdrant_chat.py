"""Full local E2E: Qdrant · RAG · security-chat · general chat · watcher OCR drop."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[1]
REPO = AI_ROOT.parent
sys.path.insert(0, str(AI_ROOT))

from dotenv import load_dotenv

load_dotenv(REPO / ".env", override=False)

os.environ.setdefault(
    "TESSERACT_CMD",
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
)
os.environ.pop("TESSDATA_PREFIX", None)

RESULTS: list[tuple[str, bool, str]] = []


def ok(name: str, passed: bool, detail: str = "") -> None:
    RESULTS.append((name, passed, detail))
    mark = "PASS" if passed else "FAIL"
    print(f"[{mark}] {name}: {detail}")


def http_json(method: str, url: str, body: dict | None = None, timeout: float = 180.0):
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        raw = res.read().decode("utf-8", errors="replace")
        return res.status, json.loads(raw) if raw else {}


def main() -> int:
    print("=== E2E start ===")

    # 1) Qdrant
    try:
        code, _ = http_json("GET", "http://127.0.0.1:6333/readyz", timeout=5)
        # readyz may return plain text
        ok("qdrant_readyz", True, f"status={code}")
    except Exception as exc:
        try:
            req = urllib.request.Request("http://127.0.0.1:6333/readyz")
            with urllib.request.urlopen(req, timeout=5) as res:
                body = res.read().decode("utf-8", errors="replace")[:80]
                ok("qdrant_readyz", res.status < 400, body)
        except Exception as exc2:
            ok("qdrant_readyz", False, str(exc2))

    # 2) ai health
    try:
        st, j = http_json("GET", "http://127.0.0.1:8800/health", timeout=10)
        ok("ai_health", st == 200 and j.get("status") == "ok", str(j)[:200])
    except Exception as exc:
        ok("ai_health", False, str(exc))

    # 3) backend health
    try:
        req = urllib.request.Request("http://127.0.0.1:3001/api/health")
        with urllib.request.urlopen(req, timeout=10) as res:
            ok("backend_health", res.status == 200, f"status={res.status}")
    except Exception as exc:
        ok("backend_health", False, str(exc))

    # 4) RAG retrieve OCR sidecar
    try:
        from agent.rag_engine import get_engine

        eng = get_engine()
        eng.ensure()
        hits = eng.retrieve(
            "Capacity Distribution Quality Defect",
            top_k=6,
            rerank_top_n=3,
            allowed_clearances=["Confidential"],
        )
        titles = [str(h.get("title") or "") for h in hits]
        found = any("Capacity" in t for t in titles)
        ok(
            "rag_retrieve_ocr_md",
            found and eng.ready,
            f"ready={eng.ready} n={len(hits)} titles={titles[:3]}",
        )
    except Exception as exc:
        ok("rag_retrieve_ocr_md", False, str(exc))

    # 5) text_match rows
    try:
        from agent import text_match_store

        row = text_match_store.get_by_source(
            "Documents/Confidential/Capacity에 따른 불량률.png"
        )
        ok(
            "text_match_capacity",
            bool(row and row.get("status") == "ready" and row.get("md_path")),
            str({k: row.get(k) for k in ("md_path", "status", "extract_method")})
            if row
            else "none",
        )
    except Exception as exc:
        ok("text_match_capacity", False, str(exc))

    # 6) security-chat via backend proxy (RAG path)
    try:
        st, j = http_json(
            "POST",
            "http://127.0.0.1:3001/api/security-chat",
            {
                "message": "Capacity에 따른 불량률 그래프에서 무엇을 알 수 있어?",
                "user_id": "e2e-tester",
            },
            timeout=180,
        )
        reply = (j.get("reply") or "")[:240]
        sources = j.get("sources") or []
        mode = j.get("mode")
        # Pass if we got a reply with sources OR extractive content mentioning capacity/불량
        blob = (reply + " " + json.dumps(sources, ensure_ascii=False)).lower()
        hit = ("capacity" in blob) or ("불량" in blob) or ("리튬" in blob) or len(sources) > 0
        ok(
            "security_chat_proxy",
            st == 200 and bool(reply) and hit,
            f"mode={mode} n_sources={len(sources)} reply={reply!r}",
        )
    except Exception as exc:
        ok("security_chat_proxy", False, str(exc))

    # 7) general chat via backend (page context grounding)
    try:
        st, j = http_json(
            "POST",
            "http://127.0.0.1:3001/api/chat",
            {
                "message": "이 화면에 위험 LOT이 몇 건이야?",
                "user_id": "e2e-tester",
                "page_context": {
                    "route": "/main",
                    "page_payload": {
                        "riskTop": [
                            {"lotId": "LOT-E2E-1", "grade": "위험"},
                            {"lotId": "LOT-E2E-2", "grade": "주의"},
                        ],
                        "visibleTables": ["위험LOT", "일일KPI"],
                    },
                    "supplement_hints": ["risk-top"],
                },
            },
            timeout=120,
        )
        reply = (j.get("reply") or "")[:300]
        # Expect grounding to mention 2 or risk lots — not invent offscreen stuff only
        low = reply.lower()
        grounded = (
            ("2" in reply)
            or ("두" in reply)
            or ("위험" in reply)
            or ("lot-e2e" in low)
            or ("lot" in low)
        )
        ok(
            "general_chat_page_context",
            st == 200 and bool(reply) and grounded,
            f"mode={j.get('mode')} provider={j.get('provider')} reply={reply!r}",
        )
    except Exception as exc:
        ok("general_chat_page_context", False, str(exc))

    # 8) Watcher OCR: drop a new PNG under Confidential
    try:
        from PIL import Image, ImageDraw

        from agent.document_convert import convert_file_to_md
        from agent.rag_engine import SECURE_DOCS_DIR

        docs = SECURE_DOCS_DIR
        conf = docs / "Confidential"
        conf.mkdir(parents=True, exist_ok=True)
        test_png = conf / "_e2e_ocr_probe.png"
        img = Image.new("RGB", (480, 120), color=(255, 255, 255))
        draw = ImageDraw.Draw(img)
        draw.text((20, 40), "E2E OCR PROBE KDT-9917", fill=(0, 0, 0))
        img.save(test_png)

        # Direct convert (same code path as watcher) — then optionally wait for watcher
        result = convert_file_to_md(
            test_png, secure_docs_dir=docs, repo_root=REPO
        )
        md_ok = result.kind == "ocr_md" and result.md_path and result.md_path.is_file()
        body = ""
        if result.md_path and result.md_path.is_file():
            body = result.md_path.read_text(encoding="utf-8", errors="replace")
        has_text = "E2E" in body or "9917" in body or "OCR" in body or "PROBE" in body
        from agent import text_match_store

        rel = "Documents/Confidential/_e2e_ocr_probe.png"
        row = text_match_store.get_by_source(rel)
        ok(
            "ocr_convert_new_png",
            md_ok and has_text and bool(row and row.get("status") == "ready"),
            f"kind={result.kind} detail={result.detail} md={result.md_path} "
            f"has_text={has_text} text_match={bool(row)} snippet={body[200:320]!r}",
        )

        # Cleanup probe artifacts (keep DB row deleted)
        try:
            if result.md_path and result.md_path.is_file():
                result.md_path.unlink()
            if test_png.is_file():
                test_png.unlink()
            text_match_store.delete_by_source(rel)
        except OSError:
            pass
    except Exception as exc:
        ok("ocr_convert_new_png", False, str(exc))

    # 9) Watcher process alive? (backend-spawned)
    try:
        import subprocess

        # Windows: look for run_document_watcher.py in process list
        out = subprocess.check_output(
            ["powershell", "-NoProfile", "-Command",
             "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'run_document_watcher' } | Select-Object -ExpandProperty ProcessId"],
            text=True,
            timeout=15,
        )
        pids = [p.strip() for p in out.splitlines() if p.strip()]
        ok("doc_watcher_process", len(pids) > 0, f"pids={pids}")
    except Exception as exc:
        ok("doc_watcher_process", False, str(exc))

    print("\n=== SUMMARY ===")
    failed = [n for n, p, _ in RESULTS if not p]
    for n, p, d in RESULTS:
        print(f"{'PASS' if p else 'FAIL'}\t{n}\t{d[:160]}")
    print(f"total={len(RESULTS)} pass={len(RESULTS)-len(failed)} fail={len(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

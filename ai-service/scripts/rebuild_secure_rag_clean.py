"""Remove legacy full-table CSV MDs; keep SOP + *-profile.md; full ingest.

Usage (from ai-service/):
  python scripts/rebuild_secure_rag_clean.py
"""
from __future__ import annotations

import sys
from pathlib import Path

AI = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI))

from agent.rag_engine import SECURE_DOCS_DIR  # noqa: E402
from ingest_secure import run_ingest  # noqa: E402

CONV = SECURE_DOCS_DIR / "ai-service"
LEGACY_KEYS = (
    "cathode_clf",
    "cathode_reg",
    "cathode_ts",
    "cathode_qc",
    "기상청",
    "기상",
)


def main() -> int:
    if CONV.is_dir():
        for p in list(CONV.glob("*.md")):
            name = p.name.lower()
            if name.endswith("-profile.md"):
                print("keep", p.name)
                continue
            if any(k in name for k in LEGACY_KEYS) and "profile" not in name:
                p.unlink()
                print("deleted", p.name)
            else:
                print("keep", p.name)
    else:
        print("no converted dir", CONV)
    return int(run_ingest() or 0)


if __name__ == "__main__":
    raise SystemExit(main())

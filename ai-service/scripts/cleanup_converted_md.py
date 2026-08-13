"""
One-shot cleanup for Documents OCR / text_match policy (plan B).

- Keep originals (PDF/TXT/images).
- Delete Markdown sidecars with category:converted / converted_from when the
  source still has enough *native* text (no OCR pair needed).
- For remaining empty-native sources (scan PDF / images), re-run convert (OCR)
  and upsert text_match.
- Does NOT run ingest — print a reminder to run ingest_secure.py after.

Usage (from ai-service/):
  python scripts/cleanup_converted_md.py
  python scripts/cleanup_converted_md.py --dry-run
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(REPO / ".env", override=False)

from agent.doc_clearance import CLEARANCES, MARKDOWN_DIR_NAME, markdown_dir  # noqa: E402
from agent.document_convert import (  # noqa: E402
    convert_file_to_md,
    has_extractable_text,
    IMAGE_SUFFIXES,
    NATIVE_SUFFIXES,
)
from agent.rag_engine import SECURE_DOCS_DIR  # noqa: E402

_FM = re.compile(r"^---\s*\n(.*?)\n---\s*\n?", re.DOTALL)


def _parse_frontmatter(text: str) -> dict[str, str]:
    m = _FM.match(text)
    if not m:
        return {}
    meta: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        meta[k.strip()] = v.strip().strip("\"'")
    return meta


def _is_converted_md(meta: dict[str, str]) -> bool:
    if (meta.get("category") or "").lower() == "converted":
        return True
    if meta.get("converted_from"):
        return True
    return False


def _resolve_source(meta: dict[str, str], repo_root: Path, md_path: Path) -> Path | None:
    sp = (meta.get("source_path") or "").strip()
    if sp:
        cand = repo_root / sp
        if cand.is_file():
            return cand
    # Fallback: same stem outside Markdown/
    stem = md_path.stem
    clearance_root = md_path.parent
    while clearance_root.name == MARKDOWN_DIR_NAME:
        clearance_root = clearance_root.parent
    for suf in sorted(NATIVE_SUFFIXES | IMAGE_SUFFIXES):
        cand = clearance_root / f"{stem}{suf}"
        if cand.is_file():
            return cand
        for p in clearance_root.rglob(f"{stem}{suf}"):
            if MARKDOWN_DIR_NAME in p.parts:
                continue
            if p.is_file():
                return p
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description="Cleanup converted MD + OCR backfill")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--docs-dir",
        type=Path,
        default=None,
        help="Override SECURE_DOCS_DIR",
    )
    args = ap.parse_args()
    docs = args.docs_dir or SECURE_DOCS_DIR
    repo_root = docs.parent if docs.name == "Documents" else REPO

    deleted = 0
    ocr_ok = 0
    kept = 0
    skipped = 0

    print(f"docs={docs} dry_run={args.dry_run}")

    for c in CLEARANCES:
        c_root = docs / c
        md_dir = markdown_dir(c_root)
        if not md_dir.is_dir():
            continue
        for md_path in sorted(md_dir.rglob("*.md")):
            if not md_path.is_file():
                continue
            if md_path.name.upper().startswith("README"):
                continue
            if md_path.name.endswith("-profile.md"):
                skipped += 1
                continue
            try:
                text = md_path.read_text(encoding="utf-8", errors="replace")
            except OSError as exc:
                print(f"  read fail {md_path}: {exc}")
                continue
            meta = _parse_frontmatter(text)
            if not _is_converted_md(meta):
                skipped += 1
                continue

            source = _resolve_source(meta, repo_root, md_path)
            if source is None:
                print(f"  keep (no source) {md_path.relative_to(docs)}")
                kept += 1
                continue

            # Native text sufficient → delete converted md only
            if source.suffix.lower() in NATIVE_SUFFIXES and has_extractable_text(source):
                print(f"  DELETE converted md (native ok) {md_path.relative_to(docs)} ← {source.name}")
                if not args.dry_run:
                    try:
                        md_path.unlink()
                        from agent import text_match_store

                        try:
                            rel = str(source.relative_to(repo_root)).replace("\\", "/")
                        except ValueError:
                            rel = str(source).replace("\\", "/")
                        text_match_store.delete_by_source(rel)
                    except OSError as exc:
                        print(f"    unlink fail: {exc}")
                        continue
                deleted += 1
                continue

            # Empty native / image → OCR refresh
            print(f"  OCR refresh {source}")
            if args.dry_run:
                ocr_ok += 1
                continue
            result = convert_file_to_md(
                source, secure_docs_dir=docs, repo_root=repo_root
            )
            if result.kind == "ocr_md":
                ocr_ok += 1
            else:
                print(f"    OCR result={result.kind} {result.detail}")
                kept += 1

    # Also process orphan sources with no md (images / scan pdfs)
    for c in CLEARANCES:
        c_root = docs / c
        if not c_root.is_dir():
            continue
        md_root = markdown_dir(c_root)
        for path in sorted(c_root.rglob("*")):
            if not path.is_file():
                continue
            try:
                path.relative_to(md_root)
                continue
            except ValueError:
                pass
            suf = path.suffix.lower()
            if suf not in (NATIVE_SUFFIXES | IMAGE_SUFFIXES):
                continue
            if suf in NATIVE_SUFFIXES and has_extractable_text(path):
                continue
            if suf == ".txt":
                continue
            print(f"  OCR ensure {path.relative_to(docs)}")
            if args.dry_run:
                continue
            result = convert_file_to_md(path, secure_docs_dir=docs, repo_root=repo_root)
            if result.kind == "ocr_md":
                ocr_ok += 1

    print(
        f"done deleted_md={deleted} ocr_ok={ocr_ok} kept={kept} skipped_manual={skipped}"
    )
    print("Next: apply DB/schema.sql text_match DDL if needed, then:")
    print("  cd ai-service && python ingest_secure.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

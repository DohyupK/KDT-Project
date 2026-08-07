"""Document clearance levels for shared RAG (folder-based ACL)."""

from __future__ import annotations

from pathlib import Path

# Folder names under Documents/ (case-sensitive on disk).
CLEARANCES: tuple[str, ...] = ("Public", "Confidential", "Secret", "TopSecret")
CLEARANCE_SET = frozenset(CLEARANCES)

API_ALLOWED_CLEARANCES = frozenset({"Public", "Confidential"})
SECURE_ALLOWED_CLEARANCES = frozenset(CLEARANCES)

MARKDOWN_DIR_NAME = "Markdown"
DEFAULT_PROFILE_CLEARANCE = "Confidential"


def normalize_clearance(name: str | None) -> str | None:
    if not name:
        return None
    key = str(name).strip()
    for c in CLEARANCES:
        if key.lower() == c.lower():
            return c
    return None


def clearance_dirs(docs_root: Path) -> list[Path]:
    return [docs_root / c for c in CLEARANCES]


def ensure_clearance_tree(docs_root: Path) -> None:
    docs_root.mkdir(parents=True, exist_ok=True)
    for c in CLEARANCES:
        (docs_root / c / MARKDOWN_DIR_NAME).mkdir(parents=True, exist_ok=True)


def markdown_dir(clearance_root: Path) -> Path:
    return clearance_root / MARKDOWN_DIR_NAME


def clearance_from_path(path: Path, docs_root: Path) -> str | None:
    """Infer clearance from Documents/<Clearance>/... path."""
    try:
        rel = path.resolve().relative_to(docs_root.resolve())
    except ValueError:
        return None
    if not rel.parts:
        return None
    return normalize_clearance(rel.parts[0])


def is_under_any_markdown(path: Path, docs_root: Path) -> bool:
    try:
        rel = path.resolve().relative_to(docs_root.resolve())
    except ValueError:
        return MARKDOWN_DIR_NAME in path.parts
    return MARKDOWN_DIR_NAME in rel.parts


def clearance_root_for(path: Path, docs_root: Path) -> Path | None:
    c = clearance_from_path(path, docs_root)
    if not c:
        return None
    return docs_root / c

"""
Apply user_chat_* DDL to MariaDB (same DB as backend).
Usage (from ai-service/ or repo root):
  python DB/ai-service/apply_user_chat_tables.py
Reads DB_* from monorepo root `.env`.
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
AI = REPO / "ai-service"
SQL_PATH = Path(__file__).resolve().parent / "user_chat_tables.sql"

sys.path.insert(0, str(AI))
from dotenv import load_dotenv

load_dotenv(REPO / ".env", override=False)

import os


def main() -> int:
    import pymysql

    host = os.environ.get("DB_HOST", "").strip()
    if not host:
        print("DB_HOST missing — set monorepo root .env")
        return 1
    port = int(os.environ.get("DB_PORT") or "3306")
    user = os.environ.get("DB_USER", "").strip()
    password = os.environ.get("DB_PASSWORD") or ""
    name = os.environ.get("DB_NAME", "").strip()
    sql = SQL_PATH.read_text(encoding="utf-8")
    # Split on semicolons for multi-statement (simple)
    statements = [s.strip() for s in sql.split(";") if s.strip() and not s.strip().startswith("--")]
    conn = pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=name,
        charset="utf8mb4",
        autocommit=True,
    )
    try:
        with conn.cursor() as cur:
            # Re-read full file and execute statement by statement more carefully
            buf: list[str] = []
            for line in SQL_PATH.read_text(encoding="utf-8").splitlines():
                if line.strip().startswith("--"):
                    continue
                buf.append(line)
                if line.rstrip().endswith(";"):
                    stmt = "\n".join(buf).strip().rstrip(";").strip()
                    buf = []
                    if stmt:
                        print(f"exec: {stmt[:60].replace(chr(10), ' ')}...")
                        cur.execute(stmt)
            if buf:
                stmt = "\n".join(buf).strip().rstrip(";").strip()
                if stmt:
                    cur.execute(stmt)
        print(f"OK applied {SQL_PATH} → {host}/{name}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())

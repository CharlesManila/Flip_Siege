"""Apply a single SQL migration file. Usage: python apply-migration.py <filename.sql>"""
import os
import pathlib
import sys

import psycopg2

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT / "supabase" / "migrations"


def main() -> None:
    name = sys.argv[1] if len(sys.argv) > 1 else None
    if not name:
        print("Usage: python apply-migration.py <migration.sql>")
        sys.exit(1)
    path = MIGRATIONS / name if not pathlib.Path(name).is_absolute() else pathlib.Path(name)
    password = os.environ.get("SUPABASE_DB_PASSWORD")
    if not password:
        print("Set SUPABASE_DB_PASSWORD")
        sys.exit(1)
    sql = path.read_text(encoding="utf-8")
    conn = psycopg2.connect(
        host="db.wfjmrtogzfpkinivjipr.supabase.co",
        port=5432,
        dbname="postgres",
        user="postgres",
        password=password,
        sslmode="require",
        connect_timeout=20,
    )
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(sql)
    cur.close()
    conn.close()
    print(f"Applied {path.name}")


if __name__ == "__main__":
    main()

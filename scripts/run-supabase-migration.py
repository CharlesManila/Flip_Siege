"""One-off: apply finished_games migration to Supabase Postgres."""
import pathlib
import sys

import psycopg2

ROOT = pathlib.Path(__file__).resolve().parent.parent
SQL_PATH = ROOT / "supabase" / "migrations" / "20260525000000_finished_games.sql"

PASSWORD = sys.argv[1] if len(sys.argv) > 1 else None
if not PASSWORD:
    print("Usage: python run-supabase-migration.py <database_password>")
    sys.exit(1)

sql = SQL_PATH.read_text(encoding="utf-8")
conn = psycopg2.connect(
    host="db.wfjmrtogzfpkinivjipr.supabase.co",
    port=5432,
    dbname="postgres",
    user="postgres",
    password=PASSWORD,
    sslmode="require",
    connect_timeout=20,
)
conn.autocommit = True
cur = conn.cursor()
cur.execute(sql)
cur.execute(
    "SELECT COUNT(*) FROM information_schema.tables "
    "WHERE table_schema = 'public' AND table_name = 'finished_games'"
)
print("finished_games table:", cur.fetchone()[0])
cur.close()
conn.close()
print("Migration OK")

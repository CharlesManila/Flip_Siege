"""Read finished_games payloads from Supabase (requires DB password, not anon key)."""
import json
import os
import sys

import psycopg2

HOST = "db.wfjmrtogzfpkinivjipr.supabase.co"
LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 5


def main() -> None:
    password = os.environ.get("SUPABASE_DB_PASSWORD")
    if not password:
        print("Set SUPABASE_DB_PASSWORD, then run again.", file=sys.stderr)
        sys.exit(1)
    conn = psycopg2.connect(
        host=HOST,
        port=5432,
        dbname="postgres",
        user="postgres",
        password=password,
        sslmode="require",
        connect_timeout=20,
    )
    cur = conn.cursor()
    cur.execute(
        """
        select created_at::text, payload
        from public.finished_games
        order by created_at desc
        limit %s
        """,
        (LIMIT,),
    )
    for created_at, payload in cur.fetchall():
        print("=" * 60)
        print(created_at)
        print(json.dumps(payload, indent=2))
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()

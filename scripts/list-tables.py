import sys
import psycopg2

conn = psycopg2.connect(
    host="db.wfjmrtogzfpkinivjipr.supabase.co",
    port=5432,
    dbname="postgres",
    user="postgres",
    password=sys.argv[1],
    sslmode="require",
)
cur = conn.cursor()
cur.execute(
    """
    select table_schema, table_name
    from information_schema.tables
    where table_schema not in ('pg_catalog', 'information_schema')
    order by 1, 2
    """
)
for r in cur.fetchall():
    print(f"{r[0]}.{r[1]}")
cur.close()
conn.close()

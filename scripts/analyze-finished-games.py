"""Summarize finished_games payloads (requires SUPABASE_DB_PASSWORD)."""
import json
import os
import statistics
import sys

import psycopg2

conn = psycopg2.connect(
    host="db.wfjmrtogzfpkinivjipr.supabase.co",
    port=5432,
    dbname="postgres",
    user="postgres",
    password=os.environ["SUPABASE_DB_PASSWORD"],
    sslmode="require",
    connect_timeout=20,
)
cur = conn.cursor()
cur.execute(
    """
    select created_at::text, payload
    from public.finished_games
    order by created_at asc
    """
)
rows = cur.fetchall()
cur.close()
conn.close()

print("total", len(rows))
rounds = []
human_wins = 0
human_hp_end = []
enemy_hp_end = []
tricks = []
for ts, p in rows:
    r = int(p.get("rounds_reached") or 0)
    rounds.append(r)
    if p.get("human_won"):
        human_wins += 1
    hp = p.get("final_hp") or [0, 0]
    human_hp_end.append(hp[0])
    enemy_hp_end.append(hp[1])
    tricks.append(p.get("tricks_completed") or 0)

from collections import Counter

rc = Counter(rounds)
print("human_win_pct", round(100 * human_wins / max(len(rows), 1), 1))
print("rounds_distribution", dict(sorted(rc.items())))
print("mean_rounds", round(statistics.mean(rounds), 2) if rounds else 0)
print("mean_tricks", round(statistics.mean(tricks), 1) if tricks else 0)
print("mean_human_hp_end", round(statistics.mean(human_hp_end), 1))
print("mean_enemy_hp_end", round(statistics.mean(enemy_hp_end), 1))
print("---")
for ts, p in rows:
    hp = p.get("final_hp")
    print(
        ts[:19],
        "R" + str(p.get("rounds_reached")),
        "win" if p.get("human_won") else "loss",
        f"HP {hp[0]}/{hp[1]}",
        "tricks",
        p.get("tricks_completed"),
    )

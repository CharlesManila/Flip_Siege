# Finished-game play logging

The browser client can send **anonymous replays of completed games only** (castle destroyed or timeout). Abandoned tabs, menu exits, and mid-match refreshes are **not** logged.

Each record includes:

- Follow mode, rounds, winner, final HP
- Every **card you played** (color + ranks)
- Armory purchases, trophy picks, calamity defense cards
- Last lines of the battle log

No names, emails, or IP addresses are stored in the payload (only `session_id` in the browser and hostname `charlesmanila.github.io`).

---

## 1. Create a free Supabase project

1. Sign up at [https://supabase.com](https://supabase.com)
2. **New project** → pick a name and password
3. Wait for the database to finish provisioning

---

## 2. Create the table

In Supabase: **SQL Editor** → New query → paste and run:

```sql
create table if not exists public.finished_games (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text,
  payload jsonb not null
);

create index if not exists finished_games_created_at
  on public.finished_games (created_at desc);

alter table public.finished_games enable row level security;

-- Anonymous site visitors may INSERT only (no read/update/delete)
create policy "anon_insert_finished_games"
  on public.finished_games
  for insert
  to anon
  with check (true);
```

---

## 3. API keys (GitHub secret — recommended)

Project URL is already set: `https://wfjmrtogzfpkinivjipr.supabase.co`

1. Supabase → **Project Settings** → **API**
2. Copy the **anon public** key (`eyJ…`)
3. Add it to GitHub (do **not** commit the service_role key):

```powershell
gh secret set SUPABASE_ANON_KEY --repo CharlesManila/Flip_Siege
```

Paste the anon key when prompted, then push any commit or re-run the **Deploy Flip-Siege Play** workflow.

**Or** paste the anon key into `js/playLogConfig.js` locally and push (safe with insert-only RLS).

---

## 4. Test

1. Open the live game, leave **Share finished-game stats** checked
2. Play until the match ends (win or lose)
3. Supabase → **Table Editor** → `finished_games` → you should see a new row
4. Open `payload` → expand `human_plays`

Local test: set `logLocalhost: true` and use the same keys while on `http://localhost:8080`.

---

## Optional: webhook instead of Supabase

Set `webhookUrl` to any HTTPS endpoint that accepts POST JSON (Pipedream, Make, your own server). The body is the full payload object (not wrapped).

You can use **both** Supabase and a webhook.

---

## Export data for analysis

Supabase → **Table Editor** → `finished_games` → Export CSV  
Or SQL: `select created_at, payload->'human_won', payload->'human_plays' from finished_games order by created_at desc;`

Use `human_plays` arrays to tune AI or balance.

---

## Player opt-in

Setup screen checkbox (default on). Stored in `localStorage` as `flip_siege_play_log_opt_in`. Unchecked = no upload even if Supabase is configured.

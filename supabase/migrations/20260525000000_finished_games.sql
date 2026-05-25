create table if not exists public.finished_games (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text,
  payload jsonb not null
);

create index if not exists finished_games_created_at
  on public.finished_games (created_at desc);

alter table public.finished_games enable row level security;

drop policy if exists "anon_insert_finished_games" on public.finished_games;

create policy "anon_insert_finished_games"
  on public.finished_games
  for insert
  to anon
  with check (true);

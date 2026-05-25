-- Public aggregate stats for the play dashboard (no raw human_plays in RPC).

create or replace function public.play_stats_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_build_object(
      'total', count(*)::int,
      'human_wins', count(*) filter (where (payload->>'human_won')::boolean is true)::int,
      'human_losses', count(*) filter (where (payload->>'human_won')::boolean is false)::int,
      'mean_rounds', round(avg((payload->>'rounds_reached')::numeric), 2),
      'mean_tricks', round(avg((payload->>'tricks_completed')::numeric), 1),
      'mean_human_hp', round(avg((payload->'final_hp'->>0)::numeric), 1),
      'mean_enemy_hp', round(avg((payload->'final_hp'->>1)::numeric), 1),
      'rounds_histogram', coalesce(
        (
          select jsonb_object_agg(r::text, c)
          from (
            select (payload->>'rounds_reached')::int as r, count(*)::int as c
            from finished_games
            group by 1
            order by 1
          ) h
        ),
        '{}'::jsonb
      ),
      'first_game', min(created_at),
      'last_game', max(created_at)
    ),
    jsonb_build_object(
      'total', 0,
      'human_wins', 0,
      'human_losses', 0,
      'mean_rounds', null,
      'mean_tricks', null,
      'mean_human_hp', null,
      'mean_enemy_hp', null,
      'rounds_histogram', '{}'::jsonb,
      'first_game', null,
      'last_game', null
    )
  )
  from finished_games;
$$;

create or replace function public.play_stats_recent(p_limit int default 25)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'created_at', created_at,
        'rounds_reached', payload->>'rounds_reached',
        'human_won', (payload->>'human_won')::boolean,
        'final_hp', payload->'final_hp',
        'tricks_completed', (payload->>'tricks_completed')::int,
        'host', payload->>'host'
      )
      order by created_at desc
    ),
    '[]'::jsonb
  )
  from (
    select created_at, payload
    from finished_games
    order by created_at desc
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  ) recent;
$$;

grant execute on function public.play_stats_summary() to anon, authenticated;
grant execute on function public.play_stats_recent(int) to anon, authenticated;

-- ============================================================================
-- Phase 11 Step 2B — Authoritative profile Clash statistics
-- ----------------------------------------------------------------------------
-- Counts settled clashes that have a verdict, using the same participant-side
-- winner semantics as `profile_clash_list` (A = take author, B = challenger,
-- DRAW = draw). Open / cancelled / settled-without-verdict rows are excluded.
-- Visibility matches the list RPC: readable take + challenger not actor-hidden.
-- Aggregate only — no opponent identities or take text.
-- ============================================================================

create or replace function public.profile_clash_stats(p_profile_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_clashes integer := 0;
  v_wins integer := 0;
  v_losses integer := 0;
  v_draws integer := 0;
begin
  if p_profile_id is null or length(btrim(p_profile_id)) = 0 then
    raise exception 'profile required' using errcode = '22023';
  end if;

  select
    count(*)::integer,
    count(*) filter (where s.outcome = 'won')::integer,
    count(*) filter (where s.outcome = 'lost')::integer,
    count(*) filter (where s.outcome = 'draw')::integer
  into v_clashes, v_wins, v_losses, v_draws
  from (
    select
      case
        when v.winner_side = 'DRAW' then 'draw'
        when t.author_id = p_profile_id and v.winner_side = 'A' then 'won'
        when c.challenger_id = p_profile_id and v.winner_side = 'B' then 'won'
        else 'lost'
      end as outcome
    from public.clashes c
    join public.takes t on t.id = c.take_id
    join public.verdicts v on v.clash_id = c.id
    where (c.challenger_id = p_profile_id or t.author_id = p_profile_id)
      and c.status = 'settled'
      and public.arena_take_readable(t.id)
      and not public.arena_actor_hidden_internal(v_viewer, c.challenger_id)
  ) s;

  return jsonb_build_object(
    'clashes', coalesce(v_clashes, 0),
    'wins', coalesce(v_wins, 0),
    'losses', coalesce(v_losses, 0),
    'draws', coalesce(v_draws, 0)
  );
end;
$$;

comment on function public.profile_clash_stats(text) is
  'Settled Clash win/loss/draw counts for a profile. Same outcome semantics as profile_clash_list; no private opponent payload.';

revoke all on function public.profile_clash_stats(text) from public;
grant execute on function public.profile_clash_stats(text) to anon, authenticated;

notify pgrst, 'reload schema';

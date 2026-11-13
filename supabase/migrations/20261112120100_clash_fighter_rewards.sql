-- ============================================================================
-- CLASH 2.0 · CANDIDATE — Award the two fighters on settlement
-- ----------------------------------------------------------------------------
-- Baseline: 36dccade5f5b7a7ae62c77f966d3b519d34723ee
-- Prereq:   20261112120000_clash_fighter_reward_kinds.sql (enum committed first)
--
-- Minimum forward-only change. The existing juror loop, verdict insert, tally,
-- locking, cancellation and notifications are copied VERBATIM from
-- settle_clash_legacy (20260927010000_clash_draw.sql:31-150). The ONLY addition
-- is one fighter-reward block inserted after the juror loop and before the
-- status flip.
--
-- WHY A FORWARD REDEFINITION OF settle_clash_legacy:
--   settle_clash_legacy is the single authoritative duel settlement path. Every
--   caller (settle_clash wrapper, settle_arena_room dispatcher, settle_due_clashes
--   cron) reaches it, so patching it once covers every entry point. Its EXECUTE
--   privilege stays revoked; only SECURITY DEFINER callers can invoke it.
--
-- WHY THE REWARD IS NOT EMITTED FROM A TRIGGER ON public.verdicts:
--   Several existing suites INSERT verdict rows directly to exercise follower
--   notifications (093_clash_follows.sql:133,149,167 et al). A trigger there
--   would credit fighters in those fixtures, and would also rely on a naked
--   insert being a trustworthy settlement signal. Awarding inside the locked
--   settlement transaction is the narrower and safer seam.
--
-- CONCURRENCY / IDEMPOTENCY:
--   1. `for update of c` on public.clashes is unchanged, so concurrent
--      settlements still serialize; the second waiter observes status='settled'
--      and early-returns at the existing guard before any reward runs.
--   2. The verdict insert's `on conflict do nothing` is unchanged.
--   3. The fighter block is additionally self-guarding: it skips if either
--      fighter already holds a fighter kind for this clash. That makes the block
--      safe even on a path that somehow bypasses the terminal-state early return.
--   4. arena_room_id is left NULL. Duel rooms must keep zero room-scoped ledger
--      rows (asserted by 054_arena_duel_foundation.sql:149); room-scoped awards
--      belong to the separate group engine.
--
-- NO HISTORICAL BACKFILL: already-settled clashes early-return and are never
-- re-awarded. The accepted nine-duel fixture is untouched.
-- ============================================================================

begin;

create or replace function public.settle_clash_legacy(p_clash_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clash record;
  v_a integer;
  v_b integer;
  v_total integer;
  v_winner public.verdict_winner;
  v_margin integer;
  v_agreement numeric(5,4);
  v_label text;
  j record;
  v_fighter_win integer := 40;
  v_fighter_part integer := 15;
begin
  -- Lock the clash row so concurrent settlements serialize and never double-award.
  select c.id, c.take_id, c.challenger_id, c.status, c.closes_at, t.author_id
    into v_clash from public.clashes c join public.takes t on t.id = c.take_id
   where c.id = p_clash_id for update of c;

  if v_clash.id is null then
    raise exception 'clash does not exist' using errcode = 'P0002';
  end if;

  if v_clash.status = 'settled' then
    return (select jsonb_build_object(
      'clash_id', clash_id, 'winner_side', winner_side, 'side_a_score', side_a_score,
      'side_b_score', side_b_score, 'jury_size', jury_size, 'agreement', agreement,
      'margin', margin, 'verdict_label', verdict_label
    ) from public.verdicts where clash_id = p_clash_id);
  end if;

  if v_clash.closes_at > now() then
    raise exception 'clash has not closed yet' using errcode = 'P0006';
  end if;

  select count(*) filter (where side = 'A'), count(*) filter (where side = 'B')
    into v_a, v_b from public.judgements where clash_id = p_clash_id;

  v_total := v_a + v_b;

  if v_total = 0 then
    update public.clashes set status = 'cancelled' where id = p_clash_id;
    return jsonb_build_object('clash_id', p_clash_id, 'status', 'cancelled', 'jury_size', 0);
  end if;

  -- A tie is a genuine DRAW: neither side wins, and there is no random tie-break.
  v_winner := case
    when v_a > v_b then 'A'
    when v_b > v_a then 'B'
    else 'DRAW' end;
  v_margin := abs(v_a - v_b);
  v_agreement := round(greatest(v_a, v_b)::numeric / v_total, 4);
  v_label := case
    when v_winner = 'DRAW' then 'DRAW'
    when v_margin <= 1 then 'SPLIT DECISION'
    when v_margin <= 3 then 'CLEAR DECISION'
    else 'LANDSLIDE' end;

  insert into public.verdicts (clash_id, winner_side, side_a_score, side_b_score, jury_size, agreement, margin, verdict_label)
  values (p_clash_id, v_winner, v_a, v_b, v_total, v_agreement, v_margin, v_label)
  on conflict (clash_id) do nothing;

  -- Reward each juror and record the immutable ledger. (UNCHANGED)
  for j in select juror_id, side from public.judgements where clash_id = p_clash_id loop
    if v_winner = 'DRAW' then
      -- Draw: participation only — no win bonus, no dissent, no coins, no streak change.
      insert into public.reputation_events (id, profile_id, clash_id, kind, reputation_delta, coins_delta)
      values ('re_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
              j.juror_id, p_clash_id, 'clash_participation', 15, 0);
      update public.profiles
         set reputation = reputation + 15,
             rank       = public.rank_for_rep(reputation + 15)
       where id = j.juror_id;
    elsif j.side::text = v_winner::text then
      insert into public.reputation_events (id, profile_id, clash_id, kind, reputation_delta, coins_delta)
      values ('re_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
              j.juror_id, p_clash_id, 'clash_participation', 15, 0);
      insert into public.reputation_events (id, profile_id, clash_id, kind, reputation_delta, coins_delta)
      values ('re_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
              j.juror_id, p_clash_id, 'clash_win', 105, 40);
      update public.profiles
         set reputation = reputation + 120,
             coins      = coins + 40,
             streak     = streak + 1,
             rank       = public.rank_for_rep(reputation + 120)
       where id = j.juror_id;
    else
      insert into public.reputation_events (id, profile_id, clash_id, kind, reputation_delta, coins_delta)
      values ('re_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
              j.juror_id, p_clash_id, 'clash_participation', 15, 0);
      insert into public.reputation_events (id, profile_id, clash_id, kind, reputation_delta, coins_delta)
      values ('re_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
              j.juror_id, p_clash_id, 'clash_dissent', 10, 18);
      update public.profiles
         set reputation = reputation + 25,
             coins      = coins + 18,
             streak     = 0,
             rank       = public.rank_for_rep(reputation + 25)
       where id = j.juror_id;
    end if;

    perform public.clash_notify(j.juror_id, null, 'reputation', p_clash_id);
  end loop;

  -- ── NEW: fighter rewards (owner-approved policy) ──────────────────────────
  -- Winner +40, loser +15, both +15 on DRAW, 0 coins in every case, no streak
  -- change. arena_room_id stays NULL (duel rooms own no room-scoped awards).
  -- Self-guarding so a replayed settlement can never double-credit a fighter.
  if not exists (
    select 1 from public.reputation_events e
     where e.clash_id = p_clash_id
       and e.kind in ('clash_fighter_win', 'clash_fighter_participation')
  ) then
    insert into public.reputation_events (id, profile_id, clash_id, arena_room_id, kind, reputation_delta, coins_delta)
    select 're_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
           f.profile_id, p_clash_id, null, f.kind, f.delta, 0
      from (values
        (v_clash.author_id,
         case when v_winner = 'A' then 'clash_fighter_win'::public.reputation_kind
              else 'clash_fighter_participation'::public.reputation_kind end,
         case when v_winner = 'A' then v_fighter_win else v_fighter_part end),
        (v_clash.challenger_id,
         case when v_winner = 'B' then 'clash_fighter_win'::public.reputation_kind
              else 'clash_fighter_participation'::public.reputation_kind end,
         case when v_winner = 'B' then v_fighter_win else v_fighter_part end)
      ) as f(profile_id, kind, delta)
     where f.profile_id is not null;

    -- Aggregate first: even if a malformed row ever shared both fighter ids,
    -- this update would touch that profile exactly once with the summed delta
    -- instead of arbitrarily picking one VALUES row.
    update public.profiles p
       set reputation = p.reputation + f.delta,
           rank       = public.rank_for_rep(p.reputation + f.delta)
      from (
        select profile_id, sum(delta)::integer as delta
          from (values
            (v_clash.author_id,
             case when v_winner = 'A' then v_fighter_win else v_fighter_part end),
            (v_clash.challenger_id,
             case when v_winner = 'B' then v_fighter_win else v_fighter_part end)
          ) as f(profile_id, delta)
         group by profile_id
      ) as f
     where p.id = f.profile_id;

    -- Same notification contract jurors already receive, so the result screen's
    -- unread badge is truthful for fighters too.
    perform public.clash_notify(v_clash.author_id, null, 'reputation', p_clash_id);
    perform public.clash_notify(v_clash.challenger_id, null, 'reputation', p_clash_id);
  end if;

  -- Result notifications to both debaters. (UNCHANGED)
  perform public.clash_notify(v_clash.author_id, null, 'clash_result', p_clash_id);
  perform public.clash_notify(v_clash.challenger_id, null, 'clash_result', p_clash_id);

  update public.clashes set status = 'settled', settled_at = now() where id = p_clash_id;

  return jsonb_build_object(
    'clash_id', p_clash_id, 'winner_side', v_winner, 'side_a_score', v_a,
    'side_b_score', v_b, 'jury_size', v_total, 'agreement', v_agreement,
    'margin', v_margin, 'verdict_label', v_label
  );
end;
$$;

-- Privileges unchanged: private helper reachable only from SECURITY DEFINER
-- callers (settle_clash wrapper, settle_arena_room dispatcher, settle_due_clashes).
revoke all on function public.settle_clash_legacy(text) from public, anon, authenticated, service_role;

commit;

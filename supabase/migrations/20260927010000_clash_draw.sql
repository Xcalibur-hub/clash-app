-- ============================================================================
-- CLASH 2.0 · 0011 — Clash draws
-- ----------------------------------------------------------------------------
-- A tied ballot must settle as a real DRAW: no Side A / Side B winner, no
-- `clash_win` reward, no winner coins, no arbitrary (random) tie-break.
--
-- REPRESENTATION: an explicit `verdict_winner` enum ('A', 'B', 'DRAW') backs
-- `verdicts.winner_side`. This keeps `clash_side` as the A/B-only *ballot* enum
-- (a juror can never vote DRAW) and makes the winner explicit — never overloaded
-- onto A/B and never NULL (which would be ambiguous with "not yet settled").
--
-- ECONOMY: on a draw every juror keeps the universal `clash_participation`
-- reward (+15) that the existing model already grants all jurors; the win bonus
-- and dissent rewards do not apply. No new bonus is invented. A-win / B-win
-- rewards are untouched.
--
-- Concurrency, atomicity, row locking, idempotency and the single-verdict rule
-- are unchanged from migration 0005.
-- ============================================================================

-- ── 1. Winner representation ────────────────────────────────────────────────
do $$ begin
  create type public.verdict_winner as enum ('A', 'B', 'DRAW');
exception when duplicate_object then null; end $$;

alter table public.verdicts
  alter column winner_side type public.verdict_winner
  using winner_side::text::public.verdict_winner;

-- ── 2. Settlement (draw-aware) ──────────────────────────────────────────────
create or replace function public.settle_clash(p_clash_id text)
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

  -- Reward each juror and record the immutable ledger.
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

  -- Result notifications to both debaters.
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

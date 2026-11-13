-- ============================================================================
-- CLASH 2.0 · CANDIDATE — Fighter reward regression (pgTAP)
-- ----------------------------------------------------------------------------
-- Baseline: 36dccade5f5b7a7ae62c77f966d3b519d34723ee
-- Covers the owner-approved 2026-11-12 fighter policy:
--   WIN  → winner +40 (clash_fighter_win), loser +15 (clash_fighter_participation)
--   DRAW → both +15 (clash_fighter_participation)
--   CANCELLED (0 ballots) → nobody paid
--   Coins: 0 in every fighter case. Juror payouts unchanged.
--   Idempotent across replay; no backfill of settled history.
--
-- Self-contained: build fixtures as table owner, drive settlement through the
-- real public.settle_clash wrapper, and clean up nothing (pgTAP rolls back).
-- ============================================================================

begin;
select plan(35);

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000f101'),
  ('00000000-0000-0000-0000-00000000f102'),
  ('00000000-0000-0000-0000-00000000f103'),
  ('00000000-0000-0000-0000-00000000f104'),
  ('00000000-0000-0000-0000-00000000f105');

update public.profiles set id='fw-author',     handle='fw_author',     name='FW Author',
       role='viewer', reputation=0, coins=0, streak=0
 where auth_user_id='00000000-0000-0000-0000-00000000f101';
update public.profiles set id='fw-challenger', handle='fw_challenger', name='FW Challenger',
       role='viewer', reputation=0, coins=0, streak=0
 where auth_user_id='00000000-0000-0000-0000-00000000f102';
update public.profiles set id='fw-j1', handle='fw_j1', name='FW J1',
       role='viewer', reputation=0, coins=0, streak=0
 where auth_user_id='00000000-0000-0000-0000-00000000f103';
update public.profiles set id='fw-j2', handle='fw_j2', name='FW J2',
       role='viewer', reputation=0, coins=0, streak=0
 where auth_user_id='00000000-0000-0000-0000-00000000f104';
update public.profiles set id='fw-j3', handle='fw_j3', name='FW J3',
       role='viewer', reputation=0, coins=0, streak=0
 where auth_user_id='00000000-0000-0000-0000-00000000f105';

insert into public.takes (id, author_id, hood, text, status, expires_at) values
  ('fw-take-a', 'fw-author', 'techtakes', 'Fighter reward A-majority fixture.', 'active', now() + interval '24 hours'),
  ('fw-take-b', 'fw-author', 'techtakes', 'Fighter reward B-majority fixture.', 'active', now() + interval '24 hours'),
  ('fw-take-d', 'fw-author', 'techtakes', 'Fighter reward DRAW fixture.',       'active', now() + interval '24 hours'),
  ('fw-take-c', 'fw-author', 'techtakes', 'Fighter reward CANCELLED fixture.',  'active', now() + interval '24 hours');

insert into public.clashes (id, take_id, challenger_id, status, opens_at, closes_at) values
  ('fw-clash-a', 'fw-take-a', 'fw-challenger', 'open', now() - interval '10 min', now() - interval '1 min'),
  ('fw-clash-b', 'fw-take-b', 'fw-challenger', 'open', now() - interval '10 min', now() - interval '1 min'),
  ('fw-clash-d', 'fw-take-d', 'fw-challenger', 'open', now() - interval '10 min', now() - interval '1 min'),
  ('fw-clash-c', 'fw-take-c', 'fw-challenger', 'open', now() - interval '10 min', now() - interval '1 min');

-- A-majority (side A = the take author): j1,j2 vote A ; j3 votes B
insert into public.judgements (clash_id, juror_id, side) values
  ('fw-clash-a','fw-j1','A'), ('fw-clash-a','fw-j2','A'), ('fw-clash-a','fw-j3','B');

-- B-majority: j1,j2 vote B ; j3 votes A
insert into public.judgements (clash_id, juror_id, side) values
  ('fw-clash-b','fw-j1','B'), ('fw-clash-b','fw-j2','B'), ('fw-clash-b','fw-j3','A');

-- DRAW: a genuine 1–1 tie, so j3 sits this one out entirely.
insert into public.judgements (clash_id, juror_id, side) values
  ('fw-clash-d','fw-j1','A'), ('fw-clash-d','fw-j2','B');

-- fw-clash-c intentionally has no ballots → CANCELLED

-- ── 1. Vocabulary is distinct and auditable ────────────────────────────────
select has_column('public','reputation_events','kind','ledger keeps its kind column');
select is(
  (select array_agg(l order by l::text)::text[]
     from unnest(enum_range(null::public.reputation_kind)) l
    where l::text like 'clash_fighter%'),
  array['clash_fighter_participation','clash_fighter_win']::text[],
  'two dedicated fighter reward kinds exist');
select is(
  (select count(*)::int from unnest(enum_range(null::public.reputation_kind)) l
    where l::text in ('clash_participation','clash_win','clash_dissent')),
  3, 'the three historical juror kinds are untouched');

-- ── 2. A-majority settlement ───────────────────────────────────────────────
select lives_ok($$ select public.settle_clash('fw-clash-a') $$, 'A-majority settle runs');
select is((select winner_side::text from public.verdicts where clash_id='fw-clash-a'), 'A',
  'A-majority settles A');

select is((select reputation_delta from public.reputation_events
            where clash_id='fw-clash-a' and profile_id='fw-author' and kind='clash_fighter_win'),
  40, 'winning debater (author, side A) earns +40');
select is((select coins_delta from public.reputation_events
            where clash_id='fw-clash-a' and profile_id='fw-author' and kind='clash_fighter_win'),
  0, 'winning debater earns 0 coins');
select is((select reputation_delta from public.reputation_events
            where clash_id='fw-clash-a' and profile_id='fw-challenger' and kind='clash_fighter_participation'),
  15, 'losing debater (challenger, side B) earns +15');
select is((select coins_delta from public.reputation_events
            where clash_id='fw-clash-a' and profile_id='fw-challenger' and kind='clash_fighter_participation'),
  0, 'losing debater earns 0 coins');

select is((select reputation from public.profiles where id='fw-author'), 40,
  'author (side A, winner) profile reputation = +40');
select is((select reputation from public.profiles where id='fw-challenger'), 15,
  'challenger (side B, loser) profile reputation = +15');
select is((select coins from public.profiles where id='fw-author'), 0,
  'author profile coins unchanged');
select is((select streak from public.profiles where id='fw-author'), 0,
  'fighter win does not touch streak');

-- ── 3. Juror economy unchanged ─────────────────────────────────────────────
select is((select reputation from public.profiles where id='fw-j1'), 120,
  'winning juror still +120');
select is((select coins from public.profiles where id='fw-j1'), 40,
  'winning juror still +40 coins');
select is((select reputation from public.profiles where id='fw-j3'), 25,
  'dissenting juror still +25');
select is((select coins from public.profiles where id='fw-j3'), 18,
  'dissenting juror still +18 coins');

-- ── 4. Room scope must not leak into duel rooms ────────────────────────────
select is((select count(*)::int from public.reputation_events
            where clash_id='fw-clash-a' and arena_room_id is not null),
  0, 'fighter awards carry no arena_room_id');

-- ── 5. Idempotency ─────────────────────────────────────────────────────────
select lives_ok($$ select public.settle_clash('fw-clash-a') $$, 're-settle runs');
select is((select count(*)::int from public.reputation_events
            where clash_id='fw-clash-a' and kind in ('clash_fighter_win','clash_fighter_participation')),
  2, 're-settle writes no duplicate fighter rows');
select is((select reputation from public.profiles where id='fw-author'), 40,
  're-settle does not re-award the winner');
select is((select count(*)::int from public.verdicts where clash_id='fw-clash-a'), 1,
  're-settle keeps exactly one verdict');

-- ── 6. B-majority pays the challenger ──────────────────────────────────────
select lives_ok($$ select public.settle_clash('fw-clash-b') $$, 'B-majority settle runs');
select is((select reputation_delta from public.reputation_events
            where clash_id='fw-clash-b' and profile_id='fw-challenger' and kind='clash_fighter_win'),
  40, 'challenger (side B) wins +40 when side B wins');
select is((select reputation_delta from public.reputation_events
            where clash_id='fw-clash-b' and profile_id='fw-author' and kind='clash_fighter_participation'),
  15, 'author (side A) earns +15 participation when side B wins');

-- ── 7. DRAW pays both, equally, without a winner ───────────────────────────
select is((select count(*)::int from public.judgements where clash_id='fw-clash-d'), 2,
  'draw fixture really is a 1-1 tie');
select lives_ok($$ select public.settle_clash('fw-clash-d') $$, 'DRAW settle runs');
select is((select winner_side::text from public.verdicts where clash_id='fw-clash-d'), 'DRAW',
  'tie settles DRAW with no fabricated winner');
select is((select count(*)::int from public.reputation_events
            where clash_id='fw-clash-d' and kind='clash_fighter_win'), 0,
  'draw grants no fighter win kind');
select is((select count(*)::int from public.reputation_events
            where clash_id='fw-clash-d' and kind='clash_fighter_participation'), 2,
  'draw grants participation to exactly two fighters');
select is((select sum(reputation_delta)::int from public.reputation_events
            where clash_id='fw-clash-d' and kind='clash_fighter_participation'), 30,
  'draw pays +15 each (30 total)');
select is((select coalesce(sum(coins_delta),0)::int from public.reputation_events
            where clash_id='fw-clash-d'), 0, 'draw pays no coins to anyone');

-- ── 8. CANCELLED pays nobody ───────────────────────────────────────────────
select lives_ok($$ select public.settle_clash('fw-clash-c') $$, 'zero-ballot settle runs');
select is((select status::text from public.clashes where id='fw-clash-c'), 'cancelled',
  'zero ballots still cancels');
select is((select count(*)::int from public.reputation_events where clash_id='fw-clash-c'), 0,
  'cancelled clash writes no fighter rewards');

select * from finish();
rollback;

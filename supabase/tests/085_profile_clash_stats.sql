-- ============================================================================
-- Phase 11 Step 2B — profile_clash_stats (pgTAP)
-- Settled-with-verdict counts only; open/cancelled excluded; participant-specific;
-- visibility mirrors profile_clash_list filters.
-- Fixtures insert clashes/verdicts directly to avoid clash_start rate-limit noise.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000008401'),
  ('00000000-0000-0000-0000-000000008402'),
  ('00000000-0000-0000-0000-000000008403'),
  ('00000000-0000-0000-0000-000000008404'),
  ('00000000-0000-0000-0000-000000008405'),
  ('00000000-0000-0000-0000-000000008406');

update public.profiles set id = 'ps-a', handle = 'ps_a', name = 'PSA', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000008401';
update public.profiles set id = 'ps-b', handle = 'ps_b', name = 'PSB', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000008402';
update public.profiles set id = 'ps-c', handle = 'ps_c', name = 'PSC', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000008403';
update public.profiles set id = 'ps-j1', handle = 'ps_j1', name = 'PSJ1', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000008404';
update public.profiles set id = 'ps-j2', handle = 'ps_j2', name = 'PSJ2', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000008405';
update public.profiles set id = 'ps-stranger', handle = 'ps_str', name = 'PSStr', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000008406';

select has_function('public', 'profile_clash_stats', 'profile_clash_stats exists');

-- 1) No completed clashes
select is(
  public.profile_clash_stats('ps-a'),
  '{"clashes":0,"wins":0,"losses":0,"draws":0}'::jsonb,
  'profile with no clashes returns verified zeros'
);

insert into public.takes (id, author_id, hood, text, status, expires_at) values
  ('ps-take-win', 'ps-a', 'techtakes', 'A wins fixture.', 'active', now() + interval '24 hours'),
  ('ps-take-loss', 'ps-a', 'techtakes', 'A loses fixture.', 'active', now() + interval '24 hours'),
  ('ps-take-draw', 'ps-a', 'techtakes', 'Draw fixture.', 'active', now() + interval '24 hours'),
  ('ps-take-open', 'ps-a', 'techtakes', 'Open fixture.', 'active', now() + interval '24 hours'),
  ('ps-take-cancel', 'ps-a', 'techtakes', 'Cancel fixture.', 'active', now() + interval '24 hours');

insert into public.clashes (id, take_id, challenger_id, status, mode, opens_at, closes_at) values
  ('ps-cl-win', 'ps-take-win', 'ps-b', 'settled', 'STANDARD', now() - interval '2 hours', now() - interval '1 hour'),
  ('ps-cl-loss', 'ps-take-loss', 'ps-b', 'settled', 'STANDARD', now() - interval '2 hours', now() - interval '1 hour'),
  ('ps-cl-draw', 'ps-take-draw', 'ps-b', 'settled', 'STANDARD', now() - interval '2 hours', now() - interval '1 hour'),
  ('ps-cl-open', 'ps-take-open', 'ps-b', 'open', 'STANDARD', now(), now() + interval '24 hours'),
  ('ps-cl-cancel', 'ps-take-cancel', 'ps-b', 'cancelled', 'STANDARD', now() - interval '2 hours', now() - interval '1 hour');

insert into public.verdicts (
  clash_id, winner_side, side_a_score, side_b_score, jury_size, agreement, margin, verdict_label
) values
  ('ps-cl-win', 'A', 2, 0, 2, 1.0, 2, 'CLEAR'),
  ('ps-cl-loss', 'B', 0, 2, 2, 1.0, 2, 'CLEAR'),
  ('ps-cl-draw', 'DRAW', 1, 1, 2, 0.5, 0, 'DRAW');

-- 2–5) Settled win/loss/draw counted; open + cancelled excluded
select is(
  public.profile_clash_stats('ps-a'),
  '{"clashes":3,"wins":1,"losses":1,"draws":1}'::jsonb,
  'author: one win, one loss, one draw; open+cancelled excluded'
);

-- 6) Participant-specific counts (challenger is the mirror)
select is(
  public.profile_clash_stats('ps-b'),
  '{"clashes":3,"wins":1,"losses":1,"draws":1}'::jsonb,
  'challenger: mirror outcomes (win on B-majority, loss on A-majority, draw)'
);

-- Jurors are not participants
select is(
  public.profile_clash_stats('ps-j1'),
  '{"clashes":0,"wins":0,"losses":0,"draws":0}'::jsonb,
  'juror is not a clash participant for stats'
);

-- 7) Privacy: blocked challenger hidden from stranger viewer
insert into public.blocks (blocker_id, blocked_id)
values ('ps-stranger', 'ps-b')
on conflict do nothing;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000008406","role":"authenticated"}', true);
select is(
  (public.profile_clash_stats('ps-a') ->> 'clashes')::int,
  0,
  'stranger who blocks challenger does not see those settled stats'
);
reset role;

-- Participant still sees own record
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000008401","role":"authenticated"}', true);
select is(
  public.profile_clash_stats('ps-a'),
  '{"clashes":3,"wins":1,"losses":1,"draws":1}'::jsonb,
  'participant still sees own settled stats when stranger blocks opponent'
);
reset role;

-- 8) Account switch: stranger without block sees public aggregates
delete from public.blocks where blocker_id = 'ps-stranger' and blocked_id = 'ps-b';

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000008406","role":"authenticated"}', true);
select is(
  public.profile_clash_stats('ps-a'),
  '{"clashes":3,"wins":1,"losses":1,"draws":1}'::jsonb,
  'after unblocking, stranger sees settled aggregates'
);
-- Switch JWT to challenger — counts stay scoped to the requested profile id
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000008402","role":"authenticated"}', true);
select is(
  public.profile_clash_stats('ps-a'),
  '{"clashes":3,"wins":1,"losses":1,"draws":1}'::jsonb,
  'account switch does not alter stats for the requested profile id'
);
select is(
  public.profile_clash_stats('ps-b') ->> 'wins',
  '1',
  'account switch still returns accurate stats for the new caller profile target'
);
reset role;

-- Anonymous may call (public aggregates, no private payload)
set local role anon;
select lives_ok($$ select public.profile_clash_stats('ps-a') $$, 'anonymous may read aggregate stats');
select is(
  public.profile_clash_stats('ps-a'),
  '{"clashes":3,"wins":1,"losses":1,"draws":1}'::jsonb,
  'anonymous settled aggregates match authenticated stranger'
);
reset role;

select throws_ok(
  $$ select public.profile_clash_stats('') $$,
  '22023',
  null,
  'empty profile id rejected'
);

-- Query-failure contract is client-side (null wins/clashes); RPC itself returns jsonb.

select * from finish();
rollback;

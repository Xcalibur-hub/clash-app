-- ============================================================================
-- Persistent Clash following (pgTAP) — Step 4B
-- ----------------------------------------------------------------------------
-- Transaction-scoped: every assertion runs inside begin/rollback, so the local
-- stack keeps its data. Covers caller identity, idempotency, cross-user RLS,
-- forbidden visibility (cancelled, fixture, blocked author), unfollow-before-
-- verdict, fighter de-duplication, retry safety, draws and cancellation.
-- ============================================================================
begin;
select no_plan();
set local search_path = public, extensions;

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000f0001'),
  ('00000000-0000-0000-0000-0000000f0002'),
  ('00000000-0000-0000-0000-0000000f0003'),
  ('00000000-0000-0000-0000-0000000f0004'),
  ('00000000-0000-0000-0000-0000000f0005');

update public.profiles set id='cf-author', handle='cf_author', name='Author'
 where auth_user_id='00000000-0000-0000-0000-0000000f0001';
update public.profiles set id='cf-challenger', handle='cf_challenger', name='Challenger'
 where auth_user_id='00000000-0000-0000-0000-0000000f0002';
update public.profiles set id='cf-fan', handle='cf_fan', name='Fan'
 where auth_user_id='00000000-0000-0000-0000-0000000f0003';
update public.profiles set id='cf-other', handle='cf_other', name='Other'
 where auth_user_id='00000000-0000-0000-0000-0000000f0004';
update public.profiles set id='cf-blocked', handle='cf_blocked', name='Blocked'
 where auth_user_id='00000000-0000-0000-0000-0000000f0005';

insert into public.takes (id, author_id, hood, text) values
  ('cf-take', 'cf-author', 'techtakes', 'Followable proposition'),
  ('cf-fixture', 'cf-author', 'techtakes', 'Fixture proposition');
update public.takes set is_runtime_fixture = true where id = 'cf-fixture';

insert into public.clashes (id, take_id, challenger_id, status, opens_at, closes_at) values
  ('cf-open', 'cf-take', 'cf-challenger', 'open', now() - interval '10 min', now() + interval '1 hour'),
  ('cf-cancel', 'cf-take', 'cf-challenger', 'cancelled', now() - interval '10 min', now() + interval '1 hour'),
  ('cf-fixture-clash', 'cf-fixture', 'cf-challenger', 'open', now() - interval '10 min', now() + interval '1 hour');

-- 1. Unauthenticated caller ------------------------------------------------
set role anon;
select throws_ok($$ select public.follow_clash('cf-open') $$, '42501', null,
  'guest cannot follow a clash');
reset role;

-- 2. Idempotent follow, one relationship -----------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000f0003')::text, true);
set role authenticated;
select public.follow_clash('cf-open');
select public.follow_clash('cf-open');
reset role;
select is((select count(*)::int from public.clash_follows
            where clash_id='cf-open' and follower_id='cf-fan'), 1,
  'repeat follow creates exactly one relationship');

-- 3. Cross-user isolation (RLS + server-side reads) -------------------------
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000f0004')::text, true);
set role authenticated;
select is((select count(*)::int from public.clash_follows), 0,
  'another user sees none of the follower rows');
select is(public.is_following_clash('cf-open'), false,
  'follow state is caller-scoped');
select is((select count(*)::int from public.followed_clash_ids() where clash_id='cf-open'), 0,
  'followed ids are caller-scoped');
reset role;

-- 4. Cancelled Clash and fixture Take are refused --------------------------
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000f0003')::text, true);
set role authenticated;
select throws_ok($$ select public.follow_clash('cf-cancel') $$, '42501', null,
  'cancelled clash cannot be followed');
select throws_ok($$ select public.follow_clash('cf-fixture-clash') $$, '42501', null,
  'runtime fixture clash cannot be followed');
reset role;

-- 5. Blocked author is refused ---------------------------------------------
insert into public.blocks (blocker_id, blocked_id) values ('cf-author', 'cf-blocked');
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000f0005')::text, true);
set role authenticated;
select throws_ok($$ select public.follow_clash('cf-open') $$, '42501', null,
  'blocked viewer cannot follow');
reset role;

-- 6. Idempotent unfollow ---------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000f0003')::text, true);
set role authenticated;
select public.unfollow_clash('cf-open');
select public.unfollow_clash('cf-open');
select is(public.is_following_clash('cf-open'), false, 'unfollow removes the relationship');
reset role;

-- 7. Verdict delivery: followers once, fighters not duplicated -------------
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000f0003')::text, true);
set role authenticated;
select public.follow_clash('cf-open');
reset role;
-- The challenger also follows their own Clash; the trigger must skip them.
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000f0002')::text, true);
set role authenticated;
select public.follow_clash('cf-open');
reset role;

insert into public.judgements (clash_id, juror_id, side) values
  ('cf-open','cf-fan','A'), ('cf-open','cf-other','A');
update public.clashes set closes_at = now() - interval '1 minute' where id='cf-open';
select public.settle_clash('cf-open');

select is((select count(*)::int from public.notifications
            where recipient_id='cf-fan' and kind='clash_result' and entity_id='cf-open'), 1,
  'follower receives exactly one result notification');
select is((select entity_type::text from public.notifications
            where recipient_id='cf-fan' and kind='clash_result' and entity_id='cf-open'), 'clash',
  'notification destination is the canonical clash');
select is((select count(*)::int from public.notifications
            where recipient_id='cf-challenger' and kind='clash_result' and entity_id='cf-open'), 1,
  'fighter is not double notified');
select is((select count(*)::int from public.notifications
            where recipient_id='cf-author' and kind='clash_result' and entity_id='cf-open'), 1,
  'author is not double notified');

-- 8. Retry safety: a replayed verdict cannot add a second notification -----
insert into public.verdicts
  (clash_id, winner_side, side_a_score, side_b_score, jury_size, agreement, margin, verdict_label)
values ('cf-open','A',2,0,2,1,2,'CLEAR DECISION')
on conflict (clash_id) do nothing;
select is((select count(*)::int from public.notifications
            where recipient_id='cf-fan' and kind='clash_result' and entity_id='cf-open'), 1,
  'replayed verdict cannot duplicate delivery');

-- 9. Draw notifies, and no winner is fabricated ---------------------------
insert into public.clashes (id, take_id, challenger_id, status, opens_at, closes_at) values
  ('cf-draw', 'cf-take', 'cf-challenger', 'open', now() - interval '10 min', now() - interval '1 min');
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000f0003')::text, true);
set role authenticated;
select public.follow_clash('cf-draw');
reset role;
insert into public.verdicts
  (clash_id, winner_side, side_a_score, side_b_score, jury_size, agreement, margin, verdict_label)
values ('cf-draw','DRAW',1,1,2,0.5,0,'DRAW');
select is((select count(*)::int from public.notifications
            where recipient_id='cf-fan' and entity_id='cf-draw' and kind='clash_result'), 1,
  'draw still notifies followers');
select is((select winner_side::text from public.verdicts where clash_id='cf-draw'), 'DRAW',
  'draw keeps DRAW and never fabricates a winner');

-- 10. Unfollow before the verdict receives nothing ------------------------
insert into public.clashes (id, take_id, challenger_id, status, opens_at, closes_at) values
  ('cf-quiet', 'cf-take', 'cf-challenger', 'open', now() - interval '10 min', now() - interval '1 min');
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000f0003')::text, true);
set role authenticated;
select public.follow_clash('cf-quiet');
select public.unfollow_clash('cf-quiet');
reset role;
insert into public.verdicts
  (clash_id, winner_side, side_a_score, side_b_score, jury_size, agreement, margin, verdict_label)
values ('cf-quiet','B',0,2,2,1,2,'CLEAR DECISION');
select is((select count(*)::int from public.notifications where entity_id='cf-quiet'), 0,
  'unfollow before verdict receives nothing');

-- 11. Cancellation writes no verdict, so nothing is announced -------------
select is((select count(*)::int from public.notifications where entity_id='cf-cancel'), 0,
  'cancelled clash produces no result notification');

select finish();
rollback;


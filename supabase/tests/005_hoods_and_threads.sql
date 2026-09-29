-- ============================================================================
-- Hood membership + threaded rebuttals tests (pgTAP).
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

-- Fixtures: author (t-a), actor (t-b), blocked author (t-c).
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');

update public.profiles set id = 't-a', handle = 'hood_a', name = 'Hood A', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set id = 't-b', handle = 'hood_b', name = 'Hood B', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set id = 't-c', handle = 'hood_c', name = 'Hood C', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-00000000000c';

insert into public.takes (id, author_id, hood, text, status, created_at, expires_at) values
  ('t-live',    't-a', 'techtakes', 'live take',    'active',  now(),                     now() + interval '12 hours'),
  ('t-other',   't-a', 'techtakes', 'other take',   'active',  now(),                     now() + interval '12 hours'),
  ('t-expired', 't-a', 'techtakes', 'expired take', 'active',  now() - interval '2 hours', now() - interval '1 hour'),
  ('t-removed', 't-a', 'techtakes', 'removed take', 'removed', now(),                     now() + interval '12 hours'),
  ('t-blocked', 't-c', 'techtakes', 'blocked take', 'active',  now(),                     now() + interval '12 hours');

-- t-b blocks t-c (either-direction block refuses interaction).
insert into public.blocks (blocker_id, blocked_id) values ('t-b', 't-c');

-- schema + privileges
select has_table('public', 'hood_memberships', 'hood_memberships table');
select has_column('public', 'comments', 'parent_comment_id', 'comments has parent_comment_id');
select has_function('public', 'join_hood', 'join_hood exists');
select has_function('public', 'leave_hood', 'leave_hood exists');
select is(has_table_privilege('authenticated', 'public.hood_memberships', 'INSERT'), false, 'no client INSERT on hood_memberships');
select is(has_table_privilege('authenticated', 'public.hood_memberships', 'DELETE'), false, 'no client DELETE on hood_memberships');
select is(has_function_privilege('anon', 'public.join_hood(public.hood_id)', 'EXECUTE'), false, 'anon cannot join a hood');
select is(has_function_privilege('authenticated', 'public.join_hood(public.hood_id)', 'EXECUTE'), true, 'authenticated can join a hood');

-- ── Hood membership ──────────────────────────────────────────────────────────
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.join_hood('techtakes') $$, '42501', null, 'guest cannot join a hood');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select lives_ok($$ select public.join_hood('techtakes') $$, 't-b joins techtakes');
select is((select count(*)::int from public.hood_memberships where hood = 'techtakes' and profile_id = 't-b'), 1, 'membership row created for the caller');
select lives_ok($$ select public.join_hood('techtakes') $$, 'duplicate join is idempotent');
select is((select count(*)::int from public.hood_memberships where hood = 'techtakes' and profile_id = 't-b'), 1, 'still exactly one membership row');
select throws_ok($$ insert into public.hood_memberships (hood, profile_id) values ('techtakes', 't-a') $$, '42501', null, 'client cannot forge another profile membership');
reset role;

-- leave only affects the caller
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select lives_ok($$ select public.join_hood('techtakes') $$, 't-a also joins techtakes');
reset role;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select lives_ok($$ select public.leave_hood('techtakes') $$, 't-b leaves techtakes');
select is((select count(*)::int from public.hood_memberships where hood = 'techtakes' and profile_id = 't-b'), 0, 't-b membership removed');
select is((select count(*)::int from public.hood_memberships where hood = 'techtakes' and profile_id = 't-a'), 1, 't-a membership untouched');
reset role;
select is((select count(*)::int from public.hood_memberships where hood = 'techtakes'), 1, 'member count reflects real rows');

-- ── Threaded rebuttals ───────────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select lives_ok($$ insert into public.comments (id, take_id, author_id, text) values ('c-top', 't-live', 't-b', 'top level reply') $$, 'top-level reply allowed');
select lives_ok($$ insert into public.comments (id, take_id, author_id, text, parent_comment_id) values ('c-reply', 't-live', 't-b', 'nested reply', 'c-top') $$, 'nested reply allowed');
select is((select parent_comment_id from public.comments where id = 'c-reply'), 'c-top', 'parent persisted');

-- parent must exist (FK) and belong to the same take (trigger)
select throws_ok($$ insert into public.comments (id, take_id, author_id, text, parent_comment_id) values ('c-orphan', 't-live', 't-b', 'orphan', 'nope') $$, '23503', null, 'missing parent rejected');
insert into public.comments (id, take_id, author_id, text) values ('c-other', 't-other', 't-b', 'other take reply');
select throws_ok($$ insert into public.comments (id, take_id, author_id, text, parent_comment_id) values ('c-x', 't-live', 't-b', 'cross-take', 'c-other') $$, 'P0007', null, 'cross-take parent rejected');

-- self-parent rejected
reset role;
select throws_ok($$ insert into public.comments (id, take_id, author_id, text, parent_comment_id) values ('c-self', 't-live', 't-a', 'self', 'c-self') $$, '23514', null, 'self-parent rejected');
reset role;

-- client cannot forge author
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok($$ insert into public.comments (id, take_id, author_id, text) values ('c-forge', 't-live', 't-a', 'forged author') $$, '42501', null, 'client cannot forge author');

-- removed/expired takes cannot accept new replies
select throws_ok($$ insert into public.comments (id, take_id, author_id, text) values ('c-expired', 't-expired', 't-b', 'late reply') $$, '42501', null, 'expired take cannot accept replies');
select throws_ok($$ insert into public.comments (id, take_id, author_id, text) values ('c-removed', 't-removed', 't-b', 'late reply') $$, '42501', null, 'removed take cannot accept replies');

-- blocked relationship prevents reply
select throws_ok($$ insert into public.comments (id, take_id, author_id, text) values ('c-blocked', 't-blocked', 't-b', 'blocked reply') $$, 'P0005', null, 'blocked user cannot reply');
reset role;

-- comment rate limit still applies
insert into public.rate_limit_events (actor_id, action, occurred_at)
  select 't-b', 'comment_create', now() from generate_series(1, 10);
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok($$ insert into public.comments (id, take_id, author_id, text) values ('c-limited', 't-live', 't-b', 'rate limited') $$, 'P0001', null, 'comment rate limit enforced');
reset role;

select * from finish();
rollback;

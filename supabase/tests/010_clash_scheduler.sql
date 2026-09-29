-- ============================================================================
-- Scheduler / maintenance tests (pgTAP). Self-contained; run: supabase test db
-- Proves the scheduled maintenance path: due Clashes settle, non-due Clashes are
-- ignored, work is bounded, repeats are idempotent (no duplicate verdicts,
-- reputation or notifications), and the entry point stays server-only.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

-- Fixtures: author, challenger, one juror.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000201'),
  ('00000000-0000-0000-0000-000000000202'),
  ('00000000-0000-0000-0000-000000000203');

update public.profiles set id = 'ts-author', handle = 'ts_author', name = 'TS Author', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000201';
update public.profiles set id = 'ts-chall', handle = 'ts_chall', name = 'TS Chall', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000202';
update public.profiles set id = 'ts-j1', handle = 'ts_j1', name = 'TS J1', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000203';

insert into public.takes (id, author_id, hood, text, status, expires_at) values
  ('ts-take-a',  'ts-author', 'techtakes', 'scheduler take a',  'active', now() + interval '23 hours'),
  ('ts-take-b1', 'ts-author', 'techtakes', 'scheduler take b1', 'active', now() + interval '23 hours'),
  ('ts-take-b2', 'ts-author', 'techtakes', 'scheduler take b2', 'active', now() + interval '23 hours'),
  ('ts-take-c',  'ts-author', 'techtakes', 'scheduler take c',  'active', now() + interval '23 hours');

-- ── schema + entry-point privileges (server-only) ───────────────────────────
select has_function('public', 'run_maintenance', 'run_maintenance exists');
select has_function('public', 'settle_due_clashes', 'settle_due_clashes exists');
select is(has_function_privilege('authenticated', 'public.run_maintenance(integer)', 'EXECUTE'), false, 'authenticated cannot execute run_maintenance');
select is(has_function_privilege('anon', 'public.run_maintenance(integer)', 'EXECUTE'), false, 'anon cannot execute run_maintenance');
select is(has_function_privilege('authenticated', 'public.settle_due_clashes(integer)', 'EXECUTE'), false, 'authenticated cannot execute the batch sweep');
select is(has_function_privilege('service_role', 'public.run_maintenance(integer)', 'EXECUTE'), true, 'service_role can execute run_maintenance');
select is((select count(*)::int from aclexplode((select proacl from pg_proc where oid = 'public.run_maintenance(integer)'::regprocedure)) a where a.grantee = 0), 0, 'PUBLIC has no EXECUTE on run_maintenance');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated"}', true);
select throws_ok($$ select public.run_maintenance(10) $$, '42501', null, 'authenticated call to run_maintenance is denied');
select throws_ok($$ select public.settle_due_clashes(10) $$, '42501', null, 'authenticated call to the batch sweep is denied');
reset role;

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.run_maintenance(10) $$, '42501', null, 'anon call to run_maintenance is denied');
reset role;

-- ── a summary shape, and three Clashes started by the challenger ────────────
select ok(
  (public.run_maintenance(0)) ?& array['clashes_settled', 'takes_expired', 'media', 'rate_limits_pruned'],
  'run_maintenance reports the full maintenance summary'
);

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000202","role":"authenticated"}', true);
select lives_ok($$ select public.start_clash('ts-take-a') $$, 'start clash A');
select lives_ok($$ select public.start_clash('ts-take-b1') $$, 'start clash B1');
select lives_ok($$ select public.start_clash('ts-take-b2') $$, 'start clash B2');
reset role;

-- One live ballot on clash A, then a non-due clash C created directly.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000203","role":"authenticated"}', true);
select lives_ok($$ select public.submit_judgement((select id from public.clashes where take_id = 'ts-take-a'), 'A') $$, 'j1 votes A on clash A');
reset role;

insert into public.clashes (id, take_id, challenger_id, status, opens_at, closes_at)
values ('ts-clash-c', 'ts-take-c', 'ts-chall', 'open', now(), now() + interval '1 hour');

-- ── non-due Clashes are ignored ─────────────────────────────────────────────
select is((public.run_maintenance(10))->>'clashes_settled', '0', 'nothing settles while no Clash is due');
select is((select status::text from public.clashes where id = 'ts-clash-c'), 'open', 'non-due clash C stays open');
select is((select status::text from public.clashes where take_id = 'ts-take-a'), 'open', 'non-due clash A stays open');

-- ── a due Clash settles through the scheduled path ──────────────────────────
update public.clashes set opens_at = now() - interval '2 hours', closes_at = now() - interval '1 hour'
 where take_id = 'ts-take-a';

select is((public.run_maintenance(10))->>'clashes_settled', '1', 'due clash A settles via run_maintenance');
select is((select count(*)::int from public.verdicts where clash_id = (select id from public.clashes where take_id = 'ts-take-a')), 1, 'clash A has exactly one verdict');
select is((select status::text from public.clashes where take_id = 'ts-take-a'), 'settled', 'clash A is settled');

-- ── repeated maintenance is idempotent ──────────────────────────────────────
select is((public.run_maintenance(10))->>'clashes_settled', '0', 're-running maintenance settles nothing new');
select is((select count(*)::int from public.verdicts where clash_id = (select id from public.clashes where take_id = 'ts-take-a')), 1, 'verdict count stays 1');
select is(
  (select count(*)::int from public.reputation_events where clash_id = (select id from public.clashes where take_id = 'ts-take-a')),
  2,
  'reputation ledger does not duplicate'
);
select is(
  (select count(*)::int from public.notifications where entity_id = (select id from public.clashes where take_id = 'ts-take-a')),
  4,
  'notifications do not duplicate'
);

-- ── the batch sweep is bounded by the limit ─────────────────────────────────
update public.clashes set opens_at = now() - interval '2 hours', closes_at = now() - interval '1 hour'
 where take_id in ('ts-take-b1', 'ts-take-b2');

select is(public.settle_due_clashes(1), 1, 'limit 1 processes exactly one due clash');
select is(public.settle_due_clashes(1), 1, 'the next call processes the remaining due clash');
select is(public.settle_due_clashes(1), 0, 'a third call finds nothing due');
select is((select count(*)::int from public.clashes where take_id in ('ts-take-b1', 'ts-take-b2') and status = 'open'), 0, 'both bounded clashes left the open queue');
select is((select status::text from public.clashes where id = 'ts-clash-c'), 'open', 'the non-due clash is never swept');

select * from finish();
rollback;

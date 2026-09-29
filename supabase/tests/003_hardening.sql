-- ============================================================================
-- Production hardening tests (pgTAP): rate limits, duplicates, scheduling,
-- media cleanup, take expiry, and the new privilege surface.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

-- Fixtures: three users and one live take owned by t-c.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');

update public.profiles set id = 't-a', handle = 'user_a', name = 'User A', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set id = 't-b', handle = 'user_b', name = 'User B', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set id = 't-c', handle = 'user_c', name = 'User C', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-00000000000c';

insert into public.takes (id, author_id, hood, text, status, expires_at, created_at)
values ('t-target', 't-c', 'techtakes', 'target take', 'active', now() + interval '24 hours', now());

-- ── schema + privileges ──────────────────────────────────────────────────────
select has_table('public', 'rate_limit_events', 'rate_limit_events table');
select has_function('public', 'assert_rate_limit', 'assert_rate_limit exists');
select has_function('public', 'settle_due_clashes', 'settle_due_clashes exists');
select has_function('public', 'expire_stale_takes', 'expire_stale_takes exists');
select has_function('public', 'cleanup_stale_media', 'cleanup_stale_media exists');
select has_function('public', 'run_maintenance', 'run_maintenance exists');

select is(has_table_privilege('authenticated', 'public.rate_limit_events', 'SELECT'), false, 'clients cannot read rate limit ledger');
select is(has_table_privilege('anon', 'public.rate_limit_events', 'SELECT'), false, 'anon cannot read rate limit ledger');
select is(has_function_privilege('authenticated', 'public.assert_rate_limit(text,text,integer,interval)', 'EXECUTE'), false, 'clients cannot execute assert_rate_limit');
select is(has_function_privilege('authenticated', 'public.run_maintenance(integer)', 'EXECUTE'), false, 'clients cannot execute run_maintenance');
select is(has_function_privilege('authenticated', 'public.expire_stale_takes(integer)', 'EXECUTE'), false, 'clients cannot execute expire_stale_takes');
select is(has_function_privilege('authenticated', 'public.settle_due_clashes(integer)', 'EXECUTE'), false, 'authenticated cannot run the batch scheduler');

-- ── rate limiting: 5 takes/hour, quota per user, anon blocked ───────────────
-- Takes are created through `create_take` (the direct INSERT grant is revoked by
-- migration 0012); the throttle lives on the table, so it still fires.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select lives_ok($$ select public.create_take('techtakes', 'take one') $$, 'take 1 succeeds');
select lives_ok($$ select public.create_take('techtakes', 'take two') $$, 'take 2 succeeds');
select lives_ok($$ select public.create_take('techtakes', 'take three') $$, 'take 3 succeeds');
select lives_ok($$ select public.create_take('techtakes', 'take four') $$, 'take 4 succeeds');
select lives_ok($$ select public.create_take('techtakes', 'take five') $$, 'take 5 succeeds');
select throws_ok($$ select public.create_take('techtakes', 'take six') $$, 'P0001', null, 'sixth take throttled');
reset role;

-- quota isolation: a different user keeps their own bucket
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select lives_ok($$ select public.create_take('techtakes', 'my own take') $$, 'user b unaffected by user a quota');
reset role;

-- unauthenticated actor is rejected and never pollutes the ledger
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ insert into public.takes (id, author_id, hood, text) values ('t-anon', 't-a', 'techtakes', 'anon take') $$, '42501', null, 'anon cannot drop a take');
reset role;
select is((select count(*)::int from public.rate_limit_events where actor_id is null), 0, 'no null-actor rate limit rows');

-- duplicate content guards
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select lives_ok($$ select public.create_take('techtakes', 'duplicate take text') $$, 'first take ok');
select throws_ok($$ select public.create_take('techtakes', 'duplicate take text') $$, 'P0006', null, 'identical take within window rejected');

select lives_ok($$ insert into public.comments (id, take_id, author_id, text) values ('c-b-1', 't-target', 't-b', 'duplicate comment text') $$, 'first comment ok');
select throws_ok($$ insert into public.comments (id, take_id, author_id, text) values ('c-b-2', 't-target', 't-b', 'duplicate comment text') $$, 'P0006', null, 'identical rebuttal within window rejected');
reset role;

-- report duplicate protection remains intact
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select lives_ok($$ select public.submit_report('take', 't-target', 'spam') $$, 'first report ok');
select throws_ok($$ select public.submit_report('take', 't-target', 'spam') $$, 'P0004', null, 'duplicate report rejected');
reset role;

-- ── Clash scheduler seam ─────────────────────────────────────────────────────
-- t-a challenges t-c's live take; t-b casts the only ballot.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select lives_ok($$ select public.start_clash('t-target') $$, 't-a starts a clash');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select lives_ok($$ select public.submit_judgement((select id from public.clashes where take_id = 't-target'), 'A') $$, 't-b votes A');
reset role;

-- not due yet → untouched
select is(public.settle_due_clashes(), 0, 'non-due clash is not settled');
select is((select status::text from public.clashes where take_id = 't-target'), 'open', 'clash still open');

-- advance the clock, then settle via the scheduler
update public.clashes set opens_at = now() - interval '2 hours', closes_at = now() - interval '1 hour' where take_id = 't-target';
select is(public.settle_due_clashes(), 1, 'due clash is settled');
select is((select count(*)::int from public.verdicts where clash_id = (select id from public.clashes where take_id = 't-target')), 1, 'one verdict written');
select is(public.settle_due_clashes(), 0, 're-running the scheduler settles nothing new');

-- ── media orphan cleanup ─────────────────────────────────────────────────────
insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, size_bytes, status, visibility, created_at) values
  ('m-uploading-stale', 't-a', 'public-media', 'ta/up_stale/m.png', 'image', 'image/png', 0, 'uploading', 'public', now() - interval '25 hours'),
  ('m-ready', 't-a', 'public-media', 'ta/ready/m.png', 'image', 'image/png', 0, 'ready', 'public', now() - interval '1 day'),
  ('m-failed-stale', 't-a', 'public-media', 'ta/fail_stale/m.png', 'image', 'image/png', 0, 'failed', 'public', now() - interval '8 days');

select lives_ok($$ select public.cleanup_stale_media() $$, 'cleanup_stale_media runs');
select is((select status::text from public.media_objects where id = 'm-uploading-stale'), 'failed', 'stale uploading marked failed');
select is((select status::text from public.media_objects where id = 'm-ready'), 'ready', 'ready media is never deleted');
select is((select status::text from public.media_objects where id = 'm-failed-stale'), 'deleted', 'stale failed tombstoned');

-- ── take expiry ──────────────────────────────────────────────────────────────
insert into public.takes (id, author_id, hood, text, status, created_at, expires_at) values
  ('t-expired', 't-c', 'techtakes', 'expired take', 'active', now() - interval '2 hours', now() - interval '1 hour'),
  ('t-live', 't-c', 'techtakes', 'live take', 'active', now(), now() + interval '1 hour');

select lives_ok($$ select public.expire_stale_takes() $$, 'expire_stale_takes runs');
select is((select status::text from public.takes where id = 't-expired'), 'expired', 'expired take transitions to expired');
select is((select status::text from public.takes where id = 't-live'), 'active', 'unexpired take stays active');

select * from finish();
rollback;

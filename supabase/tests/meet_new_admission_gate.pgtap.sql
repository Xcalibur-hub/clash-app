-- Phase 6G.1 — executable pgTAP for Meet NEW-admission gate.
-- Requires migration 20261028210000_meet_new_admission_gate applied.
-- Fixtures are created inside this transaction and rolled back at finish.
-- Concurrent cancel/match races: meet_new_admission_concurrency.sql +
-- scripts/meet-admission-postgres-concurrency.cjs (separate connections).

begin;
select plan(50);

-- ── Catalog / policy helpers ─────────────────────────────────────────────────
select has_function('public', 'meet_new_admission_allowed', array[]::text[], 'meet_new_admission_allowed() exists');
select has_function('public', 'assert_meet_new_admission', array[]::text[], 'assert_meet_new_admission() exists');

select ok(
  not public.meet_new_admission_allowed(),
  'policy returns false (NEW admission closed)'
);

select ok(
  not has_function_privilege('anon', 'public.meet_new_admission_allowed()', 'execute'),
  'anon cannot execute meet_new_admission_allowed'
);
select ok(
  not has_function_privilege('authenticated', 'public.meet_new_admission_allowed()', 'execute'),
  'authenticated cannot execute meet_new_admission_allowed'
);
select ok(
  not has_function_privilege('service_role', 'public.meet_new_admission_allowed()', 'execute'),
  'service_role cannot execute meet_new_admission_allowed'
);
select ok(
  not has_function_privilege('anon', 'public.assert_meet_new_admission()', 'execute'),
  'anon cannot execute assert_meet_new_admission'
);
select ok(
  not has_function_privilege('authenticated', 'public.assert_meet_new_admission()', 'execute'),
  'authenticated cannot execute assert_meet_new_admission'
);

select ok(
  not has_function_privilege('anon', 'public.join_meet_queue(public.meet_match_mode, text, public.hood_id, text[], public.meet_channel)', 'execute'),
  'anon cannot execute join_meet_queue'
);
select ok(
  has_function_privilege('authenticated', 'public.join_meet_queue(public.meet_match_mode, text, public.hood_id, text[], public.meet_channel)', 'execute'),
  'authenticated retains join_meet_queue EXECUTE (server raises)'
);
select ok(
  not has_function_privilege('anon', 'public.poll_meet_queue()', 'execute'),
  'anon cannot execute poll_meet_queue'
);
select ok(
  has_function_privilege('authenticated', 'public.poll_meet_queue()', 'execute'),
  'authenticated retains poll_meet_queue EXECUTE'
);
select ok(
  not has_function_privilege('anon', 'public.next_meet(text, public.meet_match_mode, text, public.hood_id, text[], public.meet_channel)', 'execute'),
  'anon cannot execute next_meet'
);
select ok(
  has_function_privilege('authenticated', 'public.next_meet(text, public.meet_match_mode, text, public.hood_id, text[], public.meet_channel)', 'execute'),
  'authenticated retains next_meet EXECUTE (server raises before leave)'
);
select ok(
  not has_function_privilege('authenticated', 'public.try_meet_match(text)', 'execute'),
  'authenticated cannot execute try_meet_match'
);
select ok(
  not has_function_privilege('authenticated', 'public.meet_create_session(text, text, public.meet_match_mode, text, public.hood_id, text, public.meet_channel)', 'execute'),
  'authenticated cannot execute meet_create_session'
);

select hasnt_function(
  'public', 'join_meet_queue', array['meet_match_mode','text','hood_id','text[]'],
  'legacy join_meet_queue without channel is absent'
);
select hasnt_function(
  'public', 'next_meet', array['text','meet_match_mode','text','hood_id','text[]'],
  'legacy next_meet without channel is absent'
);

select has_function('public', 'cancel_meet_search', array['text'], 'cancel_meet_search intact');
select has_function('public', 'leave_meet_queue', array[]::text[], 'leave_meet_queue intact');
select has_function('public', 'leave_meet_session', array['text', 'text'], 'leave_meet_session intact');
select has_function('public', 'report_meet_session', array['text', 'report_reason', 'text'], 'report_meet_session intact');
select has_function('public', 'block_meet_peer', array['text'], 'block_meet_peer intact');

select ok(
  has_function_privilege('authenticated', 'public.cancel_meet_search(text)', 'execute'),
  'authenticated can cancel_meet_search'
);

select ok(
  not has_table_privilege('authenticated', 'public.meet_queue', 'insert'),
  'authenticated cannot INSERT meet_queue'
);
select ok(
  not has_table_privilege('authenticated', 'public.meet_sessions', 'insert'),
  'authenticated cannot INSERT meet_sessions'
);
select ok(
  not has_table_privilege('authenticated', 'public.meet_participants', 'insert'),
  'authenticated cannot INSERT meet_participants'
);

-- ── Fixtures ────────────────────────────────────────────────────────────────
create temporary table _6g1_ids (
  auth_a uuid, auth_b uuid,
  profile_a text, profile_b text
);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa6a', 'authenticated', 'authenticated', 'a6g1@example.invalid', extensions.crypt('x', extensions.gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb6b', 'authenticated', 'authenticated', 'b6g1@example.invalid', extensions.crypt('x', extensions.gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles set handle = 'p6g1_a', name = 'SixG One A'
 where auth_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa6a';
update public.profiles set handle = 'p6g1_b', name = 'SixG One B'
 where auth_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb6b';

insert into _6g1_ids
select
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa6a'::uuid,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb6b'::uuid,
  (select id from public.profiles where auth_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa6a'),
  (select id from public.profiles where auth_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb6b');

create or replace function pg_temp.as_user(p_auth uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_auth::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_auth::text, 'role', 'authenticated')::text, true);
end;
$$;

create temporary table _6g1_counts as
select
  (select count(*) from public.meet_queue) as queues,
  (select count(*) from public.meet_sessions) as sessions,
  (select count(*) from public.meet_participants) as participants;

-- ── Anonymous admission denial ───────────────────────────────────────────────
select throws_ok(
  $$select public.join_meet_queue('ANYWHERE'::public.meet_match_mode, null, null, '{}'::text[], 'TEXT'::public.meet_channel)$$,
  '42501',
  'sign in to meet',
  'anonymous join denied (no JWT)'
);

-- ── Authenticated NEW admission denial (TEXT + VIDEO) ────────────────────────
select lives_ok(
  format($f$select pg_temp.as_user(%L::uuid)$f$, (select auth_a from _6g1_ids)),
  'set jwt for profile A'
);

select throws_ok(
  $$select public.join_meet_queue('ANYWHERE'::public.meet_match_mode, null, null, '{}'::text[], 'TEXT'::public.meet_channel)$$,
  'P0006',
  'meet admission deferred for the text-debate beta',
  'authenticated TEXT join raises admission deferred'
);

insert into public.meet_video_acks (profile_id)
values ((select profile_a from _6g1_ids))
on conflict (profile_id) do update set acknowledged_at = now();

select throws_ok(
  $$select public.join_meet_queue('ANYWHERE'::public.meet_match_mode, null, null, '{}'::text[], 'VIDEO'::public.meet_channel)$$,
  'P0006',
  'meet admission deferred for the text-debate beta',
  'authenticated VIDEO join raises admission deferred after ack'
);

select ok(
  (select count(*) from public.meet_queue) = (select queues from _6g1_counts),
  'denied join left no new meet_queue row'
);
select ok(
  (select count(*) from public.meet_sessions) = (select sessions from _6g1_counts),
  'denied join left no new meet_sessions row'
);
select ok(
  (select count(*) from public.meet_participants) = (select participants from _6g1_counts),
  'denied join left no new meet_participants row'
);

-- ── Poll without waiting: no match, no writes ────────────────────────────────
select is(
  public.poll_meet_queue() ->> 'matched',
  'false',
  'poll with no waiting returns unmatched'
);
select ok(
  (select count(*) from public.meet_sessions) = (select sessions from _6g1_counts),
  'poll without waiting creates no session'
);

-- ── Pre-seeded waiting + poll-triggered matcher cannot create ────────────────
insert into public.meet_queue (id, profile_id, mode, channel, status, queued_at)
values
  ('mq_6g1_wait_a', (select profile_a from _6g1_ids), 'ANYWHERE', 'TEXT', 'waiting', now() - interval '2 minutes'),
  ('mq_6g1_wait_b', (select profile_b from _6g1_ids), 'ANYWHERE', 'TEXT', 'waiting', now() - interval '1 minute');

select is(
  public.try_meet_match('mq_6g1_wait_a') ->> 'matched',
  'false',
  'try_meet_match refuses NEW match under gate'
);
select is(
  public.try_meet_match('mq_6g1_wait_a') ->> 'reason',
  'admission_deferred',
  'try_meet_match reason is admission_deferred'
);

select lives_ok(
  format($f$select pg_temp.as_user(%L::uuid)$f$, (select auth_a from _6g1_ids)),
  'jwt A for poll'
);
select is(
  public.poll_meet_queue() ->> 'matched',
  'false',
  'poll-triggered match attempt does not create session'
);
select is(
  (select count(*) from public.meet_sessions),
  (select sessions from _6g1_counts),
  'session count unchanged after poll/match denial'
);
select is(
  (select status::text from public.meet_queue where id = 'mq_6g1_wait_a'),
  'waiting',
  'denied match leaves waiting row for cancel/drain'
);

-- ── Cancel preserves exit for leftover waiting ───────────────────────────────
select is(
  public.cancel_meet_search('mq_6g1_wait_a') ->> 'outcome',
  'cancelled_waiting',
  'cancel_meet_search cancels leftover waiting under gate'
);

-- ── Existing session: continue read + leave / next fence / report ────────────
insert into public.meet_sessions (id, mode, channel, status, created_at, expires_at)
values ('ms_6g1_active', 'ANYWHERE', 'TEXT', 'active', now(), now() + interval '20 minutes');
insert into public.meet_participants (session_id, profile_id, seat, alias, joined_at)
values
  ('ms_6g1_active', (select profile_a from _6g1_ids), 'A', 'Stranger A', now()),
  ('ms_6g1_active', (select profile_b from _6g1_ids), 'B', 'Stranger B', now());

select lives_ok(
  format($f$select pg_temp.as_user(%L::uuid)$f$, (select auth_a from _6g1_ids)),
  'jwt A for alreadyActive'
);
select is(
  public.join_meet_queue('ANYWHERE'::public.meet_match_mode, null, null, '{}'::text[], 'TEXT'::public.meet_channel) ->> 'alreadyActive',
  'true',
  'join returns alreadyActive for existing authorized session'
);

select throws_ok(
  $$select public.next_meet('ms_6g1_active', 'ANYWHERE'::public.meet_match_mode, null, null, '{}'::text[], 'TEXT'::public.meet_channel)$$,
  'P0006',
  'meet admission deferred for the text-debate beta',
  'next_meet raises before leave (session preserved)'
);
select is(
  (select status::text from public.meet_sessions where id = 'ms_6g1_active'),
  'active',
  'denied next_meet does not end existing session'
);

select lives_ok(
  $$select public.leave_meet_session('ms_6g1_active', 'leave')$$,
  'leave_meet_session still works under gate'
);

insert into public.meet_sessions (id, mode, channel, status, created_at, expires_at, ended_at, end_reason)
values ('ms_6g1_report', 'ANYWHERE', 'TEXT', 'ended', now() - interval '5 minutes', now() + interval '1 minute', now(), 'leave');
insert into public.meet_participants (session_id, profile_id, seat, alias, joined_at, left_at)
values
  ('ms_6g1_report', (select profile_a from _6g1_ids), 'A', 'Stranger A', now() - interval '5 minutes', now()),
  ('ms_6g1_report', (select profile_b from _6g1_ids), 'B', 'Stranger B', now() - interval '5 minutes', now());

select lives_ok(
  format($f$select pg_temp.as_user(%L::uuid)$f$, (select auth_a from _6g1_ids)),
  'jwt A for report'
);
select lives_ok(
  $$select public.report_meet_session('ms_6g1_report', 'harassment'::public.report_reason, '6g1 gate report')$$,
  'report_meet_session preserved under admission gate'
);

select finish();
rollback;

-- Phase 6F.5 — executable pgTAP for cancel_meet_search on an isolated disposable DB.
-- Fixtures are created inside this transaction and rolled back at finish.
-- Concurrent lock-order cases live in meet_cancel_search_concurrency.sql (separate connections).

begin;
select plan(33);

-- ── Catalog / security ──────────────────────────────────────────────────────
select has_function('public', 'cancel_meet_search', array['text'], 'cancel_meet_search(text) exists');

select ok(
  not has_function_privilege('anon', 'public.cancel_meet_search(text)', 'execute'),
  'anon cannot execute cancel_meet_search'
);

select ok(
  has_function_privilege('authenticated', 'public.cancel_meet_search(text)', 'execute'),
  'authenticated can execute cancel_meet_search'
);

select ok(
  not has_function_privilege('public', 'public.cancel_meet_search(text)', 'execute'),
  'PUBLIC role cannot execute cancel_meet_search'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.cancel_meet_search(text)'::regprocedure),
  'cancel_meet_search is SECURITY DEFINER'
);

select is(
  (select proconfig from pg_proc where oid = 'public.cancel_meet_search(text)'::regprocedure),
  array['search_path=""'],
  'cancel_meet_search pins empty search_path'
);

select ok(
  -- Comments may name the matcher; reject only callable forms.
  lower(pg_get_functiondef('public.cancel_meet_search(text)'::regprocedure)) !~ 'public\.try_meet_match\s*\('
  and lower(pg_get_functiondef('public.cancel_meet_search(text)'::regprocedure)) !~ 'public\.join_meet_queue\s*\('
  and lower(pg_get_functiondef('public.cancel_meet_search(text)'::regprocedure)) !~ 'public\.poll_meet_queue\s*\('
  and lower(pg_get_functiondef('public.cancel_meet_search(text)'::regprocedure)) !~ 'perform\s+try_meet_match\s*\('
  and lower(pg_get_functiondef('public.cancel_meet_search(text)'::regprocedure)) !~ ':=\s*try_meet_match\s*\(',
  'definition does not invoke match/join/poll helpers'
);

select ok(
  position('for update' in lower(pg_get_functiondef('public.cancel_meet_search(text)'::regprocedure))) > 0,
  'definition uses FOR UPDATE'
);

-- Existing Meet exit signatures remain.
select has_function('public', 'leave_meet_queue', array[]::text[], 'leave_meet_queue() intact');
select has_function('public', 'leave_meet_session', array['text', 'text'], 'leave_meet_session(text,text) intact');
select has_function('public', 'report_meet_session', array['text', 'report_reason', 'text'], 'report_meet_session intact');
select has_function('public', 'block_meet_peer', array['text'], 'block_meet_peer intact');

-- ── Disposable fixtures (rolled back) ───────────────────────────────────────
create temporary table _6f5_ids (
  auth_a uuid, auth_b uuid, auth_c uuid,
  profile_a text, profile_b text, profile_c text
);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'authenticated', 'authenticated', 'a6f5@example.invalid', extensions.crypt('x', extensions.gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'authenticated', 'authenticated', 'b6f5@example.invalid', extensions.crypt('x', extensions.gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'authenticated', 'authenticated', 'c6f5@example.invalid', extensions.crypt('x', extensions.gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- Auth profile trigger may already create rows on auth.users insert — adopt those ids.
update public.profiles
   set handle = 'p6f5_a', name = 'SixF Five A'
 where auth_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
update public.profiles
   set handle = 'p6f5_b', name = 'SixF Five B'
 where auth_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';
update public.profiles
   set handle = 'p6f5_c', name = 'SixF Five C'
 where auth_user_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc3';

insert into _6f5_ids
select
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'::uuid,
  'cccccccc-cccc-cccc-cccc-ccccccccccc3'::uuid,
  (select id from public.profiles where auth_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'),
  (select id from public.profiles where auth_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'),
  (select id from public.profiles where auth_user_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc3');

create or replace function pg_temp.as_user(p_auth uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_auth::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_auth::text, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.clear_user() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function pg_temp.pid(which text) returns text
language sql stable as $$
  select case which
    when 'a' then profile_a
    when 'b' then profile_b
    when 'c' then profile_c
  end from _6f5_ids limit 1;
$$;

-- Snapshot counters before cancel exercises.
create temporary table _6f5_counts as
select
  (select count(*) from public.meet_queue) as queues,
  (select count(*) from public.meet_sessions) as sessions,
  (select count(*) from public.meet_participants) as participants;

-- 1) Waiting cancellation
insert into public.meet_queue (id, profile_id, mode, channel, status)
values ('mq_6f5_wait', pg_temp.pid('a'), 'ANYWHERE', 'TEXT', 'waiting');

select pg_temp.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');
select is(
  public.cancel_meet_search('mq_6f5_wait') ->> 'outcome',
  'cancelled_waiting',
  'waiting cancel returns cancelled_waiting'
);
select is(
  (select status::text from public.meet_queue where id = 'mq_6f5_wait'),
  'cancelled',
  'waiting row becomes cancelled'
);

-- 2) Repeated cancel / idempotency
select is(
  public.cancel_meet_search('mq_6f5_wait') ->> 'outcome',
  'already_terminal',
  'repeated cancel is already_terminal'
);
select ok(
  (public.cancel_meet_search('mq_6f5_wait') ->> 'resolved')::boolean,
  'repeated cancel remains resolved'
);

-- 3) Match completed immediately before cancel
select pg_temp.clear_user();
insert into public.meet_sessions (id, mode, channel, status, expires_at)
values ('ms_6f5_pre', 'ANYWHERE', 'TEXT', 'active', now() + interval '2 minutes');
insert into public.meet_participants (session_id, profile_id, seat, alias)
values
  ('ms_6f5_pre', pg_temp.pid('a'), 'A', 'Alpha'),
  ('ms_6f5_pre', pg_temp.pid('b'), 'B', 'Bravo');
insert into public.meet_queue (id, profile_id, mode, channel, status, matched_session_id)
values
  ('mq_6f5_pre_a', pg_temp.pid('a'), 'ANYWHERE', 'TEXT', 'matched', 'ms_6f5_pre'),
  ('mq_6f5_pre_b', pg_temp.pid('b'), 'ANYWHERE', 'TEXT', 'matched', 'ms_6f5_pre');

select pg_temp.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');
select is(
  public.cancel_meet_search('mq_6f5_pre_a') ->> 'outcome',
  'ended_session',
  'matched-before-cancel returns ended_session'
);
select is(
  (select status::text from public.meet_sessions where id = 'ms_6f5_pre'),
  'ended',
  'linked session ended'
);
select is(
  (select end_reason from public.meet_sessions where id = 'ms_6f5_pre'),
  'cancel',
  'end_reason is cancel'
);
select is(
  (select status::text from public.meet_queue where id = 'mq_6f5_pre_a'),
  'cancelled',
  'caller queue fenced to cancelled'
);
select ok(
  (select left_at is not null from public.meet_participants where session_id = 'ms_6f5_pre' and profile_id = pg_temp.pid('b')),
  'peer participant marked left when session ended'
);

-- 4) Foreign / missing indistinguishability
select is(
  public.cancel_meet_search('mq_6f5_pre_b') ->> 'outcome',
  'not_found',
  'foreign owned queue returns not_found'
);
select is(
  public.cancel_meet_search('mq_does_not_exist') ->> 'outcome',
  'not_found',
  'missing queue returns not_found'
);
select is(
  (public.cancel_meet_search('mq_does_not_exist') ->> 'resolved')::boolean,
  false,
  'not_found is unresolved'
);

-- 5) Empty queue id
select throws_ok(
  $$select public.cancel_meet_search('')$$,
  '22023',
  'queue id required',
  'empty queue id raises 22023'
);

-- 6) Unrelated newer search must not be affected (one waiting + one prior cancelled id)
select pg_temp.clear_user();
insert into public.meet_queue (id, profile_id, mode, channel, status)
values ('mq_6f5_old', pg_temp.pid('a'), 'ANYWHERE', 'TEXT', 'cancelled');
insert into public.meet_queue (id, profile_id, mode, channel, status)
values ('mq_6f5_newer', pg_temp.pid('a'), 'ANYWHERE', 'TEXT', 'waiting');
select pg_temp.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');
select is(
  public.cancel_meet_search('mq_6f5_old') ->> 'outcome',
  'already_terminal',
  'cancelling older terminal search is idempotent'
);
select is(
  (select status::text from public.meet_queue where id = 'mq_6f5_newer'),
  'waiting',
  'unrelated newer waiting search untouched'
);

-- 7) Cancel creates no new queue/session/participant beyond fixture inserts
select pg_temp.clear_user();
select ok(
  (select count(*) from public.meet_queue) >= (select queues from _6f5_counts),
  'queue count did not shrink unexpectedly through cancel-only paths'
);
select ok(
  not exists (
    select 1 from public.meet_sessions
     where id not in ('ms_6f5_pre')
       and created_at > now() - interval '5 minutes'
       and end_reason is distinct from 'cancel'
       and status = 'active'
       and mode = 'ANYWHERE'
  ),
  'cancel path did not leave unexpected active sessions from matching'
);

-- 8) Forced failure / rollback: cancel effects do not partially commit across outer rollback
savepoint before_partial;
insert into public.meet_queue (id, profile_id, mode, channel, status)
values ('mq_6f5_rb', pg_temp.pid('c'), 'ANYWHERE', 'TEXT', 'waiting');
select pg_temp.as_user('cccccccc-cccc-cccc-cccc-ccccccccccc3');
select public.cancel_meet_search('mq_6f5_rb');
select is(
  (select status::text from public.meet_queue where id = 'mq_6f5_rb'),
  'cancelled',
  'pre-rollback cancel mutated waiting row'
);
rollback to savepoint before_partial;
select ok(
  not exists (select 1 from public.meet_queue where id = 'mq_6f5_rb'),
  'outer savepoint rollback removes cancel effects with the fixture'
);

-- 9) Leave/report remain callable shapes (authorization may require real session context)
select pg_temp.clear_user();
select ok(
  to_regprocedure('public.leave_meet_session(text,text)') is not null
  and to_regprocedure('public.report_meet_session(text,report_reason,text)') is not null
  and to_regprocedure('public.block_meet_peer(text)') is not null
  and to_regprocedure('public.leave_meet_queue()') is not null,
  'Leave/report/block/leave_queue contracts remain registered'
);

-- 10) No table grants for authenticated direct writers on meet_queue
select ok(
  not has_table_privilege('authenticated', 'public.meet_queue', 'SELECT')
  and not has_table_privilege('authenticated', 'public.meet_queue', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.meet_sessions', 'SELECT'),
  'authenticated has no direct meet_queue/session table privileges'
);

select * from finish();
rollback;

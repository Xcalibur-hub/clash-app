-- ============================================================================
-- Phase 14.2 — Meet the World text matching (pgTAP)
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

select has_function('public', 'join_meet_queue', 'join_meet_queue exists');
select has_function('public', 'poll_meet_queue', 'poll_meet_queue exists');
select has_function('public', 'leave_meet_queue', 'leave_meet_queue exists');
select has_function('public', 'get_meet_session', 'get_meet_session exists');
select has_function('public', 'send_meet_message', 'send_meet_message exists');
select has_function('public', 'list_meet_messages', 'list_meet_messages exists');
select has_function('public', 'leave_meet_session', 'leave_meet_session exists');
select has_function('public', 'next_meet', 'next_meet exists');
select has_function('public', 'block_meet_peer', 'block_meet_peer exists');
select has_function('public', 'report_meet_session', 'report_meet_session exists');

select has_table('public', 'meet_queue', 'meet_queue table');
select has_table('public', 'meet_sessions', 'meet_sessions table');
select has_table('public', 'meet_participants', 'meet_participants table');
select has_table('public', 'meet_messages', 'meet_messages table');
select has_table('public', 'meet_recent_matches', 'meet_recent_matches table');

select is(
  has_table_privilege('authenticated', 'public.meet_queue', 'SELECT'),
  false,
  'clients cannot select meet_queue'
);
select is(
  has_table_privilege('authenticated', 'public.meet_messages', 'SELECT'),
  false,
  'clients cannot select meet_messages directly'
);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000a101'),
  ('00000000-0000-0000-0000-00000000a102'),
  ('00000000-0000-0000-0000-00000000a103'),
  ('00000000-0000-0000-0000-00000000a104');

update public.profiles set id = 'meet-a', handle = 'meet_a', name = 'Meet A',
       public_country_code = 'IN'
 where auth_user_id = '00000000-0000-0000-0000-00000000a101';
update public.profiles set id = 'meet-b', handle = 'meet_b', name = 'Meet B',
       public_country_code = 'IN'
 where auth_user_id = '00000000-0000-0000-0000-00000000a102';
update public.profiles set id = 'meet-c', handle = 'meet_c', name = 'Meet C',
       public_country_code = 'JP'
 where auth_user_id = '00000000-0000-0000-0000-00000000a103';
update public.profiles set id = 'meet-d', handle = 'meet_d', name = 'Meet D',
       public_country_code = 'US'
 where auth_user_id = '00000000-0000-0000-0000-00000000a104';

-- ── ANYWHERE match ───────────────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a101', 'role', 'authenticated')::text,
  true
);

select ok(
  (public.join_meet_queue('ANYWHERE') ->> 'queued')::boolean,
  'A queues anywhere'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a102', 'role', 'authenticated')::text,
  true
);

select ok(
  (select set_config(
     'test.session_ab',
     public.join_meet_queue('ANYWHERE') -> 'session' ->> 'sessionId',
     true
   ) is not null),
  'B matches A anywhere'
);

select ok(
  (public.join_meet_queue('ANYWHERE') ->> 'alreadyActive')::boolean,
  'already-active user gets alreadyActive payload'
);

select ok(
  (public.get_meet_session(current_setting('test.session_ab')) ->> 'peerAlias') is not null,
  'session payload exposes peer alias'
);

select is(
  (public.get_meet_session(current_setting('test.session_ab')) ? 'peerProfileId'),
  false,
  'session payload never exposes peer profile id'
);

reset role;
select set_config('request.jwt.claims', null, true);
select is(
  (select count(*)::integer from public.meet_participants
    where profile_id = 'meet-b' and left_at is null),
  1,
  'one active participation for B'
);

select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a102', 'role', 'authenticated')::text,
  true
);

select ok(
  (public.send_meet_message(current_setting('test.session_ab'), 'hello stranger')
    ->> 'mine')::boolean,
  'participant can send message'
);

select throws_ok(
  $$select public.send_meet_message(current_setting('test.session_ab'), 'hello stranger')$$,
  'P0006',
  null,
  'duplicate message within window rejected'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a103', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$select public.send_meet_message(current_setting('test.session_ab'), 'intruder')$$,
  '42501',
  null,
  'non-participant cannot send'
);

select throws_ok(
  $$select public.list_meet_messages(current_setting('test.session_ab'), 10, null)$$,
  '42501',
  null,
  'non-participant cannot list messages'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a101', 'role', 'authenticated')::text,
  true
);

select ok(
  (public.leave_meet_session(current_setting('test.session_ab'), 'leave') ->> 'left')::boolean,
  'A leaves session'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a102', 'role', 'authenticated')::text,
  true
);

select is(
  public.get_meet_session(current_setting('test.session_ab')) ->> 'status',
  'ended',
  'peer sees ended session after leave'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a101', 'role', 'authenticated')::text,
  true
);
select ok((public.join_meet_queue('ANYWHERE') ->> 'queued')::boolean, 'A requeues after leave');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a102', 'role', 'authenticated')::text,
  true
);
select ok(
  coalesce((public.join_meet_queue('ANYWHERE') ->> 'matched')::boolean, false) = false,
  'recent pair not rematched immediately'
);
select lives_ok($$select public.leave_meet_queue()$$, 'B leaves queue if waiting');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a103', 'role', 'authenticated')::text,
  true
);
select ok(
  (select set_config(
     'test.session_ac',
     public.join_meet_queue('ANYWHERE') -> 'session' ->> 'sessionId',
     true
   ) is not null),
  'C matches A (not recent pair)'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a101', 'role', 'authenticated')::text,
  true
);
select lives_ok(
  $$select public.leave_meet_session(current_setting('test.session_ac'), 'leave')$$,
  'A leaves after AC match'
);

reset role;
select set_config('request.jwt.claims', null, true);
delete from public.meet_recent_matches
 where profile_id in ('meet-a','meet-b','meet-c','meet-d')
    or other_profile_id in ('meet-a','meet-b','meet-c','meet-d');
update public.meet_sessions set status = 'ended', ended_at = coalesce(ended_at, now())
 where status = 'active';
update public.meet_participants set left_at = coalesce(left_at, now()) where left_at is null;
update public.meet_queue set status = 'cancelled' where status = 'waiting';

select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a101', 'role', 'authenticated')::text,
  true
);
select ok(
  (public.join_meet_queue('COUNTRY', 'IN') ->> 'queued')::boolean,
  'A queues COUNTRY IN'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a103', 'role', 'authenticated')::text,
  true
);
select ok(
  (public.join_meet_queue('COUNTRY', 'JP') ->> 'queued')::boolean,
  'C queues COUNTRY JP — no match with IN'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a102', 'role', 'authenticated')::text,
  true
);
select ok(
  (public.join_meet_queue('COUNTRY', 'IN') ->> 'matched')::boolean,
  'B matches A on COUNTRY IN'
);

reset role;
select set_config('request.jwt.claims', null, true);
delete from public.meet_recent_matches
 where profile_id in ('meet-a','meet-b','meet-c','meet-d')
    or other_profile_id in ('meet-a','meet-b','meet-c','meet-d');
update public.meet_sessions set status = 'ended', ended_at = coalesce(ended_at, now())
 where status = 'active';
update public.meet_participants set left_at = coalesce(left_at, now()) where left_at is null;
update public.meet_queue set status = 'cancelled' where status = 'waiting';

select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a101', 'role', 'authenticated')::text,
  true
);
select ok(
  (public.join_meet_queue('INTERESTS', null, null, array['Music','Movies']) ->> 'queued')::boolean,
  'A queues INTERESTS'
);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a102', 'role', 'authenticated')::text,
  true
);
select ok(
  (select set_config(
     'test.session_interest',
     public.join_meet_queue('INTERESTS', null, null, array['Music','Tech'])
       -> 'session' ->> 'sessionId',
     true
   ) is not null),
  'B matches A on shared Music'
);

select is(
  public.get_meet_session(current_setting('test.session_interest')) ->> 'sharedInterest',
  'Music',
  'shared interest surfaced'
);

reset role;
select set_config('request.jwt.claims', null, true);
delete from public.meet_recent_matches
 where profile_id in ('meet-a','meet-b','meet-c','meet-d')
    or other_profile_id in ('meet-a','meet-b','meet-c','meet-d');
update public.meet_sessions set status = 'ended', ended_at = coalesce(ended_at, now())
 where status = 'active';
update public.meet_participants set left_at = coalesce(left_at, now()) where left_at is null;
update public.meet_queue set status = 'cancelled' where status = 'waiting';

select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a101', 'role', 'authenticated')::text,
  true
);
select lives_ok($$select public.join_hood('techtakes')$$, 'A joins techtakes');
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a102', 'role', 'authenticated')::text,
  true
);
select lives_ok($$select public.join_hood('techtakes')$$, 'B joins techtakes');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a101', 'role', 'authenticated')::text,
  true
);
select ok(
  (public.join_meet_queue('HOOD', null, 'techtakes') ->> 'queued')::boolean,
  'A queues HOOD'
);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a102', 'role', 'authenticated')::text,
  true
);
select ok(
  (select set_config(
     'test.session_hood',
     public.join_meet_queue('HOOD', null, 'techtakes') -> 'session' ->> 'sessionId',
     true
   ) is not null),
  'B matches A on HOOD'
);

select ok(
  (public.block_meet_peer(current_setting('test.session_hood')) ->> 'blocked')::boolean,
  'B blocks A'
);

reset role;
select set_config('request.jwt.claims', null, true);
delete from public.meet_recent_matches
 where profile_id in ('meet-a','meet-b')
    or other_profile_id in ('meet-a','meet-b');
update public.meet_queue set status = 'cancelled' where status = 'waiting';

select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a101', 'role', 'authenticated')::text,
  true
);
select ok((public.join_meet_queue('ANYWHERE') ->> 'queued')::boolean, 'A queues after block');
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a102', 'role', 'authenticated')::text,
  true
);
select ok(
  coalesce((public.join_meet_queue('ANYWHERE') ->> 'matched')::boolean, false) = false,
  'blocked pair never rematches'
);
select lives_ok($$select public.leave_meet_queue()$$, 'B leaves queue after block miss');

reset role;
select set_config('request.jwt.claims', null, true);
delete from public.blocks where blocker_id = 'meet-b' and blocked_id = 'meet-a';
delete from public.meet_recent_matches
 where profile_id in ('meet-a','meet-d') or other_profile_id in ('meet-a','meet-d');
update public.meet_queue set status = 'cancelled' where status = 'waiting';
update public.meet_sessions set status = 'ended', ended_at = coalesce(ended_at, now())
 where status = 'active';
update public.meet_participants set left_at = coalesce(left_at, now()) where left_at is null;

select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a101', 'role', 'authenticated')::text,
  true
);
select lives_ok($$select public.leave_meet_queue()$$, 'A leave prior queue');
select ok((public.join_meet_queue('ANYWHERE') ->> 'queued')::boolean, 'A queues for report test');
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000a104', 'role', 'authenticated')::text,
  true
);
select ok(
  (select set_config(
     'test.session_ad',
     public.join_meet_queue('ANYWHERE') -> 'session' ->> 'sessionId',
     true
   ) is not null),
  'D matches A'
);

select ok(
  (public.report_meet_session(
     current_setting('test.session_ad'),
     'harassment',
     'test report'
   ) ->> 'reported')::boolean,
  'report associates meet session'
);

select ok(
  (public.next_meet(current_setting('test.session_ad'), 'ANYWHERE') ? 'queued'),
  'next_meet returns queue state'
);

select finish();
rollback;

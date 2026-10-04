-- ============================================================================
-- Phase 14.3 — Meet VIDEO channel + signaling (pgTAP)
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

select has_function('public', 'can_use_video_meet', 'can_use_video_meet exists');
select has_function('public', 'publish_meet_signal', 'publish_meet_signal exists');
select has_function('public', 'list_meet_signals', 'list_meet_signals exists');
select has_function('public', 'get_meet_ice_servers', 'get_meet_ice_servers exists');
select has_table('public', 'meet_signals', 'meet_signals table');

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000b201'),
  ('00000000-0000-0000-0000-00000000b202'),
  ('00000000-0000-0000-0000-00000000b203');

update public.profiles set id = 'vid-a', handle = 'vid_a', name = 'Vid A'
 where auth_user_id = '00000000-0000-0000-0000-00000000b201';
update public.profiles set id = 'vid-b', handle = 'vid_b', name = 'Vid B'
 where auth_user_id = '00000000-0000-0000-0000-00000000b202';
update public.profiles set id = 'vid-c', handle = 'vid_c', name = 'Vid C'
 where auth_user_id = '00000000-0000-0000-0000-00000000b203';

select ok(public.can_use_video_meet('vid-a'), 'authenticated profile is video-eligible hook');

-- TEXT cannot match VIDEO
select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000b201', 'role', 'authenticated')::text,
  true
);
select lives_ok($$select public.ack_meet_video_safety()$$, 'A acks video safety');
select ok((public.join_meet_queue('ANYWHERE', null, null, '{}', 'TEXT') ->> 'queued')::boolean, 'A queues TEXT');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000b202', 'role', 'authenticated')::text,
  true
);
select lives_ok($$select public.ack_meet_video_safety()$$, 'B acks video safety');
select ok(
  coalesce((public.join_meet_queue('ANYWHERE', null, null, '{}', 'VIDEO') ->> 'matched')::boolean, false) = false,
  'VIDEO does not match waiting TEXT'
);
select lives_ok($$select public.leave_meet_queue()$$, 'B leaves video queue');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000b201', 'role', 'authenticated')::text,
  true
);
select lives_ok($$select public.leave_meet_queue()$$, 'A leaves text queue');

-- VIDEO matches VIDEO
select ok((public.join_meet_queue('ANYWHERE', null, null, '{}', 'VIDEO') ->> 'queued')::boolean, 'A queues VIDEO');
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000b202', 'role', 'authenticated')::text,
  true
);
select ok(
  (select set_config(
     'test.vid_session',
     public.join_meet_queue('ANYWHERE', null, null, '{}', 'VIDEO') -> 'session' ->> 'sessionId',
     true
   ) is not null),
  'B matches A on VIDEO'
);

select is(
  public.get_meet_session(current_setting('test.vid_session')) ->> 'channel',
  'VIDEO',
  'session channel is VIDEO'
);

select ok(
  (public.get_meet_session(current_setting('test.vid_session')) ->> 'isOfferer')::boolean
  or not (public.get_meet_session(current_setting('test.vid_session')) ->> 'isOfferer')::boolean,
  'offerer flag present for one peer'
);

-- A queued first → A is offerer (seat A)
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000b201', 'role', 'authenticated')::text,
  true
);
select ok(
  (public.get_meet_session(current_setting('test.vid_session')) ->> 'isOfferer')::boolean,
  'earlier-queued A is offerer'
);
select ok(
  (public.publish_meet_signal(
     current_setting('test.vid_session'),
     'offer',
     jsonb_build_object('type', 'offer', 'sdp', 'v=0')
   ) ? 'id'),
  'offerer can publish offer'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000b202', 'role', 'authenticated')::text,
  true
);
select ok(
  not (public.get_meet_session(current_setting('test.vid_session')) ->> 'isOfferer')::boolean,
  'B is answerer'
);
select throws_ok(
  $$select public.publish_meet_signal(
     current_setting('test.vid_session'),
     'offer',
     jsonb_build_object('type', 'offer', 'sdp', 'v=0')
  )$$,
  'P0005',
  null,
  'answerer cannot publish offer'
);

-- Non-participant signaling rejected
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000b203', 'role', 'authenticated')::text,
  true
);
select lives_ok($$select public.ack_meet_video_safety()$$, 'C acks');
select throws_ok(
  $$select public.publish_meet_signal(
     current_setting('test.vid_session'),
     'ice',
     jsonb_build_object('candidate', 'x')
  )$$,
  '42501',
  null,
  'non-participant cannot signal'
);

-- End session → signaling rejected
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000b201', 'role', 'authenticated')::text,
  true
);
select ok(
  (public.leave_meet_session(current_setting('test.vid_session'), 'leave') ->> 'left')::boolean,
  'leave ends video session'
);

select throws_ok(
  $$select public.publish_meet_signal(
     current_setting('test.vid_session'),
     'ice',
     jsonb_build_object('candidate', 'y')
  )$$,
  'P0003',
  null,
  'signaling after session end rejected'
);

-- Ineligible: null profile id
select ok(not public.can_use_video_meet('no-such-profile'), 'unknown profile ineligible');

-- ICE servers return STUN
select ok(
  (public.get_meet_ice_servers() -> 'iceServers') is not null,
  'ICE servers payload available'
);

select finish();
rollback;

-- Arena Phase 0 correctness regressions.
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000f001'),
  ('00000000-0000-0000-0000-00000000f002'),
  ('00000000-0000-0000-0000-00000000f003'),
  ('00000000-0000-0000-0000-00000000f004'),
  ('00000000-0000-0000-0000-00000000f005');

update public.profiles set id = 'p0-a', handle = 'p0_a', name = 'Phase A', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-00000000f001';
update public.profiles set id = 'p0-b', handle = 'p0_b', name = 'Phase B', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-00000000f002';
update public.profiles set id = 'p0-c', handle = 'p0_c', name = 'Phase C', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-00000000f003';
update public.profiles set id = 'p0-d', handle = 'p0_d', name = 'Phase D', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-00000000f004';
update public.profiles set id = 'p0-mod', handle = 'p0_mod', name = 'Phase Mod', role = 'moderator'
 where auth_user_id = '00000000-0000-0000-0000-00000000f005';

insert into public.arena_daily_topics
  (id, title, hood, status, opens_at, final_arguments_at, judging_at, closes_at)
values
  ('p0-topic', 'Phase zero topic', 'techtakes', 'live',
   now() - interval '1 hour', now() + interval '1 hour',
   now() + interval '2 hours', now() + interval '3 hours');

insert into public.arena_rooms
  (id, topic_id, status, capacity, participant_count, opens_at, closes_at)
values
  ('p0-room', 'p0-topic', 'OPEN', 40, 4,
   now() - interval '1 hour', now() + interval '3 hours');

insert into public.arena_room_participants
  (room_id, topic_id, profile_id, initial_stance, role)
values
  ('p0-room', 'p0-topic', 'p0-a', 'AGREE', 'debater'),
  ('p0-room', 'p0-topic', 'p0-b', 'DISAGREE', 'debater'),
  ('p0-room', 'p0-topic', 'p0-c', 'UNSURE', 'debater'),
  ('p0-room', 'p0-topic', 'p0-d', 'AGREE', 'debater');

insert into public.arena_room_messages (id, room_id, author_id, body)
values ('p0-msg', 'p0-room', 'p0-c', 'Canonical pulse candidate');
insert into public.arena_room_message_reactions (message_id, profile_id, emoji)
values
  ('p0-msg', 'p0-a', 'fire'),
  ('p0-msg', 'p0-b', 'fire'),
  ('p0-msg', 'p0-d', 'fire');
insert into public.blocks (blocker_id, blocked_id) values ('p0-a', 'p0-c');

-- A warms the shared cache while blocking C. The cache remains canonical.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f001","role":"authenticated"}', true);
select ok(
  not (public.get_arena_room_pulse('p0-room') -> 'leaders') @>
      '[{"author":{"id":"p0-c"}}]'::jsonb,
  'first viewer does not see a blocked pulse author'
);

reset role;
select ok(
  (select payload -> 'leaders' from public.arena_room_pulse_cache where room_id = 'p0-room') @>
    '[{"author":{"id":"p0-c"}}]'::jsonb,
  'shared cache stores the canonical unfiltered pulse'
);

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f002","role":"authenticated"}', true);
select ok(
  (public.get_arena_room_pulse('p0-room') -> 'leaders') @>
    '[{"author":{"id":"p0-c"}}]'::jsonb,
  'a second viewer sees the same author through the warm cache'
);

reset role;
insert into public.mutes (muter_id, muted_id) values ('p0-b', 'p0-c');
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f002","role":"authenticated"}', true);
select ok(
  not (public.get_arena_room_pulse('p0-room') -> 'leaders') @>
      '[{"author":{"id":"p0-c"}}]'::jsonb,
  'mute filtering is applied after the cache read'
);
select throws_ok(
  $$ select count(*) from public.arena_room_pulse_cache $$,
  '42501', null, 'authenticated clients cannot bypass filtering via the cache table'
);

-- Staff receives canonical moderation context without joining the room.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f005","role":"authenticated"}', true);
select ok(
  (public.get_arena_room_pulse('p0-room') -> 'leaders') @>
    '[{"author":{"id":"p0-c"}}]'::jsonb,
  'staff can read the canonical pulse for moderation'
);
reset role;

-- The lock strategies are part of the database contract and stay reviewable.
select ok(
  pg_get_functiondef('public.assert_rate_limit(text,text,integer,interval)'::regprocedure)
    ~* 'pg_advisory_xact_lock',
  'rate limit decisions serialize by actor and action'
);
select ok(
  pg_get_functiondef('public.submit_arena_side_vote(text,public.arena_winning_side)'::regprocedure)
    ~* 'for update',
  'side ballots lock the room row used by settlement'
);
select ok(
  pg_get_functiondef('public.submit_arena_argument_vote(text,text)'::regprocedure)
    ~* 'for update',
  'argument ballots lock the room row used by settlement'
);
select ok(
  pg_get_functiondef('public.submit_judgement(text,public.clash_side)'::regprocedure)
    ~* 'for update of c',
  'legacy Clash ballots lock the clash row used by settlement'
);

-- Hold the first caller's transaction open after admission, then start a second
-- connection against the same key. It must wait and reject after the first commit.
create extension if not exists dblink with schema extensions;
select is(
  extensions.dblink_connect('p0-rate-1', 'dbname=' || current_database()),
  'OK', 'first concurrent rate-limit connection opens'
);
select is(
  extensions.dblink_connect('p0-rate-2', 'dbname=' || current_database()),
  'OK', 'second concurrent rate-limit connection opens'
);
select is(extensions.dblink_exec('p0-rate-1', 'begin'), 'BEGIN',
  'first concurrent caller begins');
select is(
  extensions.dblink_exec(
    'p0-rate-1',
    'do $remote$ begin perform public.assert_rate_limit(''p0-race'', ''same-key'', 1, interval ''1 hour''); end $remote$;'
  ),
  'DO', 'first concurrent caller is admitted while retaining the transaction lock'
);
select is(
  extensions.dblink_send_query(
    'p0-rate-2',
    'do $remote$ begin perform public.assert_rate_limit(''p0-race'', ''same-key'', 1, interval ''1 hour''); end $remote$;'
  ),
  1, 'second concurrent caller starts'
);
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('p0-rate-2'), 1,
  'second concurrent caller waits on the same-key lock');
select is(extensions.dblink_exec('p0-rate-1', 'commit'), 'COMMIT',
  'first concurrent caller commits');
select lives_ok(
  $$ select * from extensions.dblink_get_result('p0-rate-2', false) as result(status text) $$,
  'second concurrent result is collected without aborting pgTAP'
);
select like(
  extensions.dblink_error_message('p0-rate-2'),
  '%rate limit exceeded: same-key%',
  'second concurrent caller is rejected after serialization'
);
select is(
  (select count(*)::integer from public.rate_limit_events
    where actor_id = 'p0-race' and action = 'same-key'),
  1, 'concurrent calls admit exactly the configured limit'
);
select is(
  extensions.dblink_exec(
    'p0-rate-1',
    'delete from public.rate_limit_events where actor_id = ''p0-race'' and action = ''same-key'''
  ),
  'DELETE 1', 'concurrent test cleans its committed remote event'
);
select is(extensions.dblink_disconnect('p0-rate-1'), 'OK',
  'first concurrent connection closes');
select is(extensions.dblink_disconnect('p0-rate-2'), 'OK',
  'second concurrent connection closes');

select lives_ok(
  $$ select public.assert_rate_limit('p0-actor', 'p0-action', 2, interval '1 hour') $$,
  'first serialized rate-limit event is accepted'
);
select lives_ok(
  $$ select public.assert_rate_limit('p0-actor', 'p0-action', 2, interval '1 hour') $$,
  'second serialized rate-limit event is accepted'
);
select throws_ok(
  $$ select public.assert_rate_limit('p0-actor', 'p0-action', 2, interval '1 hour') $$,
  'P0001', null, 'event beyond the serialized limit is rejected'
);

-- Accepted ballots are visible to settlement; the clock closes the gate even if
-- the scheduler has not yet advanced the stored status.
update public.arena_rooms set status = 'JUDGING' where id = 'p0-room';
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f001","role":"authenticated"}', true);
select lives_ok(
  $$ select public.submit_arena_side_vote('p0-room', 'AGREE') $$,
  'a pre-close side ballot is accepted'
);
select lives_ok(
  $$ select public.submit_arena_argument_vote('p0-room', 'p0-msg') $$,
  'a pre-close argument ballot is accepted'
);
reset role;

update public.arena_daily_topics
   set status = 'closed',
       opens_at = now() - interval '4 hours',
       final_arguments_at = now() - interval '3 hours',
       judging_at = now() - interval '2 hours',
       closes_at = now() - interval '1 hour'
 where id = 'p0-topic';
update public.arena_rooms
   set opens_at = now() - interval '4 hours', closes_at = now() - interval '1 hour'
 where id = 'p0-room';

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f004","role":"authenticated"}', true);
select throws_ok(
  $$ select public.submit_arena_side_vote('p0-room', 'DISAGREE') $$,
  'P0003', null, 'a side ballot is rejected after the judging clock closes'
);
select throws_ok(
  $$ select public.submit_arena_argument_vote('p0-room', 'p0-msg') $$,
  'P0003', null, 'an argument ballot is rejected after the judging clock closes'
);
reset role;

create temporary table p0_result as
  select public.settle_arena_room('p0-room') as payload;
select is(
  (select agree_votes from public.arena_room_results where room_id = 'p0-room'),
  1, 'settlement includes the accepted side ballot'
);
select is(
  (select best_argument_message_id from public.arena_room_results where room_id = 'p0-room'),
  'p0-msg', 'settlement includes the accepted argument ballot'
);
select is(
  public.settle_arena_room('p0-room'),
  (select payload from p0_result),
  'room settlement remains idempotent'
);

-- A bounded visibility probe removes a row immediately after moderation.
delete from public.mutes where muter_id = 'p0-b' and muted_id = 'p0-c';
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f002","role":"authenticated"}', true);
select is(
  (public.get_arena_room_message_visibility('p0-room', array['p0-msg']))[1],
  'p0-msg', 'visible loaded message survives reconciliation'
);
reset role;
update public.arena_room_messages set hidden_at = now() where id = 'p0-msg';
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f002","role":"authenticated"}', true);
select is(
  cardinality(public.get_arena_room_message_visibility('p0-room', array['p0-msg'])),
  0, 'a moderated loaded message disappears on the next bounded check'
);

select * from finish();
rollback;

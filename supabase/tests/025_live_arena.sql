-- ============================================================================
-- Live Daily Arena tests (pgTAP). Self-contained; run: supabase test db
-- ----------------------------------------------------------------------------
-- Covers the whole phase-13 contract: schema + privileges, auto-placement and
-- capacity shedding, private stances, member-only threads, block filtering,
-- evidence validation (including URL hardening), the judging gates, idempotent
-- settlement with rewards, room Mindshift, and the scheduler seams.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000c001'),
  ('00000000-0000-0000-0000-00000000c002'),
  ('00000000-0000-0000-0000-00000000c003'),
  ('00000000-0000-0000-0000-00000000c004'),
  ('00000000-0000-0000-0000-00000000c005'),
  ('00000000-0000-0000-0000-00000000c006'),
  ('00000000-0000-0000-0000-00000000c007'),
  ('00000000-0000-0000-0000-00000000c008');

update public.profiles set id = 'la-a', handle = 'la_a', name = 'Arena A', role = 'viewer',
       reputation = 0, coins = 0, streak = 0, rank = 'Rookie'
 where auth_user_id = '00000000-0000-0000-0000-00000000c001';
update public.profiles set id = 'la-b', handle = 'la_b', name = 'Arena B', role = 'viewer',
       reputation = 0, coins = 0, streak = 0, rank = 'Rookie'
 where auth_user_id = '00000000-0000-0000-0000-00000000c002';
update public.profiles set id = 'la-c', handle = 'la_c', name = 'Arena C', role = 'viewer',
       reputation = 0, coins = 0, streak = 0, rank = 'Rookie'
 where auth_user_id = '00000000-0000-0000-0000-00000000c003';
update public.profiles set id = 'la-d', handle = 'la_d', name = 'Arena D', role = 'viewer',
       reputation = 0, coins = 0, streak = 0, rank = 'Rookie'
 where auth_user_id = '00000000-0000-0000-0000-00000000c004';
update public.profiles set id = 'la-e', handle = 'la_e', name = 'Arena E', role = 'viewer',
       reputation = 0, coins = 0, streak = 0, rank = 'Rookie'
 where auth_user_id = '00000000-0000-0000-0000-00000000c005';
update public.profiles set id = 'la-g', handle = 'la_g', name = 'Arena G', role = 'viewer',
       reputation = 0, coins = 0, streak = 0, rank = 'Rookie'
 where auth_user_id = '00000000-0000-0000-0000-00000000c006';
update public.profiles set id = 'la-mod', handle = 'la_mod', name = 'Arena Mod', role = 'moderator',
       reputation = 0, coins = 0, streak = 0, rank = 'Rookie'
 where auth_user_id = '00000000-0000-0000-0000-00000000c007';
update public.profiles set id = 'la-f', handle = 'la_f', name = 'Arena F', role = 'viewer',
       reputation = 0, coins = 0, streak = 0, rank = 'Rookie'
 where auth_user_id = '00000000-0000-0000-0000-00000000c008';

-- Topic clocks. `la-live` is mid-debate, `la-judge` is driven into judging and
-- then settled below, `la-closed` is already over, `la-cap` has a full room and
-- `la-sched` has not opened yet.
insert into public.arena_daily_topics
  (id, title, description, hood, status, opens_at, final_arguments_at, judging_at, closes_at)
values
  ('la-live', 'Should AI write our laws?', 'daily live topic', 'techtakes', 'live',
   now() - interval '1 hour', now() + interval '2 hours', now() + interval '3 hours', now() + interval '4 hours'),
  ('la-judge', 'Is remote work over?', null, 'techtakes', 'live',
   now() - interval '3 hours', now() - interval '2 hours', now() + interval '2 hours', now() + interval '3 hours'),
  ('la-closed', 'Yesterday''s topic', null, 'techtakes', 'closed',
   now() - interval '9 hours', now() - interval '8 hours', now() - interval '7 hours', now() - interval '6 hours'),
  ('la-cap', 'Capacity topic', null, 'techtakes', 'live',
   now() - interval '1 hour', now() + interval '2 hours', now() + interval '3 hours', now() + interval '4 hours'),
  ('la-sched', 'Tomorrow''s topic', null, 'techtakes', 'scheduled',
   now() + interval '1 hour', now() + interval '2 hours', now() + interval '3 hours', now() + interval '4 hours');

-- Deterministic room ids so a test never has to guess a generated one.
insert into public.arena_rooms
  (id, topic_id, status, capacity, participant_count, opens_at, closes_at)
values
  ('la-live-r1', 'la-live', 'OPEN', 40, 0, now() - interval '1 hour', now() + interval '4 hours'),
  ('la-judge-r1', 'la-judge', 'OPEN', 40, 0, now() - interval '3 hours', now() + interval '3 hours'),
  ('la-closed-r1', 'la-closed', 'OPEN', 40, 0, now() - interval '9 hours', now() - interval '6 hours'),
  -- Already at capacity: the next joiner must be shed into a brand new room.
  ('la-cap-r1', 'la-cap', 'OPEN', 20, 20, now() - interval '1 hour', now() + interval '4 hours');

insert into public.media_objects
  (id, owner_id, bucket, storage_path, media_kind, mime_type, visibility, status)
values
  ('la-a-img', 'la-a', 'public-media', 'la-a/la-a-img/x.png', 'image', 'image/png', 'public', 'ready'),
  ('la-a-img2', 'la-a', 'public-media', 'la-a/la-a-img2/x.png', 'image', 'image/png', 'public', 'ready'),
  ('la-a-priv', 'la-a', 'private-media', 'la-a/la-a-priv/x.png', 'image', 'image/png', 'private', 'ready'),
  ('la-b-img', 'la-b', 'public-media', 'la-b/la-b-img/x.png', 'image', 'image/png', 'public', 'ready');

-- ── 1. Schema ───────────────────────────────────────────────────────────────
select has_table('public', 'arena_daily_topics', 'arena_daily_topics table');
select has_table('public', 'arena_rooms', 'arena_rooms table');
select has_table('public', 'arena_room_participants', 'arena_room_participants table');
select has_table('public', 'arena_room_messages', 'arena_room_messages table');
select has_table('public', 'arena_room_evidence', 'arena_room_evidence table');
select has_table('public', 'arena_room_message_reactions', 'arena_room_message_reactions table');
select has_table('public', 'arena_room_evidence_marks', 'arena_room_evidence_marks table');
select has_table('public', 'arena_room_side_votes', 'arena_room_side_votes table');
select has_table('public', 'arena_room_argument_votes', 'arena_room_argument_votes table');
select has_table('public', 'arena_room_results', 'arena_room_results table');
select has_column('public', 'reputation_events', 'arena_room_id', 'reputation_events.arena_room_id exists');

select has_function('public', 'list_live_arena_topics', 'list_live_arena_topics exists');
select has_function('public', 'get_arena_topic', 'get_arena_topic exists');
select has_function('public', 'join_arena_topic', 'join_arena_topic exists');
select has_function('public', 'get_arena_room', 'get_arena_room exists');
select has_function('public', 'post_arena_room_message', 'post_arena_room_message exists');
select has_function('public', 'list_arena_room_messages', 'list_arena_room_messages exists');
select has_function('public', 'react_arena_room_message', 'react_arena_room_message exists');
select has_function('public', 'submit_arena_evidence', 'submit_arena_evidence exists');
select has_function('public', 'mark_arena_evidence_useful', 'mark_arena_evidence_useful exists');
select has_function('public', 'submit_arena_side_vote', 'submit_arena_side_vote exists');
select has_function('public', 'submit_arena_argument_vote', 'submit_arena_argument_vote exists');
select has_function('public', 'record_arena_final_stance', 'record_arena_final_stance exists');
select has_function('public', 'arena_room_mindshift_stats', 'arena_room_mindshift_stats exists');
select has_function('public', 'settle_arena_room', 'settle_arena_room exists');
select has_function('public', 'transition_due_arena_rooms', 'transition_due_arena_rooms exists');
select has_function('public', 'is_allowed_http_url', 'is_allowed_http_url exists');
select has_function('public', 'new_arena_id', 'new_arena_id exists');

-- Stance reuses the Mindshift enum rather than introducing a second one.
select is(
  (select array(select e.enumlabel::text from pg_enum e
                 join pg_type t on t.oid = e.enumtypid
                where t.typname = 'take_stance' order by e.enumsortorder)),
  ARRAY['AGREE', 'UNSURE', 'DISAGREE'],
  'stance still comes from public.take_stance'
);
select is(
  (select array(select e.enumlabel::text from pg_enum e
                 join pg_type t on t.oid = e.enumtypid
                where t.typname = 'arena_room_status' order by e.enumsortorder)),
  ARRAY['OPEN', 'FINAL_ARGUMENTS', 'JUDGING', 'SETTLED', 'CANCELLED'],
  'arena_room_status labels'
);
select ok(
  exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
           where t.typname = 'reputation_kind' and e.enumlabel = 'arena_participation'),
  'reputation_kind gained arena_participation'
);
select ok(
  exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
           where t.typname = 'report_target' and e.enumlabel = 'arena_room_message'),
  'report_target gained arena_room_message'
);

-- ── 2. Privileges: no client writes anywhere ────────────────────────────────
select is(has_table_privilege('authenticated', 'public.arena_room_messages', 'INSERT'), false,
  'no client INSERT on arena_room_messages');
select is(has_table_privilege('authenticated', 'public.arena_room_messages', 'UPDATE'), false,
  'no client UPDATE on arena_room_messages');
select is(has_table_privilege('authenticated', 'public.arena_room_participants', 'INSERT'), false,
  'no client INSERT on arena_room_participants');
select is(has_table_privilege('authenticated', 'public.arena_rooms', 'UPDATE'), false,
  'no client UPDATE on arena_rooms');
select is(has_table_privilege('authenticated', 'public.arena_room_side_votes', 'INSERT'), false,
  'no client INSERT on arena_room_side_votes');
select is(has_table_privilege('anon', 'public.arena_room_participants', 'SELECT'), false,
  'anon cannot read membership rows at all');
select is(has_table_privilege('anon', 'public.arena_room_messages', 'SELECT'), false,
  'anon cannot read room messages at all');
select is(has_table_privilege('anon', 'public.arena_daily_topics', 'SELECT'), true,
  'anon may read topics');
select is(has_table_privilege('anon', 'public.arena_room_results', 'SELECT'), true,
  'anon may read settled results');

select is(has_function_privilege('anon', 'public.list_live_arena_topics()', 'EXECUTE'), true,
  'anon may list live topics');
select is(has_function_privilege('anon',
  'public.join_arena_topic(text,take_stance,arena_participant_role)', 'EXECUTE'), false,
  'anon cannot join');
select is(has_function_privilege('authenticated',
  'public.join_arena_topic(text,take_stance,arena_participant_role)', 'EXECUTE'), true,
  'authenticated may join');
select is(has_function_privilege('authenticated', 'public.settle_arena_room(text)', 'EXECUTE'), false,
  'the phone cannot settle a room');
select is(has_function_privilege('authenticated', 'public.transition_due_arena_rooms(integer)', 'EXECUTE'), false,
  'the phone cannot drive the phase clock');
select is(has_function_privilege('authenticated', 'public.run_maintenance(integer)', 'EXECUTE'), false,
  'run_maintenance stays service_role only');
select is(has_function_privilege('service_role', 'public.settle_arena_room(text)', 'EXECUTE'), true,
  'service_role may settle');
select is(has_function_privilege('anon', 'public.new_arena_id(text)', 'EXECUTE'), false,
  'the id helper is server-internal');
select is(has_function_privilege('anon', 'public.arena_result_payload(text)', 'EXECUTE'), false,
  'the result payload helper is server-internal');

-- ── 3. URL hardening ────────────────────────────────────────────────────────
select ok(public.is_allowed_http_url('https://example.com/study'), 'https url allowed');
select ok(public.is_allowed_http_url('https://docs.example.co.uk/a/b?c=1'), 'deep https url allowed');
select ok(not public.is_allowed_http_url('http://example.com/study'), 'plain http rejected');
select ok(not public.is_allowed_http_url('javascript:alert(1)'), 'javascript: rejected');
select ok(not public.is_allowed_http_url('data:text/html;base64,QUJD'), 'data: rejected');
select ok(not public.is_allowed_http_url('file:///etc/passwd'), 'file: rejected');
select ok(not public.is_allowed_http_url('https://localhost/x'), 'loopback host rejected');
select ok(not public.is_allowed_http_url('https://127.0.0.1/x'), 'loopback address rejected');
select ok(not public.is_allowed_http_url('https://192.168.1.4/x'), 'rfc1918 address rejected');
select ok(not public.is_allowed_http_url('https://169.254.169.254/latest'),
  'link-local metadata address rejected');
select ok(not public.is_allowed_http_url('https://nodot/x'), 'host without a tld rejected');
select ok(not public.is_allowed_http_url('https://example.com/a b'), 'whitespace rejected');
select ok(not public.is_allowed_http_url(null), 'null rejected');
select ok(not public.is_allowed_http_url('https://a.c'), 'too-short url rejected');

-- ── 4. Guest surface ────────────────────────────────────────────────────────
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select count(*)::int from public.list_live_arena_topics() x where x ->> 'id' like 'la-%'),
  3,
  'guest sees the three live topics'
);
select is(
  (select x -> 'viewerRoomId' from public.list_live_arena_topics() x where x ->> 'id' = 'la-live'),
  'null'::jsonb,
  'a guest has no membership on a topic card'
);
select is(
  (select bool_or(x ? 'agreePercent' or x ? 'disagreePercent' or x ? 'stanceBreakdown')
     from public.list_live_arena_topics() x),
  false,
  'a topic card never exposes an aggregate stance split'
);
select is((select count(*)::int from public.arena_daily_topics where id = 'la-sched'), 0,
  'a guest cannot see a scheduled topic');
select is((select count(*)::int from public.arena_daily_topics where id = 'la-live'), 1,
  'a guest can see a live topic');
select is((select count(*)::int from public.arena_rooms where topic_id = 'la-sched'), 0,
  'a guest cannot see a scheduled topic''s rooms');

select throws_ok(
  $$ select public.join_arena_topic('la-live', 'AGREE') $$,
  '42501', null, 'a guest cannot join a topic'
);
reset role;

-- ── 5. Joining: placement, idempotency, gates ───────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);

select is(public.join_arena_topic('la-live', 'AGREE') ->> 'roomId', 'la-live-r1',
  'the first joiner lands in the only open room');
select is(public.join_arena_topic('la-live', 'AGREE') ->> 'joined', 'false',
  'a second join is idempotent, not an error');
select is(public.join_arena_topic('la-live', 'DISAGREE') ->> 'stance', 'AGREE',
  'a re-join cannot rewrite the recorded stance');
select throws_ok($$ select public.join_arena_topic('la-nope', 'AGREE') $$,
  'P0002', null, 'a missing topic is rejected');
select throws_ok($$ select public.join_arena_topic('la-closed', 'AGREE') $$,
  'P0003', null, 'a closed topic cannot be joined');
select throws_ok($$ select public.join_arena_topic('la-sched', 'AGREE') $$,
  'P0003', null, 'a scheduled topic cannot be joined');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}', true);
select is(public.join_arena_topic('la-live', 'DISAGREE') ->> 'roomId', 'la-live-r1',
  'rooms fill before new ones open');
reset role;

select is((select participant_count from public.arena_rooms where id = 'la-live-r1'), 2,
  'the room counter is advanced by the server');
select is((select count(*)::int from public.arena_room_participants where room_id = 'la-live-r1'), 2,
  'two membership rows exist');
select is((select initial_stance::text from public.arena_room_participants
            where room_id = 'la-live-r1' and profile_id = 'la-a'), 'AGREE',
  'the stance is attributed to the caller, not a client-supplied id');

-- Capacity: la-cap-r1 is full, so the next joiner opens a second room.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c005","role":"authenticated"}', true);
select lives_ok($$ select public.join_arena_topic('la-cap', 'AGREE') $$,
  'a full topic still accepts a joiner');
reset role;

select is((select count(*)::int from public.arena_rooms where topic_id = 'la-cap'), 2,
  'a full room sheds the next joiner into a new room');
select isnt((select room_id from public.arena_room_participants
             where topic_id = 'la-cap' and profile_id = 'la-e'), 'la-cap-r1',
  'the overflow joiner is not placed in the full room');
select is((select capacity from public.arena_rooms
            where topic_id = 'la-cap' and id <> 'la-cap-r1'), 40,
  'a server-created room uses the default capacity');
select is((select participant_count from public.arena_rooms
            where topic_id = 'la-cap' and id <> 'la-cap-r1'), 1,
  'the overflow room counts its single member');

-- ── 6. A stance is private ──────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}', true);
select is((select count(*)::int from public.arena_room_participants where room_id = 'la-live-r1'),
  1, 'a member sees only their own membership row');
select is((select count(*)::int from public.arena_room_participants
            where room_id = 'la-live-r1' and profile_id = 'la-a'),
  0, 'a member cannot read another participant''s stance');
select is((select initial_stance::text from public.arena_room_participants
            where room_id = 'la-live-r1' and profile_id = 'la-b'),
  'DISAGREE', 'the owner can read their own stance');
select throws_ok(
  $$ insert into public.arena_room_participants (room_id, topic_id, profile_id, initial_stance)
     values ('la-live-r1', 'la-live', 'la-c', 'AGREE') $$,
  '42501', null, 'raw membership insert denied'
);
select throws_ok(
  $$ update public.arena_room_participants set initial_stance = 'AGREE' where profile_id = 'la-b' $$,
  '42501', null, 'raw membership update denied'
);
select throws_ok(
  $$ update public.arena_rooms set participant_count = 0 where id = 'la-live-r1' $$,
  '42501', null, 'raw room counter update denied'
);
reset role;

-- Staff keeps a moderation read.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c007","role":"authenticated"}', true);
select is((select count(*)::int from public.arena_room_participants where room_id = 'la-live-r1'),
  2, 'staff can see memberships for moderation');
reset role;

-- ── 7. Messages ─────────────────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);
select lives_ok($$ select public.post_arena_room_message('la-live-r1', 'opening argument') $$,
  'a member can post an argument');
select throws_ok($$ select public.post_arena_room_message('la-live-r1', '') $$,
  'P0003', null, 'an empty argument is rejected');
select throws_ok($$ select public.post_arena_room_message('la-live-r1', '   ') $$,
  'P0003', null, 'a whitespace-only argument is rejected');
select throws_ok($$ select public.post_arena_room_message('la-live-r1', repeat('x', 501)) $$,
  'P0003', null, 'an argument over 500 characters is rejected');
select throws_ok($$ select public.post_arena_room_message('la-nope-r', 'hello') $$,
  'P0002', null, 'a missing room is rejected');
select throws_ok($$ select public.post_arena_room_message('la-live-r1', 'orphan', 'am_nope') $$,
  'P0002', null, 'a parent argument outside this room is rejected');
select throws_ok(
  $$ select public.post_arena_room_message('la-live-r1', 'stolen', null, 'la-b-img',
       'http://127.0.0.1/public-media/la-b/la-b-img/x.png') $$,
  'P0001', null, 'another user''s media cannot be attached'
);
select throws_ok(
  $$ select public.post_arena_room_message('la-live-r1', 'private', null, 'la-a-priv',
       'http://127.0.0.1/private-media/la-a/la-a-priv/x.png') $$,
  'P0005', null, 'private media cannot be attached'
);
select lives_ok(
  $$ select public.post_arena_room_message('la-live-r1', 'exhibit', null, 'la-a-img',
       'http://127.0.0.1/public-media/la-a/la-a-img/x.png') $$,
  'an owned public upload can be attached'
);
select throws_ok(
  $$ select public.post_arena_room_message('la-live-r1', '', null, null,
       'https://evil.example.com/a.gif', 'tenor', 'abc123') $$,
  'P0005', null, 'a gif from a non-tenor host is rejected'
);
select lives_ok(
  $$ select public.post_arena_room_message('la-live-r1', '', null, null,
       'https://media.tenor.com/x/a.gif', 'tenor', 'abc123') $$,
  'a tenor gif argument is accepted'
);
reset role;

select is((select kind::text from public.arena_room_messages where body = 'exhibit'), 'media',
  'an upload is stamped as a media argument');
select is((select media_kind::text from public.arena_room_messages where body = 'exhibit'), 'image',
  'the media kind comes from the owned object, not the client');
select is((select kind::text from public.arena_room_messages where gif_external_id = 'abc123'), 'gif',
  'a tenor attachment is stamped as a gif argument');

-- A non-member cannot read or write the thread.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c005","role":"authenticated"}', true);
select throws_ok($$ select public.post_arena_room_message('la-live-r1', 'gatecrash') $$,
  '42501', null, 'a non-member cannot post into a room');
select throws_ok($$ select public.list_arena_room_messages('la-live-r1') $$,
  '42501', null, 'a non-member cannot read a room thread');
select is((select count(*)::int from public.arena_room_messages where room_id = 'la-live-r1'), 0,
  'RLS hides the thread from a non-member');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}', true);
select is((select count(*)::int from public.list_arena_room_messages('la-live-r1')), 3,
  'a member reads the whole thread');
select lives_ok(
  $$ select public.post_arena_room_message('la-live-r1', 'rebutting that',
       (select id from public.arena_room_messages where body = 'opening argument')) $$,
  'a threaded reply works'
);
select isnt((select parent_message_id from public.arena_room_messages where body = 'rebutting that'),
  null, 'the reply keeps its parent');
reset role;

-- ── 8. Reactions ────────────────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}', true);
select is(
  public.react_arena_room_message(
    (select id from public.arena_room_messages where body = 'opening argument')) ->> 'reacted',
  'true', 'a reaction is recorded'
);
select is(
  public.react_arena_room_message(
    (select id from public.arena_room_messages where body = 'opening argument')) ->> 'reacted',
  'false', 'the same reaction toggles off'
);
select is(
  (public.react_arena_room_message(
    (select id from public.arena_room_messages where body = 'opening argument')) ->> 'count')::int,
  1, 'the reaction count is recomputed, not incremented blindly'
);
select throws_ok($$ select public.react_arena_room_message('am_nope') $$,
  'P0002', null, 'reacting to a missing argument is rejected');
reset role;

-- ── 9. Block filtering inside a room ────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c008","role":"authenticated"}', true);
select lives_ok($$ select public.join_arena_topic('la-live', 'UNSURE') $$, 'F joins the live room');
select lives_ok($$ select public.post_arena_room_message('la-live-r1', 'blocked voice') $$,
  'F posts before the block exists');
reset role;

insert into public.blocks (blocker_id, blocked_id) values ('la-a', 'la-f');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.list_arena_room_messages('la-live-r1') x
    where x ->> 'body' = 'blocked voice'),
  0, 'a blocked author is filtered out of the thread'
);
select is((select count(*)::int from public.arena_room_messages where body = 'blocked voice'), 0,
  'RLS also hides a blocked author''s argument');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c008","role":"authenticated"}', true);
select is((select count(*)::int from public.arena_room_messages where body = 'blocked voice'), 1,
  'the author can still see their own argument');
reset role;

-- ── 10. Evidence ────────────────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);
select is(
  public.submit_arena_evidence('la-live-r1', 'link', 'Peer reviewed study',
    'https://example.com/study') ->> 'kind',
  'link', 'a https link citation is accepted'
);
select throws_ok(
  $$ select public.submit_arena_evidence('la-live-r1', 'link', 'xss', 'javascript:alert(1)') $$,
  'P0005', null, 'a javascript: citation is rejected'
);
select throws_ok(
  $$ select public.submit_arena_evidence('la-live-r1', 'link', 'plain http', 'http://example.com/a') $$,
  'P0005', null, 'a plain http citation is rejected'
);
select throws_ok(
  $$ select public.submit_arena_evidence('la-live-r1', 'link', 'metadata',
       'https://169.254.169.254/latest') $$,
  'P0005', null, 'a link-local citation is rejected'
);
select throws_ok(
  $$ select public.submit_arena_evidence('la-live-r1', 'link', 'mixed', 'https://example.com/a',
       'la-a-img', 'http://127.0.0.1/public-media/la-a/la-a-img/x.png') $$,
  'P0003', null, 'a link citation cannot also carry an upload'
);
select throws_ok(
  $$ select public.submit_arena_evidence('la-live-r1', 'image', '', null, 'la-a-img',
       'http://127.0.0.1/public-media/la-a/la-a-img/x.png') $$,
  'P0003', null, 'evidence needs a title'
);
select throws_ok(
  $$ select public.submit_arena_evidence('la-live-r1', 'image', 'stolen', null, 'la-b-img',
       'http://127.0.0.1/public-media/la-b/la-b-img/x.png') $$,
  'P0001', null, 'another user''s media cannot be cited'
);
select throws_ok(
  $$ select public.submit_arena_evidence('la-live-r1', 'image', 'private', null, 'la-a-priv',
       'http://127.0.0.1/private-media/la-a/la-a-priv/x.png') $$,
  'P0005', null, 'private media cannot be cited'
);
select throws_ok(
  $$ select public.submit_arena_evidence('la-live-r1', 'video', 'wrong kind', null, 'la-a-img2',
       'http://127.0.0.1/public-media/la-a/la-a-img2/x.png') $$,
  'P0003', null, 'the declared evidence kind must match the upload'
);
select is(
  public.submit_arena_evidence('la-live-r1', 'image', 'Screenshot', null, 'la-a-img2',
    'http://127.0.0.1/public-media/la-a/la-a-img2/x.png') ->> 'usefulCount',
  '0', 'an owned public upload can be cited and starts at zero marks'
);
select throws_ok(
  $$ select public.mark_arena_evidence_useful(
       (select id from public.arena_room_evidence where title = 'Peer reviewed study')) $$,
  'P0001', null, 'an author cannot mark their own evidence useful'
);
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}', true);
select is(
  (public.mark_arena_evidence_useful(
    (select id from public.arena_room_evidence where title = 'Peer reviewed study'))
   ->> 'usefulCount')::int,
  1, 'a useful mark is counted'
);
select is(
  public.mark_arena_evidence_useful(
    (select id from public.arena_room_evidence where title = 'Peer reviewed study')) ->> 'marked',
  'false', 'a useful mark toggles off'
);
select is((select useful_count from public.arena_room_evidence where title = 'Peer reviewed study'), 0,
  'the stored counter follows the mark table exactly');
select is((select count(*)::int from public.list_arena_room_evidence('la-live-r1')), 2,
  'a member reads the evidence rail');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c005","role":"authenticated"}', true);
select throws_ok($$ select public.list_arena_room_evidence('la-live-r1') $$,
  '42501', null, 'a non-member cannot read the evidence rail');
select throws_ok(
  $$ select public.submit_arena_evidence('la-live-r1', 'link', 'outsider', 'https://example.com/x') $$,
  '42501', null, 'a non-member cannot add evidence'
);
reset role;

-- ── 11. Rate limit: eight citations per hour ────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c006","role":"authenticated"}', true);
select lives_ok($$ select public.join_arena_topic('la-live', 'AGREE') $$, 'G joins the live room');
select lives_ok($$
  do $do$
  declare i integer;
  begin
    for i in 1..8 loop
      perform public.submit_arena_evidence('la-live-r1', 'link', 'cite ' || i,
        'https://example.com/cite/' || i);
    end loop;
  end
  $do$;
$$, 'eight citations fit inside the hourly budget');
select throws_ok(
  $$ select public.submit_arena_evidence('la-live-r1', 'link', 'cite 9',
       'https://example.com/cite/9') $$,
  'P0001', null, 'the ninth citation in an hour is rate limited'
);
reset role;

-- ── 12. Phase gates once the room leaves OPEN ──────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);
select throws_ok($$ select public.arena_room_mindshift_stats('la-live-r1') $$,
  'P0003', null, 'room Mindshift stays shut before the verdict');
reset role;

update public.arena_rooms set status = 'JUDGING' where id = 'la-live-r1';

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);
select throws_ok($$ select public.post_arena_room_message('la-live-r1', 'too late') $$,
  'P0003', null, 'arguments close when the room leaves OPEN/FINAL_ARGUMENTS');
select throws_ok(
  $$ select public.submit_arena_evidence('la-live-r1', 'link', 'too late',
       'https://example.com/late') $$,
  'P0003', null, 'evidence closes with the debate'
);
select throws_ok($$ select public.record_arena_final_stance('la-live-r1', 'DISAGREE') $$,
  'P0003', null, 'a final stance needs a settled room');
reset role;

-- ── 13. Judging ─────────────────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);
select is(public.join_arena_topic('la-judge', 'AGREE') ->> 'roomId', 'la-judge-r1',
  'A joins the judging room');
select lives_ok($$ select public.post_arena_room_message('la-judge-r1', 'judge winning argument') $$,
  'A posts the argument that will win');
select lives_ok(
  $$ select public.submit_arena_evidence('la-judge-r1', 'link', 'judge citation',
       'https://example.com/judge-study') $$,
  'A cites a source the room will find useful'
);
select throws_ok($$ select public.submit_arena_side_vote('la-judge-r1', 'AGREE') $$,
  'P0003', null, 'a side vote before JUDGING is rejected');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}', true);
select lives_ok($$ select public.join_arena_topic('la-judge', 'DISAGREE') $$, 'B joins the judging room');
select lives_ok($$ select public.post_arena_room_message('la-judge-r1', 'judge losing argument') $$,
  'B posts a competing argument');
select lives_ok(
  $$ select public.mark_arena_evidence_useful(
       (select id from public.arena_room_evidence where title = 'judge citation')) $$,
  'B marks the citation useful'
);
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c003","role":"authenticated"}', true);
select lives_ok($$ select public.join_arena_topic('la-judge', 'AGREE') $$, 'C joins the judging room');
select lives_ok(
  $$ select public.mark_arena_evidence_useful(
       (select id from public.arena_room_evidence where title = 'judge citation')) $$,
  'C marks the citation useful'
);
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c004","role":"authenticated"}', true);
select lives_ok($$ select public.join_arena_topic('la-judge', 'DISAGREE') $$, 'D joins the judging room');
select lives_ok(
  $$ select public.mark_arena_evidence_useful(
       (select id from public.arena_room_evidence where title = 'judge citation')) $$,
  'D marks the citation useful'
);
reset role;

select is((select useful_count from public.arena_room_evidence where title = 'judge citation'), 3,
  'the citation clears the useful-evidence threshold');
select is((select participant_count from public.arena_rooms where id = 'la-judge-r1'), 4,
  'four debaters joined the judging room');

-- The clock moves the room into judging. The scheduler seam that normally does
-- this is exercised separately in section 16.
update public.arena_rooms set status = 'JUDGING' where id = 'la-judge-r1';

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);
select throws_ok($$ select public.post_arena_room_message('la-judge-r1', 'late argument') $$,
  'P0003', null, 'JUDGING closes the thread to new arguments');
select throws_ok($$ select public.submit_arena_side_vote('la-judge-r1', 'DRAW') $$,
  'P0003', null, 'DRAW is a result, never a ballot');
select is(public.submit_arena_side_vote('la-judge-r1', 'AGREE') ->> 'recorded', 'true', 'A votes AGREE');
select throws_ok($$ select public.submit_arena_side_vote('la-judge-r1', 'DISAGREE') $$,
  'P0006', null, 'a side vote cannot be rewritten');
select throws_ok(
  $$ select public.submit_arena_argument_vote('la-judge-r1',
       (select id from public.arena_room_messages where body = 'judge winning argument')) $$,
  'P0001', null, 'you cannot vote for your own argument'
);
select lives_ok(
  $$ select public.submit_arena_argument_vote('la-judge-r1',
       (select id from public.arena_room_messages where body = 'judge losing argument')) $$,
  'A votes for B''s argument'
);
select throws_ok(
  $$ select public.submit_arena_argument_vote('la-judge-r1',
       (select id from public.arena_room_messages where body = 'judge losing argument')) $$,
  'P0006', null, 'a best-argument vote cannot be rewritten'
);
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}', true);
select lives_ok($$ select public.submit_arena_side_vote('la-judge-r1', 'DISAGREE') $$, 'B votes DISAGREE');
select lives_ok(
  $$ select public.submit_arena_argument_vote('la-judge-r1',
       (select id from public.arena_room_messages where body = 'judge winning argument')) $$,
  'B votes for A''s argument'
);
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c003","role":"authenticated"}', true);
select lives_ok($$ select public.submit_arena_side_vote('la-judge-r1', 'AGREE') $$, 'C votes AGREE');
select lives_ok(
  $$ select public.submit_arena_argument_vote('la-judge-r1',
       (select id from public.arena_room_messages where body = 'judge winning argument')) $$,
  'C votes for A''s argument'
);
reset role;

-- A ballot is private, and there is no public tally before settlement.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}', true);
select is((select count(*)::int from public.arena_room_side_votes where room_id = 'la-judge-r1'), 1,
  'a voter sees only their own side vote');
select is((select count(*)::int from public.arena_room_argument_votes where room_id = 'la-judge-r1'), 1,
  'a voter sees only their own best-argument vote');
select is((select count(*)::int from public.arena_room_results where room_id = 'la-judge-r1'), 0,
  'there is no public tally before settlement');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c005","role":"authenticated"}', true);
select throws_ok($$ select public.submit_arena_side_vote('la-judge-r1', 'AGREE') $$,
  '42501', null, 'a non-member cannot cast a side vote');
reset role;

-- ── 14. Settlement ──────────────────────────────────────────────────────────
select throws_ok($$ select public.settle_arena_room('la-nope') $$,
  'P0002', null, 'settling a missing room is rejected');
select throws_ok($$ select public.settle_arena_room('la-judge-r1') $$,
  'P0003', null, 'a room cannot settle before its topic clock runs out');

-- Run the topic clock out. The phase order check still holds.
update public.arena_daily_topics
   set final_arguments_at = now() - interval '3 minutes',
       judging_at = now() - interval '2 minutes',
       closes_at = now() - interval '1 minute'
 where id = 'la-judge';

select is(public.settle_arena_room('la-judge-r1') ->> 'winningSide', 'AGREE',
  'the majority of side votes wins');
select is((select status::text from public.arena_rooms where id = 'la-judge-r1'), 'SETTLED',
  'the room is marked settled');
select is((select winning_side::text from public.arena_room_results where room_id = 'la-judge-r1'),
  'AGREE', 'the stored verdict matches the tally');
select is((select agree_votes from public.arena_room_results where room_id = 'la-judge-r1'), 2,
  'two AGREE ballots');
select is((select disagree_votes from public.arena_room_results where room_id = 'la-judge-r1'), 1,
  'one DISAGREE ballot');
select is((select participant_count from public.arena_room_results where room_id = 'la-judge-r1'), 4,
  'the result snapshots the participant count');
select is(
  (select best_argument_message_id from public.arena_room_results where room_id = 'la-judge-r1'),
  (select id from public.arena_room_messages where body = 'judge winning argument'),
  'the most-voted argument wins best argument'
);
select is((select best_argument_author_id from public.arena_room_results where room_id = 'la-judge-r1'),
  'la-a', 'the best-argument author is recorded');

-- Idempotency: a retrying scheduler must never double-pay.
select is(public.settle_arena_room('la-judge-r1') ->> 'winningSide', 'AGREE',
  'settling twice returns the stored verdict');
select is(public.settle_arena_room('la-judge-r1') ->> 'winningSide', 'AGREE',
  'settlement stays idempotent on a third call');
select is((select count(*)::int from public.reputation_events where arena_room_id = 'la-judge-r1'), 8,
  'settlement writes the ledger exactly once');

-- Rewards.
select is((select count(*)::int from public.reputation_events
            where arena_room_id = 'la-judge-r1' and kind = 'arena_participation'), 4,
  'every debater is paid participation');
select is((select count(*)::int from public.reputation_events
            where arena_room_id = 'la-judge-r1' and kind = 'arena_winning_side'), 2,
  'only the two winning-side voters get the side bonus');
select is((select count(*)::int from public.reputation_events
            where arena_room_id = 'la-judge-r1' and kind = 'arena_best_argument'
              and profile_id = 'la-a'), 1,
  'the best-argument author is paid once');
select is((select count(*)::int from public.reputation_events
            where arena_room_id = 'la-judge-r1' and kind = 'arena_useful_evidence'
              and profile_id = 'la-a'), 1,
  'three useful marks pay the evidence author once');
select is((select count(*)::int from public.reputation_events
            where arena_room_id = 'la-judge-r1' and clash_id is not null), 0,
  'an arena award never borrows a clash id');
select is((select reputation from public.profiles where id = 'la-a'), 90,
  'A earns 10 participation + 25 winning side + 40 best argument + 15 useful evidence');
select is((select reputation from public.profiles where id = 'la-c'), 35,
  'C earns participation + winning side');
select is((select reputation from public.profiles where id = 'la-b'), 10,
  'B backed the losing side and earns participation only');
select is((select reputation from public.profiles where id = 'la-d'), 10,
  'a debater who never voted still earns participation');
select is((select coins from public.profiles where id = 'la-a'), 0,
  'the Live Arena pays reputation, never coins');

-- The tally is public only now.
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.arena_room_results where room_id = 'la-judge-r1'), 1,
  'a settled verdict is publicly readable');
reset role;

-- ── 15. Room Mindshift ──────────────────────────────────────────────────────
select is(public.arena_room_mindshift_stats('la-judge-r1') -> 'changedPercent', 'null'::jsonb,
  'nobody finished yet means changedPercent is JSON null, not zero');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);
select is(public.record_arena_final_stance('la-judge-r1', 'DISAGREE') ->> 'changed', 'true',
  'AGREE -> DISAGREE counts as changed');
select throws_ok($$ select public.record_arena_final_stance('la-judge-r1', 'AGREE') $$,
  'P0008', null, 'a final stance cannot be rewritten');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}', true);
select is(public.record_arena_final_stance('la-judge-r1', 'DISAGREE') ->> 'changed', 'false',
  'DISAGREE -> DISAGREE is unchanged');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c005","role":"authenticated"}', true);
select throws_ok($$ select public.record_arena_final_stance('la-judge-r1', 'AGREE') $$,
  'P0007', null, 'someone who was never in the room has no stance to finish');
reset role;

select is((public.arena_room_mindshift_stats('la-judge-r1') ->> 'totalInitialParticipants')::int, 4,
  'four initial stances');
select is((public.arena_room_mindshift_stats('la-judge-r1') ->> 'completedParticipants')::int, 2,
  'two participants finished');
select is((public.arena_room_mindshift_stats('la-judge-r1') ->> 'changedCount')::int, 1,
  'one participant moved');
select is((public.arena_room_mindshift_stats('la-judge-r1') ->> 'changedPercent')::int, 50,
  'room Mindshift = 50%');
select is(
  (select array(select jsonb_object_keys(public.arena_room_mindshift_stats('la-judge-r1')) order by 1)),
  ARRAY['changedCount', 'changedPercent', 'completedParticipants', 'roomId',
        'totalInitialParticipants'],
  'room Mindshift exposes only safe keys — no identities, no stance matrix'
);
select is((select mindshift_completed_count from public.arena_room_results
            where room_id = 'la-judge-r1'), 2,
  'the result row tracks completions as they arrive');
select is((select mindshift_changed_count from public.arena_room_results
            where room_id = 'la-judge-r1'), 1,
  'the result row tracks changes as they arrive');

-- ── 16. Scheduler seam ──────────────────────────────────────────────────────
select is((select status::text from public.arena_rooms where id = 'la-closed-r1'), 'OPEN',
  'the stale room is still untouched before the scheduler runs');
select ok(public.transition_due_arena_rooms(100) >= 1, 'the scheduler advances due rooms');
select is((select status::text from public.arena_rooms where id = 'la-closed-r1'), 'CANCELLED',
  'a room nobody joined is cancelled, not judged');
select is((select count(*)::int from public.arena_room_results where room_id = 'la-closed-r1'), 0,
  'a cancelled room has no verdict');
select is((select status::text from public.arena_daily_topics where id = 'la-judge'), 'closed',
  'the scheduler closes a topic whose clock ran out');
select is((select status::text from public.arena_daily_topics where id = 'la-sched'), 'scheduled',
  'a topic that has not opened stays scheduled');
select is((select status::text from public.arena_rooms where id = 'la-live-r1'), 'OPEN',
  'the topic clock is authoritative: a mid-debate room is returned to OPEN');
select is(public.transition_due_arena_rooms(100), 0,
  'a second scheduler pass has nothing left to do');

-- ── 17. run_maintenance keeps every existing key ────────────────────────────
select ok(public.run_maintenance(50) ? 'arena_rooms_transitioned',
  'run_maintenance reports arena_rooms_transitioned');
select is(
  (select array(select jsonb_object_keys(public.run_maintenance(50)) order by 1)),
  ARRAY['arena_rooms_transitioned', 'clashes_settled', 'media', 'meet_signals_pruned',
        'prediction_games_closed', 'rate_limits_pruned', 'takes_expired',
        'vault_drops_expired', 'vault_subscriptions_expired', 'world_drops_expired'],
  'run_maintenance preserves every existing key and adds the arena key'
);

-- ── 18. Read payloads ───────────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);
select is(public.get_arena_room('la-judge-r1') ->> 'status', 'SETTLED',
  'get_arena_room reports the settled status');
select isnt(public.get_arena_room('la-judge-r1') -> 'result', 'null'::jsonb,
  'a settled room carries its verdict');
select is(public.get_arena_room('la-judge-r1') -> 'viewer' ->> 'stance', 'AGREE',
  'the viewer sees their OWN stance on the room card');
select is(public.get_arena_room('la-judge-r1') -> 'viewer' ->> 'hasSideVote', 'true',
  'the room card reports whether the viewer has voted');
select is(public.get_arena_topic('la-live') ->> 'viewerRoomId', 'la-live-r1',
  'the topic card carries the viewer''s room');
select is((public.get_arena_topic('la-live') ->> 'participantCount')::int, 4,
  'the topic card reports the real participant total');
select throws_ok($$ select public.get_arena_topic('la-sched') $$,
  'P0003', null, 'a scheduled topic is not readable');
select throws_ok($$ select public.get_arena_topic('la-nope') $$,
  'P0002', null, 'a missing topic is rejected');
select throws_ok($$ select public.get_arena_room('la-nope') $$,
  'P0002', null, 'a missing room is rejected');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c005","role":"authenticated"}', true);
select is(public.get_arena_room('la-judge-r1') -> 'viewer', 'null'::jsonb,
  'a non-member gets no viewer block on the room card');
reset role;

-- ── 19. The rest of the Arena is unaffected ─────────────────────────────────
-- Take-level Mindshift and the phase-12 Tenor allowlist are reused, not forked.
select throws_ok($$ select public.mindshift_stats('la-nope-take') $$,
  'P0002', null, 'take-level Mindshift still behaves exactly as before');
select ok(public.is_allowed_tenor_media_url('https://media.tenor.com/x/a.gif'),
  'the phase-12 Tenor allowlist still works');
select ok(not public.is_allowed_tenor_media_url('https://evil.example.com/a.gif'),
  'the phase-12 Tenor allowlist still rejects foreign hosts');

select * from finish();
rollback;

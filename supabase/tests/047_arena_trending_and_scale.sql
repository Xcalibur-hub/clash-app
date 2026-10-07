-- ============================================================================
-- Phase 4 — Arena trending + scale helpers (pgTAP)
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

select has_function('public', 'arena_attention_score', 'attention formula exists');
select has_function('public', 'refresh_arena_trend_snapshots', 'snapshot writer exists');
select has_function('public', 'list_arena_trending_battles', 'trending list exists');
select has_function('public', 'get_arena_room_message', 'single-message hydrate exists');
select has_function('public', 'compute_arena_room_pulse', 'pulse compute exists');
select has_table('public', 'arena_trend_snapshots', 'trend snapshots table exists');
select has_table('public', 'arena_room_pulse_cache', 'pulse cache table exists');

select is(has_table_privilege('authenticated', 'public.arena_trend_snapshots', 'INSERT'),
  false, 'clients cannot write trend snapshots');
select is(has_table_privilege('authenticated', 'public.arena_room_pulse_cache', 'INSERT'),
  false, 'clients cannot write pulse cache');
select is(has_function_privilege('authenticated', 'public.refresh_arena_trend_snapshots(integer,integer)', 'EXECUTE'),
  false, 'snapshot writer is service_role only');
select is(has_function_privilege('anon', 'public.list_arena_trending_battles(integer)', 'EXECUTE'),
  true, 'trending list is readable');

-- Formula: unique caps, not raw volume.
select is(
  public.arena_attention_score(2, 4, 1, 3),
  2 * 10 + 4 * 3 + 1 * 6 + 3 * 5,
  'attention weights unique actors'
);
select is(
  public.arena_attention_score(999, 999, 999, 999),
  40 * 10 + 80 * 3 + 20 * 6 + 40 * 5,
  'attention caps each signal class'
);
select is(public.arena_trend_momentum(100, 1, 2), 'STEADY', 'momentum needs a sample floor');
select is(public.arena_trend_momentum(40, 20, 5), 'RISING', 'momentum rising at +25%');
select is(public.arena_trend_momentum(10, 40, 5), 'COOLING', 'momentum cooling at -25%');

-- Fixtures: two live topics with distinct unique-actor heat.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000f001'),
  ('00000000-0000-0000-0000-00000000f002'),
  ('00000000-0000-0000-0000-00000000f003'),
  ('00000000-0000-0000-0000-00000000f004');

update public.profiles set id = 'tr-a1', handle = 'tr_a1', name = 'Trend A1'
 where auth_user_id = '00000000-0000-0000-0000-00000000f001';
update public.profiles set id = 'tr-a2', handle = 'tr_a2', name = 'Trend A2'
 where auth_user_id = '00000000-0000-0000-0000-00000000f002';
update public.profiles set id = 'tr-b1', handle = 'tr_b1', name = 'Trend B1'
 where auth_user_id = '00000000-0000-0000-0000-00000000f003';
update public.profiles set id = 'tr-b2', handle = 'tr_b2', name = 'Trend B2'
 where auth_user_id = '00000000-0000-0000-0000-00000000f004';

insert into public.arena_daily_topics
  (id, title, hood, status, opens_at, final_arguments_at, judging_at, closes_at)
values
  ('tr-topic-hot', 'Will AI replace junior developers?', 'movies', 'live',
   now() - interval '2 hours', now() + interval '4 hours', now() + interval '5 hours', now() + interval '6 hours'),
  ('tr-topic-cool', 'Is college still worth it?', 'movies', 'live',
   now() - interval '2 hours', now() + interval '4 hours', now() + interval '5 hours', now() + interval '6 hours');

insert into public.arena_rooms
  (id, topic_id, status, capacity, participant_count, opens_at, closes_at)
values
  ('tr-room-hot', 'tr-topic-hot', 'OPEN', 40, 2, now() - interval '2 hours', now() + interval '6 hours'),
  ('tr-room-cool', 'tr-topic-cool', 'OPEN', 40, 1, now() - interval '2 hours', now() + interval '6 hours');

insert into public.arena_room_participants (room_id, topic_id, profile_id, initial_stance, role, joined_at)
values
  ('tr-room-hot', 'tr-topic-hot', 'tr-a1', 'AGREE', 'debater', now() - interval '14 minutes'),
  ('tr-room-hot', 'tr-topic-hot', 'tr-a2', 'DISAGREE', 'debater', now() - interval '13 minutes'),
  ('tr-room-cool', 'tr-topic-cool', 'tr-b1', 'AGREE', 'debater', now() - interval '15 minutes');

insert into public.arena_room_messages
  (id, room_id, author_id, kind, body, created_at)
values
  ('tr-msg-1', 'tr-room-hot', 'tr-a1', 'text', 'Hot take one', now() - interval '13 minutes'),
  ('tr-msg-2', 'tr-room-hot', 'tr-a2', 'text', 'Hot take two', now() - interval '12 minutes'),
  ('tr-msg-3', 'tr-room-cool', 'tr-b1', 'text', 'Cool take', now() - interval '14 minutes');

insert into public.arena_room_message_reactions (message_id, profile_id, emoji, created_at)
values
  ('tr-msg-1', 'tr-a2', '🔥', now() - interval '12 minutes'),
  ('tr-msg-2', 'tr-a1', '🔥', now() - interval '11 minutes 30 seconds');

-- One actor spamming reactions still counts once in reaction_actors for the window.
insert into public.arena_room_message_reactions (message_id, profile_id, emoji, created_at)
values
  ('tr-msg-1', 'tr-a2', '💀', now() - interval '11 minutes'),
  ('tr-msg-1', 'tr-a2', '🤯', now() - interval '11 minutes');

-- The writer counts the last completed ten-minute bucket, not a rolling
-- now()-10m window. Anchor fixture activity inside that bucket so the relative
-- ranking assertion is stable at every wall-clock minute.
create temporary table tr_fixture_clock as
 select to_timestamp(floor(extract(epoch from now()) / 600) * 600) - interval '5 minutes' as activity_at;
update public.arena_room_participants set joined_at=(select activity_at from tr_fixture_clock)
 where room_id in ('tr-room-hot','tr-room-cool');
update public.arena_room_messages set created_at=(select activity_at from tr_fixture_clock)
 where room_id in ('tr-room-hot','tr-room-cool');
update public.arena_room_message_reactions set created_at=(select activity_at from tr_fixture_clock)
 where message_id in ('tr-msg-1','tr-msg-2');
select public.refresh_arena_trend_snapshots(10, 36);

select is(
  (select attention_score from public.arena_trend_snapshots
    where topic_id = 'tr-topic-hot'
    order by bucket_at desc limit 1) >
  (select attention_score from public.arena_trend_snapshots
    where topic_id = 'tr-topic-cool'
    order by bucket_at desc limit 1),
  true,
  'hotter unique activity outranks cooler battle'
);

select ok(
  jsonb_array_length(public.list_arena_trending_battles(10)) >= 1,
  'trending list returns at least the hot battle'
);

select is(
  (public.list_arena_trending_battles(10) -> 0 ->> 'topicId'),
  'tr-topic-hot',
  'rank 1 is the hotter topic'
);

select ok(
  jsonb_array_length(public.list_arena_trending_battles(10)) <= 10,
  'trending list never exceeds 10'
);

-- Single-message hydrate requires membership.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000f001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select ok(
  public.get_arena_room_message('tr-msg-1') is not null,
  'member can hydrate a single message'
);

select throws_ok(
  $$ select public.get_arena_room_message('tr-msg-3') $$,
  '42501',
  'join the room to read it',
  'member of room A cannot hydrate room B message'
);

reset role;
select set_config('request.jwt.claims', null, true);

select * from finish();
rollback;

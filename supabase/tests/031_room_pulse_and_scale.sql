-- ============================================================================
-- Room Pulse + scale helpers (pgTAP)
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000d001'),
  ('00000000-0000-0000-0000-00000000d002'),
  ('00000000-0000-0000-0000-00000000d003');

update public.profiles set id = 'rp-a', handle = 'rp_a', name = 'Pulse A', role = 'viewer',
       reputation = 0, coins = 0, streak = 0, rank = 'Rookie'
 where auth_user_id = '00000000-0000-0000-0000-00000000d001';
update public.profiles set id = 'rp-b', handle = 'rp_b', name = 'Pulse B', role = 'viewer',
       reputation = 0, coins = 0, streak = 0, rank = 'Rookie'
 where auth_user_id = '00000000-0000-0000-0000-00000000d002';
update public.profiles set id = 'rp-c', handle = 'rp_c', name = 'Pulse C', role = 'viewer',
       reputation = 0, coins = 0, streak = 0, rank = 'Rookie'
 where auth_user_id = '00000000-0000-0000-0000-00000000d003';

insert into public.arena_daily_topics
  (id, title, description, hood, status, opens_at, final_arguments_at, judging_at, closes_at)
values
  ('rp-live', 'Pulse topic', null, 'techtakes', 'live',
   now() - interval '1 hour', now() + interval '2 hours', now() + interval '3 hours', now() + interval '4 hours');

insert into public.arena_rooms
  (id, topic_id, status, capacity, participant_count, opens_at, closes_at)
values
  ('rp-r1', 'rp-live', 'OPEN', 40, 0, now() - interval '1 hour', now() + interval '4 hours');

select has_function('public', 'get_arena_room_pulse', 'get_arena_room_pulse exists');

-- Join three debaters into the prepared room
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d001', 'role', 'authenticated')::text,
  true
);
select is((public.join_arena_topic('rp-live', 'AGREE', 'debater') ->> 'roomId'), 'rp-r1', 'A lands in rp-r1');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d002', 'role', 'authenticated')::text,
  true
);
select is((public.join_arena_topic('rp-live', 'DISAGREE', 'debater') ->> 'roomId'), 'rp-r1', 'B lands in rp-r1');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d003', 'role', 'authenticated')::text,
  true
);
select is((public.join_arena_topic('rp-live', 'UNSURE', 'debater') ->> 'roomId'), 'rp-r1', 'C lands in rp-r1');

-- A posts root
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d001', 'role', 'authenticated')::text,
  true
);
select lives_ok(
  $$ select public.post_arena_room_message('rp-r1', 'Root argument for pulse') $$,
  'A posts root'
);

-- Capture root id
create temporary table rp_ids as
  select id as root_id
    from public.arena_room_messages
   where room_id = 'rp-r1' and parent_message_id is null
   order by created_at desc
   limit 1;

-- B and C reply to the same parent (concurrent children)
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d002', 'role', 'authenticated')::text,
  true
);
select lives_ok(
  format(
    $$ select public.post_arena_room_message('rp-r1', 'Reply from B', %L) $$,
    (select root_id from rp_ids)
  ),
  'B replies to root'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d003', 'role', 'authenticated')::text,
  true
);
select lives_ok(
  format(
    $$ select public.post_arena_room_message('rp-r1', 'Reply from C', %L) $$,
    (select root_id from rp_ids)
  ),
  'C replies to same root'
);

select is(
  (
    select count(*)::integer
      from public.arena_room_messages
     where parent_message_id = (select root_id from rp_ids)
       and hidden_at is null
  ),
  2,
  'concurrent replies to the same parent both persist'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d001', 'role', 'authenticated')::text,
  true
);

select ok(
  (
    select (m ->> 'replyCount')::integer = 2
      from public.list_arena_room_messages('rp-r1', null, 50, null) m
     where m ->> 'id' = (select root_id from rp_ids)
  ),
  'replyCount reflects visible children'
);

-- Non-self reactions via RPC
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d002', 'role', 'authenticated')::text,
  true
);
select lives_ok(
  format($$ select public.react_arena_room_message(%L, '🔥') $$, (select root_id from rp_ids)),
  'B reacts'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d003', 'role', 'authenticated')::text,
  true
);
select lives_ok(
  format($$ select public.react_arena_room_message(%L, '🔥') $$, (select root_id from rp_ids)),
  'C reacts'
);

-- Need one more reactor for Top Argument threshold (>=3). Use A reacting? self excluded from pulse.
-- Post another argument from B and have A+C react — or insert third reactor by joining D.
-- Simpler: service-role insert one reaction from a fourth profile.
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000d004');
update public.profiles set id = 'rp-d', handle = 'rp_d', name = 'Pulse D', role = 'viewer',
       reputation = 0, coins = 0, streak = 0, rank = 'Rookie'
 where auth_user_id = '00000000-0000-0000-0000-00000000d004';
insert into public.arena_room_message_reactions (message_id, profile_id, emoji)
values ((select root_id from rp_ids), 'rp-d', '🔥');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d001', 'role', 'authenticated')::text,
  true
);

select ok(
  (public.get_arena_room_pulse('rp-r1') -> 'leaders') @> '[{"category":"TOP_ARGUMENT"}]'::jsonb,
  'Top Argument appears with enough non-self reactions'
);

select ok(
  not (public.get_arena_room_pulse('rp-r1') -> 'leaders') @> '[{"category":"BEST_EVIDENCE"}]'::jsonb,
  'Best Evidence omitted without qualifying evidence'
);

-- Gap recovery cursor
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d001', 'role', 'authenticated')::text,
  true
);
select lives_ok(
  $$ select public.post_arena_room_message('rp-r1', 'Brand new argument') $$,
  'newer message for gap fetch'
);

select ok(
  (
    select count(*)::integer
      from public.list_arena_room_messages(
        'rp-r1',
        null,
        50,
        now() - interval '5 seconds'
      )
  ) >= 1,
  'p_after gap fetch returns newer messages'
);

-- Hidden parent soft-fail: hide a reply parent? hide root and ensure list excludes it
reset role;
update public.arena_room_messages
   set hidden_at = now()
 where id = (select root_id from rp_ids);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d001', 'role', 'authenticated')::text,
  true
);

select ok(
  not exists (
    select 1
      from public.list_arena_room_messages('rp-r1', null, 50, null) m
     where m ->> 'id' = (select root_id from rp_ids)
  ),
  'hidden root excluded from list'
);

select ok(
  not (public.get_arena_room_pulse('rp-r1') -> 'leaders') @> '[{"category":"TOP_ARGUMENT"}]'::jsonb,
  'moderated root excluded from pulse'
);

select * from finish();
rollback;

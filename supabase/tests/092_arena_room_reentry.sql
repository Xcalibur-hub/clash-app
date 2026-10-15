-- ============================================================================
-- Arena room re-entry + capacity accounting (pgTAP) — Phase 3.2G
-- Answers: does a previously joined spectator get shed when re-entering, and
-- does capacity still bound new debaters?
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000d101'),
  ('00000000-0000-0000-0000-00000000d102'),
  ('00000000-0000-0000-0000-00000000d103'),
  ('00000000-0000-0000-0000-00000000d104');

update public.profiles set id = 'rg-f1', handle = 'rg_f1', name = 'Fighter One' where auth_user_id = '00000000-0000-0000-0000-00000000d101';
update public.profiles set id = 'rg-f2', handle = 'rg_f2', name = 'Fighter Two' where auth_user_id = '00000000-0000-0000-0000-00000000d102';
update public.profiles set id = 'rg-s1', handle = 'rg_s1', name = 'Spectator One' where auth_user_id = '00000000-0000-0000-0000-00000000d103';
update public.profiles set id = 'rg-s2', handle = 'rg_s2', name = 'Spectator Two' where auth_user_id = '00000000-0000-0000-0000-00000000d104';

insert into public.takes (id, author_id, hood, text) values ('rg-take', 'rg-f1', 'techtakes', 'Re-entry proposition');

insert into public.arena_daily_topics (id, title, description, hood, status, opens_at, final_arguments_at, judging_at, closes_at)
values ('rg-live', 'Re-entry topic', 'local pgTAP only', 'techtakes', 'live',
        now() - interval '1 hour', now() + interval '2 hours', now() + interval '3 hours', now() + interval '4 hours'),
       ('rg-duel-topic', 'Re-entry duel topic', 'local pgTAP only', 'techtakes', 'live',
        now() - interval '1 hour', now() + interval '2 hours', now() + interval '3 hours', now() + interval '4 hours');

-- A group room we will fill to capacity, and a canonical clash room (clash-linked
-- rooms are constrained by schema to exactly 2 / 2 participants).
insert into public.arena_rooms (id, topic_id, status, capacity, participant_count, opens_at, closes_at)
values ('rg-group-room', 'rg-live', 'OPEN', 20, 0, now() - interval '1 hour', now() + interval '2 hours');

insert into public.clashes (id, take_id, challenger_id, status, opens_at, closes_at)
values ('rg-clash', 'rg-take', 'rg-f2', 'open', now() - interval '1 hour', now() + interval '2 hours');

insert into public.arena_rooms (id, topic_id, clash_id, status, capacity, participant_count, opens_at, closes_at)
values ('rg-duel-room', 'rg-duel-topic', 'rg-clash', 'OPEN', 2, 2, now() - interval '1 hour', now() + interval '2 hours');

-- ── 1. First spectator join ─────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d103', 'role', 'authenticated')::text, true);
set role authenticated;

select is(public.join_arena_topic('rg-live', null, 'spectator') ->> 'role', 'spectator',
  'first spectator join records a spectator membership');
select is((select count(*)::int from public.arena_room_participants where profile_id = 'rg-s1'), 1,
  'first spectator join creates exactly one membership row');

reset role;
select set_config('request.jwt.claims', null, true);
select is((select participant_count from public.arena_rooms where id = 'rg-group-room'), 0,
  'spectator membership consumes no capacity slot');

-- ── 2. Same spectator re-entry (the 3.2F situation) ─────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d103', 'role', 'authenticated')::text, true);
set role authenticated;

select ok(public.join_arena_topic('rg-live', null, 'spectator') ->> 'roomId' is not null,
  'same spectator re-entry succeeds');
select is((select count(*)::int from public.arena_room_participants where profile_id = 'rg-s1'), 1,
  're-entry does not duplicate the membership row');

reset role;
select set_config('request.jwt.claims', null, true);
-- ── 3/4. Re-entry and a new spectator while the room sits at capacity ───────
update public.arena_rooms set participant_count = capacity where id = 'rg-group-room';

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d103', 'role', 'authenticated')::text, true);
set role authenticated;
select ok(public.join_arena_topic('rg-live', null, 'spectator') ->> 'roomId' is not null,
  'existing spectator re-enters a room that is at capacity');

reset role;
select set_config('request.jwt.claims', null, true);
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d104', 'role', 'authenticated')::text, true);
set role authenticated;
select ok(public.join_arena_topic('rg-live', null, 'spectator') ->> 'roomId' is not null,
  'a new spectator joins a room that is at capacity (requests no slot)');

reset role;
select set_config('request.jwt.claims', null, true);
select is((select participant_count from public.arena_rooms where id = 'rg-group-room'), 20,
  'spectator joins never raise participant_count above capacity');

-- ── 5. Duplicate joins from one identity ────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d104', 'role', 'authenticated')::text, true);
set role authenticated;
select public.join_arena_topic('rg-live', null, 'spectator');
select public.join_arena_topic('rg-live', null, 'spectator');
select public.join_arena_topic('rg-live', null, 'spectator');

reset role;
select set_config('request.jwt.claims', null, true);
select is((select count(*)::int from public.arena_room_participants where profile_id = 'rg-s2'), 1,
  'repeat/duplicate joins keep exactly one membership row');
select is((select participant_count from public.arena_rooms where id = 'rg-group-room'), 20,
  'duplicate joins never inflate participant_count');

-- ── 6. Fighter re-entry keeps role/stance and adds no slot ──────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d101', 'role', 'authenticated')::text, true);
set role authenticated;
select public.join_arena_topic('rg-live', 'AGREE', 'debater');

reset role;
select set_config('request.jwt.claims', null, true);
select is((select participant_count from public.arena_rooms where id = 'rg-group-room'), 20,
  'a debater cannot exceed a full room (capacity still sheds)');
select is((select count(*)::int from public.arena_room_participants where profile_id = 'rg-f1' and topic_id = 'rg-live'), 1,
  'the debater holds exactly one membership');
select is((select count(distinct room_id)::int from public.arena_room_participants where profile_id = 'rg-f1' and topic_id = 'rg-live'), 1,
  'the debater is in exactly one room');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d101', 'role', 'authenticated')::text, true);
set role authenticated;
select is(public.join_arena_topic('rg-live', 'DISAGREE', 'debater') ->> 'role', 'debater',
  'fighter re-entry still returns a debater membership');
select is(public.join_arena_topic('rg-live', 'DISAGREE', 'debater') ->> 'stance', 'AGREE',
  'fighter re-entry never rewrites the recorded stance');

reset role;
select set_config('request.jwt.claims', null, true);
select is((select count(*)::int from public.arena_room_participants where profile_id = 'rg-f1'), 1,
  'fighter re-entry adds no second membership');

-- ── 7. Canonical clash room: spectator joins a fully seated 2/2 room ────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000d103', 'role', 'authenticated')::text, true);
set role authenticated;
select ok(public.join_arena_topic('rg-duel-topic', null, 'spectator') ->> 'roomId' is not null,
  'spectator joins a clash-linked room that is fully seated (2/2)');

reset role;
select set_config('request.jwt.claims', null, true);
select is((select participant_count from public.arena_rooms where id = 'rg-duel-room'), 2,
  'a clash room stays at its mandated 2/2 seating');
select ok((select capacity from public.arena_rooms where id = 'rg-duel-room') = 2,
  'clash room capacity is the schema-mandated two seats');

select finish();
rollback;

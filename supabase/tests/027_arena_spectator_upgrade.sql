-- ============================================================================
-- Spectator → debater upgrade (pgTAP)
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000801'),
  ('00000000-0000-0000-0000-000000000802'),
  ('00000000-0000-0000-0000-000000000803'),
  ('00000000-0000-0000-0000-000000000804');

update public.profiles set id = 'up-a', handle = 'up_a', name = 'Up A', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000801';
update public.profiles set id = 'up-b', handle = 'up_b', name = 'Up B', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000802';
update public.profiles set id = 'up-c', handle = 'up_c', name = 'Up C', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000803';
update public.profiles set id = 'up-d', handle = 'up_d', name = 'Up D', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000804';

insert into public.arena_daily_topics (
  id, title, hood, status,
  opens_at, final_arguments_at, judging_at, closes_at
) values
  ('up-live', 'Upgrade topic', 'techtakes', 'live',
   now() - interval '1 hour', now() + interval '2 hours',
   now() + interval '3 hours', now() + interval '4 hours'),
  ('up-full', 'Full room topic', 'techtakes', 'live',
   now() - interval '1 hour', now() + interval '2 hours',
   now() + interval '3 hours', now() + interval '4 hours');

select has_function('public', 'upgrade_arena_spectator', 'upgrade_arena_spectator exists');
select is(
  has_function_privilege('authenticated', 'public.upgrade_arena_spectator(text,take_stance)', 'EXECUTE'),
  true,
  'authenticated can upgrade'
);
select is(
  has_function_privilege('anon', 'public.upgrade_arena_spectator(text,take_stance)', 'EXECUTE'),
  false,
  'anon cannot upgrade'
);

-- Seed a tiny-capacity room for the full-room case.
insert into public.arena_rooms (id, topic_id, status, capacity, participant_count, opens_at, closes_at)
values
  ('up-room-full', 'up-full', 'OPEN', 20, 20,
   now() - interval '1 hour', now() + interval '4 hours');

-- ── Spectator upgrades to debater ───────────────────────────────────────────
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000801', 'role', 'authenticated')::text,
  true
);
set role authenticated;

select is(
  public.join_arena_topic('up-live', null, 'spectator') ->> 'role',
  'spectator',
  'A joins as spectator'
);

select is(
  (public.upgrade_arena_spectator(
     (select room_id from public.arena_room_participants where profile_id = 'up-a' and topic_id = 'up-live'),
     'AGREE'
   ) ->> 'upgraded'),
  'true',
  'spectator upgrades to debater'
);

select is(
  (select role::text from public.arena_room_participants where profile_id = 'up-a' and topic_id = 'up-live'),
  'debater',
  'role is debater after upgrade'
);

select is(
  (select initial_stance::text from public.arena_room_participants where profile_id = 'up-a' and topic_id = 'up-live'),
  'AGREE',
  'initial stance recorded during upgrade'
);

select is(
  (select participant_count from public.arena_rooms r
    join public.arena_room_participants p on p.room_id = r.id
   where p.profile_id = 'up-a' and p.topic_id = 'up-live'),
  1,
  'participant_count increments once on upgrade'
);

-- Same stance again → idempotent (upgraded=false), count unchanged.
select is(
  (public.upgrade_arena_spectator(
     (select room_id from public.arena_room_participants where profile_id = 'up-a' and topic_id = 'up-live'),
     'AGREE'
   ) ->> 'upgraded'),
  'false',
  'duplicate upgrade with same stance is idempotent'
);

select is(
  (select participant_count from public.arena_rooms r
    join public.arena_room_participants p on p.room_id = r.id
   where p.profile_id = 'up-a' and p.topic_id = 'up-live'),
  1,
  'participant_count does not double-increment'
);

select throws_ok(
  $$ select public.upgrade_arena_spectator(
       (select room_id from public.arena_room_participants where profile_id = 'up-a' and topic_id = 'up-live'),
       'DISAGREE'
     ) $$,
  'P0006',
  'already a debater',
  'cannot re-upgrade with a different stance'
);

-- Debater cannot downgrade via direct write (no UPDATE grant) or RPC.
select throws_ok(
  $$ update public.arena_room_participants
        set role = 'spectator', initial_stance = null
      where profile_id = 'up-a' $$,
  '42501',
  null,
  'client cannot downgrade via direct update'
);

-- Upgraded user can post.
select lives_ok(
  $$ select public.post_arena_room_message(
       (select room_id from public.arena_room_participants where profile_id = 'up-a' and topic_id = 'up-live'),
       'I upgraded and now argue', null, null, null, null, null
     ) $$,
  'upgraded debater can post'
);

select lives_ok(
  $$ select public.submit_arena_evidence(
       (select room_id from public.arena_room_participants where profile_id = 'up-a' and topic_id = 'up-live'),
       'link', 'Upgrade proof', 'https://example.com/proof', null, null
     ) $$,
  'upgraded debater can submit evidence'
);

-- Stance privacy: other user cannot read A's stance row.
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000802', 'role', 'authenticated')::text,
  true
);
set role authenticated;

select is(
  (select count(*)::int from public.arena_room_participants
    where profile_id = 'up-a' and topic_id = 'up-live'),
  0,
  'stance row remains private from other viewers'
);

-- B spectators then we fill capacity and upgrade fails with P0009.
select is(
  public.join_arena_topic('up-full', null, 'spectator') ->> 'role',
  'spectator',
  'B watches the full room as spectator'
);

-- Force B into the full room (join may have created a new room if none OPEN
-- under capacity — pin membership to up-room-full).
reset role;
select set_config('request.jwt.claims', null, true);

-- Ensure B is a spectator on the full room specifically.
delete from public.arena_room_participants where profile_id = 'up-b' and topic_id = 'up-full';
insert into public.arena_room_participants (room_id, topic_id, profile_id, initial_stance, role)
values ('up-room-full', 'up-full', 'up-b', null, 'spectator');
-- Keep capacity full with synthetic debaters so upgrade must fail.
update public.arena_rooms set participant_count = 20, capacity = 20 where id = 'up-room-full';

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000802', 'role', 'authenticated')::text,
  true
);
set role authenticated;

select throws_ok(
  $$ select public.upgrade_arena_spectator('up-room-full', 'UNSURE') $$,
  'P0009',
  'room is full',
  'upgrade respects room capacity'
);

select is(
  (select role::text from public.arena_room_participants where profile_id = 'up-b' and room_id = 'up-room-full'),
  'spectator',
  'failed upgrade leaves the user as spectator'
);

-- Voting after upgrade into a judging room.
reset role;
select set_config('request.jwt.claims', null, true);

insert into public.arena_rooms (id, topic_id, status, capacity, participant_count, opens_at, closes_at)
values ('up-room-judge', 'up-live', 'JUDGING', 40, 0,
        now() - interval '1 hour', now() + interval '4 hours');

delete from public.arena_room_participants where profile_id = 'up-c';
insert into public.arena_room_participants (room_id, topic_id, profile_id, initial_stance, role)
values ('up-room-judge', 'up-live', 'up-c', null, 'spectator');

-- Need a message to vote for (from another profile).
insert into public.arena_room_participants (room_id, topic_id, profile_id, initial_stance, role)
values ('up-room-judge', 'up-live', 'up-d', 'DISAGREE', 'debater')
on conflict do nothing;
update public.arena_rooms set participant_count = 1 where id = 'up-room-judge';
insert into public.arena_room_messages (id, room_id, author_id, kind, body)
values ('up-msg-1', 'up-room-judge', 'up-d', 'text', 'Best argument candidate');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000803', 'role', 'authenticated')::text,
  true
);
set role authenticated;

select is(
  (public.upgrade_arena_spectator('up-room-judge', 'UNSURE') ->> 'upgraded'),
  'true',
  'spectator can upgrade during JUDGING'
);

select lives_ok(
  $$ select public.submit_arena_side_vote('up-room-judge', 'AGREE') $$,
  'upgraded user can side-vote in judging'
);

select lives_ok(
  $$ select public.submit_arena_argument_vote('up-room-judge', 'up-msg-1') $$,
  'upgraded user can vote best argument'
);

-- Reputation remains server-only: no client insert.
select throws_ok(
  $$ insert into public.reputation_events
       (id, profile_id, kind, reputation_delta, coins_delta, arena_room_id)
     values ('up-fake', 'up-c', 'arena_participation', 10, 0, 'up-room-judge') $$,
  '42501',
  null,
  'client cannot invent arena reputation'
);

select finish();
rollback;

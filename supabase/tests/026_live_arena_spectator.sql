-- ============================================================================
-- Live Arena spectator + UNSURE + realtime publication (pgTAP)
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000701'),
  ('00000000-0000-0000-0000-000000000702'),
  ('00000000-0000-0000-0000-000000000703'),
  ('00000000-0000-0000-0000-000000000704'),
  ('00000000-0000-0000-0000-000000000705');

update public.profiles set id = 'sp-a', handle = 'sp_a', name = 'Spec A', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000701';
update public.profiles set id = 'sp-b', handle = 'sp_b', name = 'Spec B', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000702';
update public.profiles set id = 'sp-c', handle = 'sp_c', name = 'Spec C', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000703';
update public.profiles set id = 'sp-d', handle = 'sp_d', name = 'Spec D', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000704';
update public.profiles set id = 'sp-e', handle = 'sp_e', name = 'Spec E', role = 'viewer', reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000705';

insert into public.arena_daily_topics (
  id, title, description, hood, status,
  opens_at, final_arguments_at, judging_at, closes_at
) values (
  'sp-live',
  'Spectator room topic',
  'local pgTAP only',
  'techtakes',
  'live',
  now() - interval '1 hour',
  now() + interval '2 hours',
  now() + interval '3 hours',
  now() + interval '4 hours'
);

-- ── Realtime publication ────────────────────────────────────────────────────
select ok(
  exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'arena_room_messages'
  ),
  'arena_room_messages is published on supabase_realtime'
);

select ok(
  not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'arena_room_evidence'
  ),
  'arena_room_evidence is not in the minimum realtime publication'
);

-- ── UNSURE join ─────────────────────────────────────────────────────────────
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000701', 'role', 'authenticated')::text,
  true
);
set role authenticated;

select is(
  public.join_arena_topic('sp-live', 'UNSURE', 'debater') ->> 'stance',
  'UNSURE',
  'UNSURE debater join records UNSURE stance'
);
select is(
  public.join_arena_topic('sp-live', 'UNSURE', 'debater') ->> 'role',
  'debater',
  'UNSURE join is a debater membership'
);

reset role;
select set_config('request.jwt.claims', null, true);

-- Seed a message + evidence from the UNSURE debater (as owner/security definer).
insert into public.arena_room_messages (id, room_id, author_id, kind, body, created_at)
select 'sp-msg-1', p.room_id, 'sp-a', 'text', 'Debater argument visible to spectators', now()
  from public.arena_room_participants p
 where p.topic_id = 'sp-live' and p.profile_id = 'sp-a';

insert into public.arena_room_evidence (
  id, room_id, topic_id, author_id, kind, title, source_url, useful_count, created_at
)
select
  'sp-ev-1', p.room_id, 'sp-live', 'sp-a', 'link',
  'Public citation', 'https://example.com/survey', 0, now()
  from public.arena_room_participants p
 where p.topic_id = 'sp-live' and p.profile_id = 'sp-a';

-- ── Spectator join + read ───────────────────────────────────────────────────
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000702', 'role', 'authenticated')::text,
  true
);
set role authenticated;

select throws_ok(
  $$ select public.join_arena_topic('sp-live', 'AGREE', 'spectator') $$,
  'P0003',
  'spectators do not record a stance',
  'spectator join with a stance is rejected'
);

select is(
  public.join_arena_topic('sp-live', null, 'spectator') ->> 'role',
  'spectator',
  'spectator join succeeds without a stance'
);
select is(
  public.join_arena_topic('sp-live', null, 'spectator') ->> 'stance',
  null,
  'spectator membership has null stance'
);

select is(
  (select count(*)::int from public.list_arena_room_messages(
    (select room_id from public.arena_room_participants where profile_id = 'sp-b' and topic_id = 'sp-live'),
    null, 50
  )),
  1,
  'spectator can read sanitized transcript'
);

select is(
  (select count(*)::int from public.list_arena_room_evidence(
    (select room_id from public.arena_room_participants where profile_id = 'sp-b' and topic_id = 'sp-live'),
    50
  )),
  1,
  'spectator can read evidence rail'
);

select throws_ok(
  $$ select public.post_arena_room_message(
       (select room_id from public.arena_room_participants where profile_id = 'sp-b' and topic_id = 'sp-live'),
       'spectator should not post', null, null, null, null, null
     ) $$,
  '42501',
  'spectators cannot post',
  'spectator cannot post messages'
);

select throws_ok(
  $$ select public.submit_arena_evidence(
       (select room_id from public.arena_room_participants where profile_id = 'sp-b' and topic_id = 'sp-live'),
       'link', 'Nope', 'https://example.com/x', null, null
     ) $$,
  '42501',
  'spectators cannot upload evidence',
  'spectator cannot upload evidence'
);

select throws_ok(
  $$ select public.react_arena_room_message('sp-msg-1', '🔥') $$,
  '42501',
  'spectators cannot react',
  'spectator cannot react'
);

-- Force JUDGING so vote gates are reachable.
reset role;
select set_config('request.jwt.claims', null, true);
update public.arena_rooms
   set status = 'JUDGING'
 where id = (select room_id from public.arena_room_participants where profile_id = 'sp-a' limit 1);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000702', 'role', 'authenticated')::text,
  true
);
set role authenticated;

select throws_ok(
  $$ select public.submit_arena_side_vote(
       (select room_id from public.arena_room_participants where profile_id = 'sp-b' and topic_id = 'sp-live'),
       'AGREE'
     ) $$,
  '42501',
  'only debaters may vote',
  'spectator cannot side-vote'
);

select throws_ok(
  $$ select public.submit_arena_argument_vote(
       (select room_id from public.arena_room_participants where profile_id = 'sp-b' and topic_id = 'sp-live'),
       'sp-msg-1'
     ) $$,
  '42501',
  'only debaters may vote',
  'spectator cannot argument-vote'
);

-- Private stance/ballots: spectator cannot read another participant's row or votes.
select is(
  (select count(*)::int
     from public.arena_room_participants
    where topic_id = 'sp-live' and profile_id = 'sp-a'),
  0,
  'spectator cannot select another member stance row'
);

select is(
  (select count(*)::int from public.arena_room_side_votes),
  0,
  'spectator cannot select side ballots'
);

-- ── Block filtering for spectator reads ─────────────────────────────────────
reset role;
select set_config('request.jwt.claims', null, true);

insert into public.blocks (blocker_id, blocked_id) values ('sp-b', 'sp-a');

insert into public.arena_room_messages (id, room_id, author_id, kind, body, created_at)
select 'sp-msg-blocked', p.room_id, 'sp-a', 'text', 'Should be hidden from blocker spectator', now()
  from public.arena_room_participants p
 where p.profile_id = 'sp-a' and p.topic_id = 'sp-live';

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000702', 'role', 'authenticated')::text,
  true
);
set role authenticated;

select is(
  (select count(*)::int from public.list_arena_room_messages(
    (select room_id from public.arena_room_participants where profile_id = 'sp-b' and topic_id = 'sp-live'),
    null, 50
  ) m where m ->> 'id' = 'sp-msg-blocked'),
  0,
  'spectator transcript still filters blocked authors'
);

-- Evidence from blocked author also filtered.
select is(
  (select count(*)::int from public.list_arena_room_evidence(
    (select room_id from public.arena_room_participants where profile_id = 'sp-b' and topic_id = 'sp-live'),
    50
  ) e where e ->> 'id' = 'sp-ev-1'),
  0,
  'spectator evidence rail filters blocked authors'
);

-- Spectator cannot record final stance even if room were settled.
reset role;
select set_config('request.jwt.claims', null, true);
update public.arena_rooms
   set status = 'SETTLED'
 where id = (select room_id from public.arena_room_participants where profile_id = 'sp-a' limit 1);
insert into public.arena_room_results (
  room_id, winning_side, agree_votes, disagree_votes, participant_count,
  mindshift_changed_count, mindshift_completed_count
)
select p.room_id, 'DRAW', 0, 0, 1, 0, 0
  from public.arena_room_participants p
 where p.profile_id = 'sp-a' and p.topic_id = 'sp-live'
on conflict do nothing;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000702', 'role', 'authenticated')::text,
  true
);
set role authenticated;

select throws_ok(
  $$ select public.record_arena_final_stance(
       (select room_id from public.arena_room_participants where profile_id = 'sp-b' and topic_id = 'sp-live'),
       'AGREE'
     ) $$,
  '42501',
  'spectators cannot record a stance',
  'spectator cannot record final stance'
);

-- No participation reputation for spectators (settlement awards debaters only).
reset role;
select set_config('request.jwt.claims', null, true);
select is(
  (select count(*)::int from public.reputation_events
    where profile_id = 'sp-b' and kind::text like 'arena_%'),
  0,
  'spectator has no arena reputation events'
);

select finish();
rollback;

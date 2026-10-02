-- ============================================================================
-- Phase 13.5 — Arena feel alive (poster column + live preview RPC)
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000d001'),
  ('00000000-0000-0000-0000-00000000d002');

update public.profiles set id = 'alive-a', handle = 'alive_a', name = 'Alive A', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-00000000d001';
update public.profiles set id = 'alive-b', handle = 'alive_b', name = 'Alive B', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-00000000d002';

select has_column('public', 'takes', 'media_poster_url', 'takes.media_poster_url exists');
select has_function('public', 'list_live_arena_topic_previews', 'list_live_arena_topic_previews exists');

select is(
  has_function_privilege('authenticated', 'public.list_live_arena_topic_previews(text, integer)', 'EXECUTE'),
  true,
  'authenticated can read topic previews'
);
select is(
  has_function_privilege('anon', 'public.list_live_arena_topic_previews(text, integer)', 'EXECUTE'),
  true,
  'anon can read topic previews'
);

insert into public.arena_daily_topics (
  id, title, hood, status, opens_at, final_arguments_at, judging_at, closes_at
) values (
  'alive-topic-1',
  'Should remote work be the default?',
  'techtakes',
  'live',
  now() - interval '1 hour',
  now() + interval '2 hours',
  now() + interval '3 hours',
  now() + interval '4 hours'
);

insert into public.arena_rooms (
  id, topic_id, status, capacity, participant_count, opens_at, closes_at
) values (
  'alive-room-1', 'alive-topic-1', 'OPEN', 50, 2, now() - interval '1 hour', now() + interval '4 hours'
);

insert into public.arena_room_participants (room_id, topic_id, profile_id, initial_stance, role)
values
  ('alive-room-1', 'alive-topic-1', 'alive-a', 'AGREE', 'debater'),
  ('alive-room-1', 'alive-topic-1', 'alive-b', 'DISAGREE', 'debater');

insert into public.arena_room_messages (id, room_id, author_id, kind, body)
values
  ('alive-msg-1', 'alive-room-1', 'alive-a', 'text', 'Remote work unlocks talent cities never had access to.'),
  ('alive-msg-2', 'alive-room-1', 'alive-b', 'text', 'Offices still matter for mentorship and culture.'),
  ('alive-msg-hidden', 'alive-room-1', 'alive-a', 'text', 'This should never surface on home.');

update public.arena_room_messages set hidden_at = now() where id = 'alive-msg-hidden';

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}', true);

select is(
  (select jsonb_array_length(public.list_live_arena_topic_previews('alive-topic-1', 4)->'excerpts')),
  2,
  'preview returns two visible excerpts'
);

select ok(
  not exists (
    select 1
      from jsonb_array_elements(public.list_live_arena_topic_previews('alive-topic-1', 4)->'excerpts') e
     where e->>'id' = 'alive-msg-hidden'
  ),
  'hidden messages are excluded from home preview'
);

select ok(
  (public.list_live_arena_topic_previews('alive-topic-1', 4)->'excerpts'->0) ? 'handle',
  'excerpt exposes public handle'
);

select ok(
  not ((public.list_live_arena_topic_previews('alive-topic-1', 4)->'excerpts'->0) ? 'stance'),
  'excerpt never exposes stance'
);

select ok(
  jsonb_array_length(public.list_live_arena_topic_previews('alive-topic-1', 4)->'presence') >= 1,
  'presence sample includes debaters'
);

reset role;
select set_config('request.jwt.claims', null, true);

insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, visibility, status)
values ('m-alive-vid', 'alive-a', 'public-media', 'alive-a/m-alive-vid/m-alive-vid.mp4', 'video', 'video/mp4', 'public', 'ready');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}', true);

select lives_ok(
  $$ select public.create_take(
       'techtakes',
       'video take with poster',
       'm-alive-vid',
       'http://127.0.0.1/public-media/alive-a/m-alive-vid/m-alive-vid.mp4',
       'http://127.0.0.1/public-media/alive-a/m-alive-vid/poster.jpg'
     ) $$,
  'create_take accepts media_poster_url'
);

reset role;
select is(
  (select media_poster_url from public.takes where text = 'video take with poster'),
  'http://127.0.0.1/public-media/alive-a/m-alive-vid/poster.jpg',
  'poster url stored on take'
);

reset role;
select finish();
rollback;

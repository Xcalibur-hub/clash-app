-- ============================================================================
-- Phase 14.1 — Challenges + Treasure Play (pgTAP)
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

select has_function('public', 'join_challenge', 'join_challenge exists');
select has_function('public', 'submit_challenge_entry', 'submit_challenge_entry exists');
select has_function('public', 'toggle_challenge_entry_reaction', 'reaction toggle exists');
select has_function('public', 'settle_challenge', 'settle_challenge exists');
select has_function('public', 'list_play_home', 'list_play_home exists');
select has_function('public', 'join_treasure_hunt', 'join_treasure_hunt exists');
select has_function('public', 'submit_treasure_answer', 'submit_treasure_answer exists');
select has_function('public', 'complete_content_clue', 'complete_content_clue exists');
select has_function('public', 'claim_treasure_reward', 'claim_treasure_reward exists');
select has_function('public', 'get_my_play', 'get_my_play exists');

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000f001'),
  ('00000000-0000-0000-0000-00000000f002'),
  ('00000000-0000-0000-0000-00000000f003');

update public.profiles set id = 'play-a', handle = 'play_a', name = 'Play A',
       public_country_code = 'IN', role = 'creator'
 where auth_user_id = '00000000-0000-0000-0000-00000000f001';
update public.profiles set id = 'play-b', handle = 'play_b', name = 'Play B',
       public_country_code = 'IN'
 where auth_user_id = '00000000-0000-0000-0000-00000000f002';
update public.profiles set id = 'play-c', handle = 'play_c', name = 'Play C',
       public_country_code = 'JP'
 where auth_user_id = '00000000-0000-0000-0000-00000000f003';

insert into public.media_objects
  (id, owner_id, bucket, storage_path, media_kind, mime_type, visibility, status)
values
  ('play-media-a', 'play-a', 'public-media', 'play/a.jpg', 'image', 'image/jpeg', 'public', 'ready'),
  ('play-media-b', 'play-b', 'public-media', 'play/b.jpg', 'image', 'image/jpeg', 'public', 'ready'),
  ('play-media-priv', 'play-a', 'private-media', 'play/priv.jpg', 'image', 'image/jpeg', 'private', 'ready')
on conflict (id) do nothing;

insert into public.explore_challenges
  (id, title, description, challenge_type, country_code, creator_id,
   starts_at, ends_at, status, visibility, cover_url)
values
  ('ec_play_1', 'Sunset city', 'show it', 'GLOBAL', null, 'play-a',
   now() - interval '1 hour', now() + interval '2 days', 'active', 'public',
   'https://example.com/sunset.jpg'),
  ('ec_play_ended', 'Old challenge', 'done', 'GLOBAL', null, 'play-a',
   now() - interval '3 days', now() - interval '1 hour', 'active', 'public', null);

-- Challenge join
select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000f001', 'role', 'authenticated')::text,
  true
);

select ok(
  (public.join_challenge('ec_play_1') ->> 'joined')::boolean,
  'challenge join succeeds'
);

select ok(
  (public.join_challenge('ec_play_1') ->> 'joined')::boolean,
  'duplicate join is idempotent'
);

select is(
  (select count(*)::integer from public.explore_challenge_participants
    where challenge_id = 'ec_play_1' and profile_id = 'play-a'),
  1,
  'one participant row after duplicate join'
);

-- Submission eligibility
select ok(
  (public.submit_challenge_entry('ec_play_1', 'play-media-a', 'golden hour') ? 'entryId'),
  'submission succeeds with owned public media'
);

select throws_ok(
  $$select public.submit_challenge_entry('ec_play_1', 'play-media-a', 'again')$$,
  'P0006',
  null,
  'duplicate submission rejected'
);

-- Submission after expiry rejected
select throws_ok(
  $$select public.submit_challenge_entry('ec_play_ended', 'play-media-a', 'late')$$,
  'P0003',
  null,
  'submission after expiry rejected'
);

-- Second user entry + reactions
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000f002', 'role', 'authenticated')::text,
  true
);
select ok((public.join_challenge('ec_play_1') ->> 'joined')::boolean, 'b joins');
select ok(
  (public.submit_challenge_entry('ec_play_1', 'play-media-b', 'street') ? 'entryId'),
  'b submits'
);

select throws_ok(
  $$select public.toggle_challenge_entry_reaction(
     (select id from public.explore_challenge_entries where challenge_id = 'ec_play_1' and profile_id = 'play-b')
   )$$,
  'P0005',
  null,
  'self-reaction blocked'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000f001', 'role', 'authenticated')::text,
  true
);

select ok(
  (public.toggle_challenge_entry_reaction(
     (select id from public.explore_challenge_entries where challenge_id = 'ec_play_1' and profile_id = 'play-b')
   ) ->> 'reacted')::boolean,
  'reaction added'
);

select ok(
  not (public.toggle_challenge_entry_reaction(
     (select id from public.explore_challenge_entries where challenge_id = 'ec_play_1' and profile_id = 'play-b')
   ) ->> 'reacted')::boolean,
  'reaction toggle off'
);

select ok(
  (public.toggle_challenge_entry_reaction(
     (select id from public.explore_challenge_entries where challenge_id = 'ec_play_1' and profile_id = 'play-b')
   ) ->> 'reacted')::boolean,
  'reaction toggle on again (idempotent shape)'
);

-- Block filtering
reset role;
select set_config('request.jwt.claims', null, true);
insert into public.blocks (blocker_id, blocked_id)
values ('play-a', 'play-b')
on conflict do nothing;

select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000f001', 'role', 'authenticated')::text,
  true
);

select ok(
  (public.list_challenge_entries('ec_play_1', 'trending', 24, 0) -> 'items')::text
    not like '%play-b%',
  'blocked author entries hidden from viewer'
);

reset role;
select set_config('request.jwt.claims', null, true);
delete from public.blocks where blocker_id = 'play-a' and blocked_id = 'play-b';

-- Settlement idempotency + server-authoritative result
reset role;
select set_config('request.jwt.claims', null, true);

update public.explore_challenges
   set ends_at = now() - interval '1 minute'
 where id = 'ec_play_1';

select ok(
  (public.settle_challenge('ec_play_1') ->> 'winnerProfileId') = 'play-b',
  'winner is highest reactions entry'
);

select ok(
  (public.settle_challenge('ec_play_1') ->> 'alreadySettled')::boolean,
  'settle is idempotent'
);

-- Treasure hunt with clues (answers never client-readable)
insert into public.explore_treasure_hunts
  (id, title, description, country_code, creator_id, starts_at, ends_at, status, clue,
   reward_type, reward_metadata, gifts_remaining, visibility, hunt_type, clue_count, cover_url)
values
  ('th_play_1', 'Midnight trail', 'digital', 'IN', 'play-a',
   now() - interval '1 hour', now() + interval '1 day', 'active',
   'Follow the hush.', 'badge', '{"label":"Midnight Explorer"}'::jsonb, 1, 'public',
   'COUNTRY', 3, 'https://example.com/hunt.jpg');

insert into public.explore_treasure_clues
  (id, hunt_id, sort_order, clue_type, prompt, choices, answer_digest)
values
  ('tcl_1', 'th_play_1', 1, 'TEXT_ANSWER', 'What city is hidden?', '[]'::jsonb,
   public.explore_answer_digest('tcl_1', 'Mumbai')),
  ('tcl_2', 'th_play_1', 2, 'MULTIPLE_CHOICE', 'Pick the symbol', '["moon","sun","wave"]'::jsonb,
   public.explore_answer_digest('tcl_2', 'moon'));

-- CONTENT_FIND against a public take
insert into public.takes
  (id, author_id, hood, text, status, expires_at, created_at)
values
  ('take_play_mark', 'play-a', 'techtakes', 'public mark for treasure', 'active',
   now() + interval '20 hours', now())
on conflict (id) do nothing;

insert into public.explore_treasure_clues
  (id, hunt_id, sort_order, clue_type, prompt, content_target_kind, content_target_id)
values
  ('tcl_3', 'th_play_1', 3, 'CONTENT_FIND', 'Find the public mark', 'take', 'take_play_mark');

-- Future clue not leaked
select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000f002', 'role', 'authenticated')::text,
  true
);

select ok(
  public.join_treasure_hunt('th_play_1') ->> 'joined' = 'true',
  'treasure join succeeds'
);

select ok(
  (public.get_treasure_detail('th_play_1') -> 'currentClue' ->> 'id') = 'tcl_1',
  'only current clue returned'
);

select ok(
  (public.get_treasure_detail('th_play_1')::text) not like '%answer_digest%',
  'answer digests never appear in client payload'
);

select ok(
  (public.get_treasure_detail('th_play_1')::text) not like '%Mumbai%',
  'correct answer text never shipped'
);

select ok(
  not (public.submit_treasure_answer('th_play_1', 'tcl_1', 'Delhi') ->> 'correct')::boolean,
  'wrong answer rejected'
);

select ok(
  (public.submit_treasure_answer('th_play_1', 'tcl_1', 'Mumbai') ->> 'correct')::boolean,
  'correct answer accepted'
);

select is(
  (public.get_treasure_detail('th_play_1') ->> 'progress')::integer,
  1,
  'progress persists'
);

select throws_ok(
  $$select public.complete_content_clue('th_play_1', 'tcl_3', 'take_play_mark')$$,
  'P0005',
  null,
  'future clue locked until prior solved'
);

select ok(
  (public.submit_treasure_answer('th_play_1', 'tcl_2', 'moon') ->> 'correct')::boolean,
  'multiple choice correct'
);

select ok(
  (public.complete_content_clue('th_play_1', 'tcl_3', 'take_play_mark') ->> 'completed')::boolean,
  'content-find completes hunt'
);

-- Private / subscriber content excluded from content-find
reset role;
select set_config('request.jwt.claims', null, true);
insert into public.creator_vaults (id, creator_id, title, status)
values ('pv_play', 'play-a', 'Play Vault', 'active')
on conflict do nothing;

insert into public.vault_drops
  (id, vault_id, creator_id, caption, media_object_id, access_level, status, published_at, expires_at)
values
  ('vd_sub_play', 'pv_play', 'play-a', 'Sub only', 'play-media-priv', 'subscriber', 'published',
   now(), now() + interval '7 days')
on conflict (id) do nothing;

-- Craft a second hunt with vault_drop target that is subscriber-only → must fail
insert into public.explore_treasure_hunts
  (id, title, description, starts_at, ends_at, status, clue, reward_type,
   gifts_remaining, visibility, hunt_type, clue_count)
values
  ('th_play_priv', 'Private bait', null, now() - interval '1 hour', now() + interval '1 day',
   'active', 'secret', 'badge', 5, 'public', 'GLOBAL', 1);

insert into public.explore_treasure_clues
  (id, hunt_id, sort_order, clue_type, prompt, content_target_kind, content_target_id)
values
  ('tcl_priv', 'th_play_priv', 1, 'CONTENT_FIND', 'find drop', 'vault_drop', 'vd_sub_play');

select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000f002', 'role', 'authenticated')::text,
  true
);

select ok(
  (public.join_treasure_hunt('th_play_priv') ->> 'joined')::boolean,
  'join private-target hunt'
);

select ok(
  not (public.complete_content_clue('th_play_priv', 'tcl_priv', 'vd_sub_play') ->> 'correct')::boolean,
  'subscriber vault drop cannot satisfy content-find'
);

-- Claim idempotency + limited inventory atomicity
select ok(
  (public.claim_treasure_reward('th_play_1') ->> 'claimed')::boolean,
  'claim succeeds'
);

select ok(
  (public.claim_treasure_reward('th_play_1') ->> 'alreadyClaimed')::boolean,
  'claim retry idempotent'
);

select is(
  (select gifts_remaining from public.explore_treasure_hunts where id = 'th_play_1'),
  0,
  'inventory decremented once'
);

-- Second user cannot claim when inventory empty
reset role;
select set_config('request.jwt.claims', null, true);
insert into public.explore_treasure_progress (hunt_id, profile_id, progress, completed_at)
values ('th_play_1', 'play-c', 3, now())
on conflict (hunt_id, profile_id) do update
  set progress = 3, completed_at = now();

select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000f003', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  $$select public.claim_treasure_reward('th_play_1')$$,
  'P0004',
  null,
  'empty inventory cannot go negative'
);

select is(
  (select gifts_remaining from public.explore_treasure_hunts where id = 'th_play_1'),
  0,
  'gifts remaining stays non-negative'
);

-- Clients cannot read clue digests directly
select is(
  has_table_privilege('authenticated', 'public.explore_treasure_clues', 'SELECT'),
  false,
  'clients cannot select treasure clues table'
);

select is(
  has_table_privilege('authenticated', 'public.explore_challenge_entries', 'INSERT'),
  false,
  'clients cannot insert challenge entries directly'
);

select * from finish();
rollback;

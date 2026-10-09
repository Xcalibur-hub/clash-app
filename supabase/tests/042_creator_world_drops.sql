-- ============================================================================
-- Phase 15.3 — Creator World Drops (pgTAP). Run: supabase test db
-- Covers: creator-only creation, cross-creator mutation denial, unpublished and
-- expired hiding, idempotent claims, blocks, server-only reward granting,
-- content-unlock entitlement, private/hidden media and coarse-location privacy.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

select has_function('public', 'create_creator_world_drop', 'create RPC exists');
select has_function('public', 'set_creator_world_drop_status', 'status RPC exists');
select has_function('public', 'claim_world_drop', 'claim RPC exists');
select has_function('public', 'list_creator_world_drops', 'creator list RPC exists');
select has_function('public', 'list_explore_world_drops', 'explore shelf RPC exists');
select has_function('public', 'get_my_world_artifacts', 'collection RPC exists');

-- Privileges: guests get nothing; rewards are never client-writable.
select is(has_function_privilege('anon', 'public.claim_world_drop(text)', 'EXECUTE'), false, 'anon cannot claim');
select is(has_function_privilege('anon', 'public.create_creator_world_drop(text,text,public.world_drop_type,public.world_drop_reward,text,text,double precision,double precision,text,timestamptz)', 'EXECUTE'), false, 'anon cannot create');
select is(has_function_privilege('authenticated', 'public.claim_world_drop(text)', 'EXECUTE'), true, 'authenticated may claim');
select is(has_table_privilege('authenticated', 'public.world_drop_claims', 'INSERT'), false, 'claims are never client-inserted');
select is(has_table_privilege('authenticated', 'public.world_drop_claims', 'UPDATE'), false, 'claims are never client-updated');
select is(has_column_privilege('authenticated', 'public.world_drops', 'clue', 'SELECT'), false, 'the clue is not directly readable');
select is(has_column_privilege('authenticated', 'public.world_drops', 'reward_payload', 'SELECT'), false, 'the reward payload is not directly readable');
select is(has_column_privilege('authenticated', 'public.world_drops', 'reward_ref', 'SELECT'), false, 'the reward target is not directly readable');
select is(has_column_privilege('authenticated', 'public.world_drops', 'id', 'SELECT'), true, 'safe columns stay readable');
select hasnt_column('public', 'world_drops', 'latitude', 'no raw latitude column exists');
select hasnt_column('public', 'world_drops', 'longitude', 'no raw longitude column exists');

-- Fixtures
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000d201'),
  ('00000000-0000-0000-0000-00000000d202'),
  ('00000000-0000-0000-0000-00000000d203'),
  ('00000000-0000-0000-0000-00000000d204'),
  ('00000000-0000-0000-0000-00000000d205');

update public.profiles set id = 'wd-maya',    handle = 'wd_maya',    name = 'WD Maya',    role = 'creator' where auth_user_id = '00000000-0000-0000-0000-00000000d201';
update public.profiles set id = 'wd-leo',     handle = 'wd_leo',     name = 'WD Leo',     role = 'creator' where auth_user_id = '00000000-0000-0000-0000-00000000d202';
update public.profiles set id = 'wd-fan',     handle = 'wd_fan',     name = 'WD Fan',     role = 'viewer'  where auth_user_id = '00000000-0000-0000-0000-00000000d203';
update public.profiles set id = 'wd-blocked', handle = 'wd_blocked', name = 'WD Blocked', role = 'creator' where auth_user_id = '00000000-0000-0000-0000-00000000d204';
update public.profiles set id = 'wd-rate',    handle = 'wd_rate',    name = 'WD Rate',    role = 'viewer'  where auth_user_id = '00000000-0000-0000-0000-00000000d205';

insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, status, visibility) values
  ('wd-maya-pub', 'wd-maya', 'public-media', 'wd/maya.png', 'image', 'image/png', 'ready', 'public'),
  ('wd-maya-priv', 'wd-maya', 'private-media', 'wd/maya-priv.png', 'image', 'image/png', 'ready', 'private'),
  ('wd-leo-pub', 'wd-leo', 'public-media', 'wd/leo.png', 'image', 'image/png', 'ready', 'public'),
  ('wd-leo-priv', 'wd-leo', 'private-media', 'wd/leo-priv.png', 'image', 'image/png', 'ready', 'private');

insert into public.creator_vaults (id, creator_id, title, status) values
  ('wd-maya-vault', 'wd-maya', 'WD Maya World', 'active'),
  ('wd-leo-vault', 'wd-leo', 'WD Leo World', 'active'),
  ('wd-blocked-vault', 'wd-blocked', 'WD Blocked World', 'active');

-- Leo owns a free Drop and a subscriber Drop (the unlock target).
-- `vault_drops_window` pins expires_at to published_at + 7 days.
insert into public.vault_drops
  (id, vault_id, creator_id, caption, media_object_id, access_level, status, published_at, expires_at)
select
  v.id, 'wd-leo-vault', 'wd-leo', v.caption, v.media_object_id,
  v.access_level::public.vault_drop_access, 'published'::public.vault_drop_status,
  v.published_at, v.published_at + interval '7 days'
from (values
  ('wd-leo-free', 'Leo free cut', 'wd-leo-pub', 'free', now() - interval '1 day'),
  ('wd-leo-sub', 'Leo members cut', 'wd-leo-priv', 'subscriber', now() - interval '1 day')
) as v(id, caption, media_object_id, access_level, published_at);

-- The blocked creator blocks the fan.
insert into public.blocks (blocker_id, blocked_id) values ('wd-blocked', 'wd-fan');

-- ── Creator-only creation ───────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d201","role":"authenticated"}', true);

select throws_ok(
  $$ select public.create_creator_world_drop('No destination', '', 'SECRET_DROP'::public.world_drop_type, 'COLLECTIBLE'::public.world_drop_reward, null, null, null, null, null, null) $$,
  'P0003', null, 'a destination is required'
);
select throws_ok(
  $$ select public.create_creator_world_drop('Private media', '', 'SECRET_DROP'::public.world_drop_type, 'COLLECTIBLE'::public.world_drop_reward, null, 'wd-maya-priv', 19.12, 72.98, 'Mumbai', null) $$,
  'P0004', null, 'private media is refused'
);
select throws_ok(
  $$ select public.create_creator_world_drop('Not my media', '', 'SECRET_DROP'::public.world_drop_type, 'COLLECTIBLE'::public.world_drop_reward, null, 'wd-leo-pub', 19.12, 72.98, 'Mumbai', null) $$,
  'P0004', null, 'another creator''s media is refused'
);
select throws_ok(
  $$ select public.create_creator_world_drop('Wrong target', '', 'SECRET_DROP'::public.world_drop_type, 'CONTENT_UNLOCK'::public.world_drop_reward, 'wd-leo-free', null, 19.12, 72.98, 'Mumbai', null) $$,
  'P0001', null, 'an unauthorized unlock target is denied'
);
select lives_ok(
  $$ select public.create_creator_world_drop('The Missing Frame', 'Behind the wall.', 'SECRET_DROP'::public.world_drop_type, 'COLLECTIBLE'::public.world_drop_reward, 'The Missing Frame', 'wd-maya-pub', 19.123456, 72.987654, 'Mumbai', now() + interval '30 days') $$,
  'a creator places their own World Drop'
);
select is((select drop_type::text from public.world_drops where caption = 'The Missing Frame' and creator_id = 'wd-maya'), 'SECRET_DROP', 'the drop type is stored server-side');
select is((select reward_type::text from public.world_drops where caption = 'The Missing Frame' and creator_id = 'wd-maya'), 'COLLECTIBLE', 'the reward type is stored server-side');
select is((select media_object_id from public.world_drops where caption = 'The Missing Frame' and creator_id = 'wd-maya'), 'wd-maya-pub', 'authorized media is attached');
select is((select status::text from public.world_drops where caption = 'The Missing Frame' and creator_id = 'wd-maya'), 'PUBLISHED', 'a new drop starts published');

-- ── Coarse location only ────────────────────────────────────────────────────
select ok(
  abs(extensions.ST_Y((select approx_location::extensions.geometry from public.world_drops where caption = 'The Missing Frame' and creator_id = 'wd-maya'))::numeric - 19.123456) > 0.000001,
  'the persisted latitude is fuzzed, not the raw reading'
);
select is(
  char_length((select location_cell from public.world_drops where caption = 'The Missing Frame' and creator_id = 'wd-maya')),
  6, 'only a coarse geohash cell is stored'
);
select is(
  (select location_label from public.world_drops where caption = 'The Missing Frame' and creator_id = 'wd-maya'),
  'Mumbai', 'only the coarse place label is exposed'
);


-- ── Cross-creator mutation is denied ───────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d202","role":"authenticated"}', true);
select throws_ok(
  $$ select public.set_creator_world_drop_status((select id from public.world_drops where caption = 'The Missing Frame' and creator_id = 'wd-maya'), 'REMOVED') $$,
  'P0002', null, 'another creator cannot mutate this drop'
);

-- The published creator drop already surfaces through the Explore Play shelf.
select is(
  (select count(*) from jsonb_array_elements(public.list_explore_world_drops(40)) e
    where e->>'id' = (select id from public.world_drops where caption = 'The Missing Frame' and creator_id = 'wd-maya')),
  1::bigint, 'a published creator drop surfaces in Explore Play'
);

-- Leo unlocks his own subscriber Drop (a real entitlement target).
select lives_ok(
  $$ select public.create_creator_world_drop('Hidden Track', 'A track that never made the album.', 'COLLECTIBLE'::public.world_drop_type, 'CONTENT_UNLOCK'::public.world_drop_reward, 'wd-leo-sub', 'wd-leo-pub', 51.512345, -0.127654, 'London', now() + interval '14 days') $$,
  'a creator may unlock their own Drop'
);

-- ── Claims: server-authoritative, idempotent, entitlement-aware ────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d203","role":"authenticated"}', true);
select is(public.viewer_can_access_drop('wd-leo-sub'), false, 'before claiming, the locked Drop stays closed');
select is(
  (public.claim_world_drop((select id from public.world_drops where caption = 'Hidden Track' and creator_id = 'wd-leo')))->>'alreadyClaimed',
  'false', 'the first claim grants'
);
select is(
  (public.claim_world_drop((select id from public.world_drops where caption = 'Hidden Track' and creator_id = 'wd-leo')))->>'alreadyClaimed',
  'true', 'replaying the same claim is idempotent'
);
select is(
  (public.claim_world_drop((select id from public.world_drops where caption = 'Hidden Track' and creator_id = 'wd-leo')))->>'rewardType',
  'CONTENT_UNLOCK', 'the granted reward comes from the stored drop, never the client'
);
select is(
  (select count(*) from public.world_drop_claims
    where profile_id = 'wd-fan'
      and drop_id = (select id from public.world_drops where caption = 'Hidden Track' and creator_id = 'wd-leo')),
  1::bigint, 'exactly one claim row exists'
);
select is(public.viewer_can_access_drop('wd-leo-sub'), true, 'the claimed unlock becomes a real entitlement');
select is(public.viewer_can_access_drop('wd-leo-free'), true, 'an unrelated free Drop is unaffected');
select is(
  (select count(*) from jsonb_array_elements(public.get_my_world_artifacts(40)) e
    where e->>'dropId' = (select id from public.world_drops where caption = 'Hidden Track' and creator_id = 'wd-leo')),
  1::bigint, 'the discovery lands in the artifact collection'
);


-- ── A creator never claims their own drop ──────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d201","role":"authenticated"}', true);
select throws_ok(
  $$ select public.claim_world_drop((select id from public.world_drops where caption = 'The Missing Frame' and creator_id = 'wd-maya')) $$,
  'P0001', null, 'a creator cannot claim their own drop'
);

-- ── Unpublished drops hide ─────────────────────────────────────────────────
select is(
  ((public.set_creator_world_drop_status((select id from public.world_drops where caption = 'The Missing Frame' and creator_id = 'wd-maya'), 'DRAFT'))).status::text,
  'DRAFT', 'a creator can unpublish their own drop'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d203","role":"authenticated"}', true);
select is(
  public.world_drop_view((select id from public.world_drops where caption = 'The Missing Frame' and creator_id = 'wd-maya')),
  null, 'an unpublished drop is invisible'
);
select is(
  (select count(*) from jsonb_array_elements(public.list_creator_world_drops('wd-maya', 40)) e
    where e->>'id' = (select id from public.world_drops where caption = 'The Missing Frame' and creator_id = 'wd-maya')),
  0::bigint, 'an unpublished drop never lists'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d201","role":"authenticated"}', true);
select is(
  ((public.set_creator_world_drop_status((select id from public.world_drops where caption = 'The Missing Frame' and creator_id = 'wd-maya'), 'PUBLISHED'))).status::text,
  'PUBLISHED', 'the creator can publish it again'
);

-- ── Expired drops hide and cannot be claimed ───────────────────────────────
insert into public.world_drops
  (id, mission_id, author_id, creator_id, media_object_id, caption, clue,
   drop_type, reward_type, reward_ref, approx_location, location_cell, location_label,
   status, published_at, expires_at)
values
  ('wd-expired-secret', null, 'wd-maya', 'wd-maya', null, 'Old secret', 'Too late.',
   'SECRET_DROP', 'COLLECTIBLE', 'Old secret',
   public.world_fuzz_location(19.08, 72.88), 'te7u2k', 'Mumbai',
   'PUBLISHED', now() - interval '10 days', now() - interval '1 day');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d203","role":"authenticated"}', true);
select is(public.world_drop_view('wd-expired-secret'), null, 'an expired drop is invisible');
select throws_ok(
  $$ select public.claim_world_drop('wd-expired-secret') $$,
  'P0004', null, 'an expired drop cannot be claimed'
);

-- ── Blocks are respected everywhere ───────────────────────────────────────
insert into public.world_drops
  (id, mission_id, author_id, creator_id, media_object_id, caption, clue,
   drop_type, reward_type, reward_ref, approx_location, location_cell, location_label,
   status, published_at, expires_at)
values
  ('wd-blocked-secret', null, 'wd-blocked', 'wd-blocked', null, 'Blocked secret', 'Nope.',
   'SECRET_DROP', 'COLLECTIBLE', 'Blocked secret',
   public.world_fuzz_location(40.71, -74.01), 'dr5reg', 'New York',
   'PUBLISHED', now() - interval '1 hour', now() + interval '7 days');

select is(public.world_drop_view('wd-blocked-secret'), null, 'a blocked creator is invisible');
select throws_ok(
  $$ select public.claim_world_drop('wd-blocked-secret') $$,
  'P0001', null, 'a blocked drop cannot be claimed'
);
select is(
  (select count(*) from jsonb_array_elements(public.list_explore_world_drops(40)) e
    where e->>'id' = 'wd-blocked-secret'),
  0::bigint, 'a blocked drop never surfaces in Explore Play'
);

-- ── Media that is not ready is never surfaced ─────────────────────────────
update public.media_objects set status = 'uploading' where id = 'wd-maya-pub';
select is(
  public.world_drop_view((select id from public.world_drops where caption = 'The Missing Frame' and creator_id = 'wd-maya')),
  null::jsonb, 'drop with media that is not ready is never surfaced'
);

select * from finish();
rollback;


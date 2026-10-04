-- ============================================================================
-- Vault creator surface tests (pgTAP). Self-contained; run: supabase test db
-- Covers the creator half of Phase 3 Step 1: one Vault per creator, ownership
-- derived from the session, Drop media rules, server-owned 7-day expiry,
-- permanent Collections, tombstone removal, and the "no client writes" grants.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

-- Fixtures: two creators and an unrelated viewer. Profiles are auto-created by
-- the auth trigger, then pinned to readable ids.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000301'),
  ('00000000-0000-0000-0000-000000000302'),
  ('00000000-0000-0000-0000-000000000303');

update public.profiles set id = 'v-creator-a', handle = 'v_creator_a', name = 'Vault Creator A', role = 'creator'
 where auth_user_id = '00000000-0000-0000-0000-000000000301';
update public.profiles set id = 'v-creator-b', handle = 'v_creator_b', name = 'Vault Creator B', role = 'creator'
 where auth_user_id = '00000000-0000-0000-0000-000000000302';
update public.profiles set id = 'v-viewer', handle = 'v_viewer', name = 'Vault Viewer', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000303';

-- Media owned by each creator: ready public, ready private, plus the three
-- states that must never be attachable (in-flight, tombstoned, someone else's).
insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, status, visibility) values
  ('m-a-pub',       'v-creator-a', 'public-media',  'v-creator-a/m-a-pub/m-a-pub.png',   'image', 'image/png', 'ready',     'public'),
  ('m-a-priv',      'v-creator-a', 'private-media', 'v-creator-a/m-a-priv/m-a-priv.png', 'image', 'image/png', 'ready',     'private'),
  ('m-a-uploading', 'v-creator-a', 'public-media',  'v-creator-a/m-a-up/m-a-up.png',     'image', 'image/png', 'uploading', 'public'),
  ('m-b-pub',       'v-creator-b', 'public-media',  'v-creator-b/m-b-pub/m-b-pub.png',   'image', 'image/png', 'ready',     'public');

insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, status, visibility, deleted_at) values
  ('m-a-gone', 'v-creator-a', 'public-media', 'v-creator-a/m-a-gone/m-a-gone.png', 'image', 'image/png', 'deleted', 'public', now());

-- ── schema objects ──────────────────────────────────────────────────────────
select has_table('public', 'creator_vaults', 'creator_vaults exists');
select has_table('public', 'vault_drops', 'vault_drops exists');
select has_table('public', 'vault_collections', 'vault_collections exists');
select has_table('public', 'vault_collection_items', 'vault_collection_items exists');
select has_table('public', 'vault_subscriptions', 'vault_subscriptions exists');

select has_function('public', 'create_vault', 'create_vault exists');
select has_function('public', 'update_vault', 'update_vault exists');
select has_function('public', 'create_vault_drop', 'create_vault_drop exists');
select has_function('public', 'publish_vault_drop', 'publish_vault_drop exists');
select has_function('public', 'delete_vault_drop', 'delete_vault_drop exists');
select has_function('public', 'create_collection', 'create_collection exists');
select has_function('public', 'add_drop_to_collection', 'add_drop_to_collection exists');
select has_function('public', 'remove_drop_from_collection', 'remove_drop_from_collection exists');
select has_function('public', 'can_access_vault_drop', 'can_access_vault_drop exists');

-- ── privileges: no blanket DML on any Vault table ───────────────────────────
select is(has_table_privilege('authenticated', 'public.creator_vaults', 'INSERT'), false, 'no blanket INSERT on creator_vaults');
select is(has_table_privilege('authenticated', 'public.creator_vaults', 'UPDATE'), false, 'no blanket UPDATE on creator_vaults');
select is(has_table_privilege('authenticated', 'public.creator_vaults', 'DELETE'), false, 'no blanket DELETE on creator_vaults');
select is(has_table_privilege('authenticated', 'public.vault_drops', 'INSERT'), false, 'no blanket INSERT on vault_drops');
select is(has_table_privilege('authenticated', 'public.vault_drops', 'UPDATE'), false, 'no blanket UPDATE on vault_drops');
select is(has_table_privilege('authenticated', 'public.vault_drops', 'DELETE'), false, 'no blanket DELETE on vault_drops');
select is(has_table_privilege('authenticated', 'public.vault_collections', 'INSERT'), false, 'no blanket INSERT on vault_collections');
select is(has_table_privilege('authenticated', 'public.vault_collection_items', 'INSERT'), false, 'no blanket INSERT on vault_collection_items');
select is(has_table_privilege('authenticated', 'public.vault_subscriptions', 'INSERT'), false, 'no blanket INSERT on vault_subscriptions');
select is(has_table_privilege('authenticated', 'public.vault_subscriptions', 'UPDATE'), false, 'no blanket UPDATE on vault_subscriptions');
select is(has_table_privilege('anon', 'public.vault_subscriptions', 'SELECT'), false, 'anon cannot read subscriptions');
select is(has_function_privilege('anon', 'public.create_vault(text,text)', 'EXECUTE'), false, 'anon cannot execute create_vault');
select is(
  (select count(*)::int from aclexplode((select proacl from pg_proc where oid = 'public.create_vault(text,text)'::regprocedure)) a where a.grantee = 0),
  0, 'PUBLIC has no EXECUTE on create_vault'
);
select is(
  (select count(*)::int from aclexplode((select proacl from pg_proc where oid = 'public.expire_vault_drops(integer)'::regprocedure)) a where a.grantee = 0),
  0, 'PUBLIC has no EXECUTE on expire_vault_drops'
);

-- ── signed-out callers cannot open a Vault ──────────────────────────────────
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.create_vault('anon vault') $$, '42501', null, 'signed-out caller cannot create a vault');
reset role;

-- ── a creator opens their own Vault ─────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select lives_ok($$ select public.create_vault('Studio A', 'Notes from A') $$, 'creator A opens a vault');
reset role;

select is((select creator_id from public.creator_vaults where creator_id = 'v-creator-a'), 'v-creator-a', 'vault owner is derived from the session, never supplied');
select is((select count(*)::int from public.creator_vaults where creator_id = 'v-creator-a'), 1, 'creator A owns exactly one vault');
select is((select status::text from public.creator_vaults where creator_id = 'v-creator-a'), 'active', 'a new vault is active');

-- duplicate vault is refused, not silently created
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select throws_ok($$ select public.create_vault('A second studio') $$, 'P0007', null, 'a second vault for the same creator is refused');
reset role;
select is((select count(*)::int from public.creator_vaults where creator_id = 'v-creator-a'), 1, 'the refused duplicate left no row behind');

-- creator B also opens one, so cross-creator writes can be attempted
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000302","role":"authenticated"}', true);
select lives_ok($$ select public.create_vault('Studio B') $$, 'creator B opens a vault');
reset role;

-- creator B cannot edit creator A's vault
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000302","role":"authenticated"}', true);
select throws_ok(
  $$ select public.update_vault((select id from public.creator_vaults where creator_id = 'v-creator-a'), 'hijacked', '') $$,
  'P0002', null, 'another creator cannot update a vault they do not own'
);
reset role;
select is((select title from public.creator_vaults where creator_id = 'v-creator-a'), 'Studio A', 'the vault title is untouched');

-- ── Drops: creation + media rules ───────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);

select lives_ok(
  $$ select public.create_vault_drop((select id from public.creator_vaults where creator_id = 'v-creator-a'), 'Free drop one', 'free', 'm-a-pub') $$,
  'creator A creates a free drop from public media'
);
select lives_ok(
  $$ select public.create_vault_drop((select id from public.creator_vaults where creator_id = 'v-creator-a'), 'Subscriber drop one', 'subscriber', 'm-a-priv') $$,
  'creator A creates a subscriber drop from private media'
);
-- a subscriber Drop must not be backed by public, guessable media
select throws_ok(
  $$ select public.create_vault_drop((select id from public.creator_vaults where creator_id = 'v-creator-a'), 'Bad subscriber drop', 'subscriber', 'm-a-pub') $$,
  'P0005', null, 'a subscriber drop cannot use public media'
);
-- and a free Drop must not be backed by private media
select throws_ok(
  $$ select public.create_vault_drop((select id from public.creator_vaults where creator_id = 'v-creator-a'), 'Bad free drop', 'free', 'm-a-priv') $$,
  'P0006', null, 'a free drop cannot use private media'
);
select throws_ok(
  $$ select public.create_vault_drop((select id from public.creator_vaults where creator_id = 'v-creator-a'), 'Not my media', 'free', 'm-b-pub') $$,
  'P0001', null, 'media ownership is required'
);
select throws_ok(
  $$ select public.create_vault_drop((select id from public.creator_vaults where creator_id = 'v-creator-a'), 'Still uploading', 'free', 'm-a-uploading') $$,
  'P0004', null, 'media must be ready, not in flight'
);
select throws_ok(
  $$ select public.create_vault_drop((select id from public.creator_vaults where creator_id = 'v-creator-a'), 'Deleted media', 'free', 'm-a-gone') $$,
  'P0009', null, 'tombstoned media cannot back a drop'
);
select throws_ok(
  $$ select public.create_vault_drop('v_does_not_exist', 'Wrong vault', 'free', 'm-a-pub') $$,
  'P0002', null, 'a drop cannot be created in a vault that is not yours'
);
select throws_ok(
  $$ select public.create_vault_drop((select id from public.creator_vaults where creator_id = 'v-creator-b'), 'Into B', 'free', 'm-a-pub') $$,
  'P0002', null, 'a creator cannot post into another creator vault'
);
select throws_ok(
  $$ select public.create_vault_drop((select id from public.creator_vaults where creator_id = 'v-creator-a'), '   ', 'free', 'm-a-pub') $$,
  'P0003', null, 'an empty caption is rejected'
);
select lives_ok(
  $$ select public.create_vault_drop((select id from public.creator_vaults where creator_id = 'v-creator-a'), 'Draft without media', 'free') $$,
  'a draft may be created before media is attached'
);
reset role;

select is((select count(*)::int from public.vault_drops where creator_id = 'v-creator-a'), 3, 'only the three legitimate drops exist');
select is((select count(*)::int from public.vault_drops where creator_id = 'v-creator-a' and status = 'draft'), 3, 'a new drop starts as a draft');

-- ── publishing: the server owns the 7-day window ────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select lives_ok(
  $$ select public.publish_vault_drop((select id from public.vault_drops where caption = 'Free drop one')) $$,
  'creator A publishes the free drop'
);
select throws_ok(
  $$ select public.publish_vault_drop((select id from public.vault_drops where caption = 'Draft without media')) $$,
  'P0008', null, 'a drop without media cannot be published'
);
reset role;

select is((select status::text from public.vault_drops where caption = 'Free drop one'), 'published', 'the published drop is live');
select is(
  (select round(extract(epoch from (expires_at - published_at)) / 86400)::int from public.vault_drops where caption = 'Free drop one'),
  7, 'expiry is exactly seven days after publish'
);
select ok((select expires_at > now() from public.vault_drops where caption = 'Free drop one'), 'the window is still in the future');
select is((select published_at is not null from public.vault_drops where caption = 'Draft without media'), false, 'a draft carries no publish stamp');

-- republishing is idempotent, and the window does not move
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select lives_ok(
  $$ select public.publish_vault_drop((select id from public.vault_drops where caption = 'Free drop one')) $$,
  'publishing an already-live drop is a no-op'
);
reset role;
select is((select count(*)::int from public.vault_drops where caption = 'Free drop one' and status = 'published'), 1, 'the republish did not duplicate the drop');

-- the client cannot write status or the window directly
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.vault_drops (id, vault_id, creator_id, caption) values ('vd-raw', (select id from public.creator_vaults where creator_id = 'v-creator-a'), 'v-creator-a', 'raw insert') $$,
  '42501', null, 'a client cannot insert a drop directly'
);
select throws_ok(
  $$ update public.vault_drops set status = 'expired' where caption = 'Free drop one' $$,
  '42501', null, 'a client cannot set a drop status directly'
);
select throws_ok(
  $$ update public.vault_drops set expires_at = now() + interval '99 days' where caption = 'Free drop one' $$,
  '42501', null, 'a client cannot extend the 7-day window'
);
reset role;

-- ── Collections: permanent, creator-owned ───────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_collection((select id from public.creator_vaults where creator_id = 'v-creator-a'), 'Best of A', 'kept forever') $$,
  'creator A starts a collection'
);
select lives_ok(
  $$ select public.add_drop_to_collection(
       (select id from public.vault_collections where creator_id = 'v-creator-a'),
       (select id from public.vault_drops where caption = 'Free drop one')) $$,
  'creator A shelves one of their drops'
);
select lives_ok(
  $$ select public.add_drop_to_collection(
       (select id from public.vault_collections where creator_id = 'v-creator-a'),
       (select id from public.vault_drops where caption = 'Free drop one')) $$,
  'shelving the same drop twice is a no-op'
);
reset role;

select is((select count(*)::int from public.vault_collection_items i
  join public.vault_collections c on c.id = i.collection_id
 where c.creator_id = 'v-creator-a'), 1, 'exactly one shelf item exists');
select is(
  (select i.position from public.vault_collection_items i
     join public.vault_collections c on c.id = i.collection_id
    where c.creator_id = 'v-creator-a' limit 1),
  0, 'the first shelf item takes position 0'
);

-- another creator cannot curate or dismantle it
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000302","role":"authenticated"}', true);
select throws_ok(
  $$ select public.add_drop_to_collection((select id from public.vault_collections where creator_id = 'v-creator-a'), (select id from public.vault_drops where creator_id = 'v-creator-b')) $$,
  'P0001', null, 'another creator cannot curate this collection'
);
select throws_ok(
  $$ select public.remove_drop_from_collection((select id from public.vault_collections where creator_id = 'v-creator-a'), (select id from public.vault_drops where caption = 'Free drop one')) $$,
  'P0001', null, 'another creator cannot remove a shelf item'
);
select throws_ok(
  $$ insert into public.vault_collection_items (collection_id, drop_id) values ((select id from public.vault_collections where creator_id = 'v-creator-a'), (select id from public.vault_drops where caption = 'Free drop one')) $$,
  '42501', null, 'a client cannot insert a shelf item directly'
);
reset role;

-- a collection only ever shelves its own vault's drops
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_vault_drop((select id from public.creator_vaults where creator_id = 'v-creator-a'), 'Second free drop', 'free', 'm-a-pub') $$,
  'creator A creates a second free drop'
);
select throws_ok(
  $$ select public.add_drop_to_collection(
       (select id from public.vault_collections where creator_id = 'v-creator-a'),
       (select id from public.vault_drops where creator_id = 'v-creator-b')) $$,
  'P0002', null, 'a drop from another vault cannot be shelved'
);
reset role;

-- ── removal is a tombstone, not a delete ────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select lives_ok(
  $$ select public.delete_vault_drop((select id from public.vault_drops where caption = 'Second free drop')) $$,
  'creator A removes a drop'
);
select lives_ok(
  $$ select public.delete_vault_drop((select id from public.vault_drops where caption = 'Second free drop')) $$,
  'removing an already-removed drop is idempotent'
);
reset role;

select is((select count(*)::int from public.vault_drops where caption = 'Second free drop'), 1, 'the removed drop row survives');
select ok((select deleted_at is not null from public.vault_drops where caption = 'Second free drop'), 'deleted_at is stamped on removal');
select is((select status::text from public.vault_drops where caption = 'Second free drop'), 'removed', 'the status becomes removed');

-- a removed drop is not merely hidden from the feed: it reads as inaccessible
select is(public.can_access_vault_drop('v-viewer', (select id from public.vault_drops where caption = 'Second free drop')), false, 'a removed drop is inaccessible to others');
select is(public.can_access_vault_drop('v-creator-a', (select id from public.vault_drops where caption = 'Second free drop')), false, 'even the creator loses access to a tombstoned drop');

-- only the owner can remove
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000302","role":"authenticated"}', true);
select throws_ok(
  $$ select public.delete_vault_drop((select id from public.vault_drops where caption = 'Free drop one')) $$,
  'P0001', null, 'another creator cannot remove someone else drop'
);
reset role;

select * from finish();
rollback;

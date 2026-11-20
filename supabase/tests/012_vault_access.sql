-- ============================================================================
-- Vault entitlement, access & permanence tests (pgTAP). Run: supabase test db
-- Covers the viewer half of Phase 3 Step 1: who may read what, the protected
-- entitlement mechanism, the private-media target seam, block enforcement, the
-- 7-day expiry sweep, Collection permanence, and the frozen Arena scheduler.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

-- Fixtures: a creator, a fan who will subscribe, a stranger, and a blocker.
-- Profiles come from the auth trigger, then get pinned to readable ids.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000401'),
  ('00000000-0000-0000-0000-000000000402'),
  ('00000000-0000-0000-0000-000000000403'),
  ('00000000-0000-0000-0000-000000000404');

update public.profiles set id = 'v2-creator', handle = 'v2_creator', name = 'V2 Creator', role = 'creator'
 where auth_user_id = '00000000-0000-0000-0000-000000000401';
update public.profiles set id = 'v2-fan', handle = 'v2_fan', name = 'V2 Fan', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000402';
update public.profiles set id = 'v2-stranger', handle = 'v2_stranger', name = 'V2 Stranger', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000403';
update public.profiles set id = 'v2-blocker', handle = 'v2_blocker', name = 'V2 Blocker', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000404';

insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, status, visibility) values
  ('m2-pub',  'v2-creator', 'public-media',  'v2-creator/m2-pub/m2-pub.png',   'image', 'image/png', 'ready', 'public'),
  ('m2-priv', 'v2-creator', 'private-media', 'v2-creator/m2-priv/m2-priv.png', 'image', 'image/png', 'ready', 'private');

-- ── schema + privileges ─────────────────────────────────────────────────────
select has_function('public', 'vault_grant_test_subscription', 'vault_grant_test_subscription exists');
select has_function('public', 'vault_revoke_subscription', 'vault_revoke_subscription exists');
select has_function('public', 'viewer_can_access_drop', 'viewer_can_access_drop exists');
select has_function('public', 'vault_drop_media_target', 'vault_drop_media_target exists');
select has_function('public', 'expire_vault_subscriptions', 'expire_vault_subscriptions exists');

-- The entitlement mechanism is service_role only: a phone cannot call it.
select is(has_function_privilege('authenticated', 'public.vault_grant_test_subscription(text,text,integer)', 'EXECUTE'), false, 'authenticated cannot grant a subscription');
select is(has_function_privilege('anon', 'public.vault_grant_test_subscription(text,text,integer)', 'EXECUTE'), false, 'anon cannot grant a subscription');
select is(has_function_privilege('authenticated', 'public.vault_revoke_subscription(text)', 'EXECUTE'), false, 'authenticated cannot revoke a subscription');
select is(has_function_privilege('service_role', 'public.vault_grant_test_subscription(text,text,integer)', 'EXECUTE'), true, 'service_role may grant a subscription');
select is(has_function_privilege('anon', 'public.vault_drop_media_target(text)', 'EXECUTE'), false, 'guests cannot ask for a private media target');
select is(has_function_privilege('authenticated', 'public.expire_vault_drops(integer)', 'EXECUTE'), false, 'clients cannot run the expiry sweep');

-- ── fixture content: one free and one subscriber Drop, both live ────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}', true);
select lives_ok($$ select public.create_vault('V2 Studio') $$, 'V2 creator opens a vault');
select lives_ok(
  $$ select public.create_vault_drop((select id from public.creator_vaults where creator_id = 'v2-creator'), 'V2 free drop', 'free', 'm2-pub') $$,
  'V2 creator creates a free drop'
);
select lives_ok(
  $$ select public.create_vault_drop((select id from public.creator_vaults where creator_id = 'v2-creator'), 'V2 subscriber drop', 'subscriber', 'm2-priv') $$,
  'V2 creator creates a subscriber drop'
);
select lives_ok($$ select public.publish_vault_drop((select id from public.vault_drops where caption = 'V2 free drop')) $$, 'the free drop goes live');
select lives_ok($$ select public.publish_vault_drop((select id from public.vault_drops where caption = 'V2 subscriber drop')) $$, 'the subscriber drop goes live');
reset role;

-- ── access: free content ────────────────────────────────────────────────────
select is(public.can_access_vault_drop_internal(null, (select id from public.vault_drops where caption = 'V2 free drop')), true, 'a guest may read a live free drop');
select is(public.can_access_vault_drop_internal('v2-stranger', (select id from public.vault_drops where caption = 'V2 free drop')), true, 'a signed-in stranger may read a live free drop');
select is(public.can_access_vault_drop_internal('v2-creator', (select id from public.vault_drops where caption = 'V2 free drop')), true, 'the creator reads their own free drop');

-- ── access: subscriber content ──────────────────────────────────────────────
select is(public.can_access_vault_drop_internal(null, (select id from public.vault_drops where caption = 'V2 subscriber drop')), false, 'a guest cannot reach subscriber content');
select is(public.can_access_vault_drop_internal('v2-stranger', (select id from public.vault_drops where caption = 'V2 subscriber drop')), false, 'a non-subscriber cannot reach subscriber content');
select is(public.can_access_vault_drop_internal('v2-creator', (select id from public.vault_drops where caption = 'V2 subscriber drop')), true, 'the creator always reaches their own subscriber drop');

-- ── a normal client cannot award itself an entitlement ──────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000403","role":"authenticated"}', true);
select throws_ok(
  $$ select public.vault_grant_test_subscription((select id from public.creator_vaults where creator_id = 'v2-creator'), 'v2-stranger', 30) $$,
  '42501', null, 'a client cannot grant itself a subscription'
);
select throws_ok(
  $$ insert into public.vault_subscriptions (id, subscriber_id, vault_id, current_period_end) values ('sub-raw', 'v2-stranger', (select id from public.creator_vaults where creator_id = 'v2-creator'), now() + interval '30 days') $$,
  '42501', null, 'a client cannot insert a subscription row'
);
select throws_ok($$ update public.vault_subscriptions set status = 'active' $$, '42501', null, 'a client cannot update a subscription row');
reset role;
select is((select count(*)::int from public.vault_subscriptions), 0, 'the client attempts left no entitlement behind');

-- ── the protected (service_role) path grants one ────────────────────────────
select lives_ok(
  $$ select public.vault_grant_test_subscription((select id from public.creator_vaults where creator_id = 'v2-creator'), 'v2-fan', 7) $$,
  'the protected test path grants an entitlement'
);
select is((select count(*)::int from public.vault_subscriptions), 1, 'exactly one entitlement row exists');
select is((select status::text from public.vault_subscriptions limit 1), 'active', 'the entitlement is active');
select is((select source::text from public.vault_subscriptions limit 1), 'test', 'the entitlement is stamped as a test grant');
select is(public.can_access_vault_drop_internal('v2-fan', (select id from public.vault_drops where caption = 'V2 subscriber drop')), true, 'the subscriber can now read subscriber content');
select is(public.can_access_vault_drop_internal('v2-stranger', (select id from public.vault_drops where caption = 'V2 subscriber drop')), false, 'another non-subscriber still cannot');
select is(public.can_access_vault_drop_internal(null, (select id from public.vault_drops where caption = 'V2 subscriber drop')), false, 'a guest still cannot');

-- granting again renews in place instead of creating a second entitlement
select lives_ok(
  $$ select public.vault_grant_test_subscription((select id from public.creator_vaults where creator_id = 'v2-creator'), 'v2-fan', 30) $$,
  'granting again renews the existing entitlement'
);
select is((select count(*)::int from public.vault_subscriptions), 1, 'renewal did not duplicate the row');
select is((select round(extract(epoch from (current_period_end - now())) / 86400)::int from public.vault_subscriptions limit 1), 30, 'renewal extended the period');

-- a creator cannot subscribe to their own vault
select throws_ok(
  $$ select public.vault_grant_test_subscription((select id from public.creator_vaults where creator_id = 'v2-creator'), 'v2-creator', 30) $$,
  'P0004', null, 'a creator cannot subscribe to their own vault'
);

-- ── the caller-resolved predicate agrees, and cannot be spoofed ─────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000402","role":"authenticated"}', true);
select is(public.viewer_can_access_drop((select id from public.vault_drops where caption = 'V2 subscriber drop')), true, 'the subscriber resolved from the session is allowed');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000403","role":"authenticated"}', true);
select is(public.viewer_can_access_drop((select id from public.vault_drops where caption = 'V2 subscriber drop')), false, 'a different viewer gets a different answer from the same function');
reset role;

-- ── the private-media target only materialises for an entitled caller ───────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000403","role":"authenticated"}', true);
select is(public.vault_drop_media_target((select id from public.vault_drops where caption = 'V2 subscriber drop')), null, 'no media target without an entitlement');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000402","role":"authenticated"}', true);
select is((public.vault_drop_media_target((select id from public.vault_drops where caption = 'V2 subscriber drop')))->>'bucket', 'private-media', 'an entitled subscriber resolves the private bucket');
select is((public.vault_drop_media_target((select id from public.vault_drops where caption = 'V2 subscriber drop')))->>'path', 'v2-creator/m2-priv/m2-priv.png', 'the storage path is returned only through the entitlement check');
reset role;

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select public.vault_drop_media_target((select id from public.vault_drops where caption = 'V2 subscriber drop')) $$,
  '42501', null, 'a guest has no path to private media at all'
);
reset role;

-- ── cancellation and lapse both close access ────────────────────────────────
select lives_ok(
  $$ select public.vault_revoke_subscription((select id from public.vault_subscriptions limit 1)) $$,
  'the protected path cancels the entitlement'
);
select is((select status::text from public.vault_subscriptions limit 1), 'cancelled', 'the row is cancelled, not deleted');
select is((select cancelled_at is not null from public.vault_subscriptions limit 1), true, 'cancelled_at is stamped');
select is(public.can_access_vault_drop_internal('v2-fan', (select id from public.vault_drops where caption = 'V2 subscriber drop')), false, 'a cancelled entitlement denies access');

select lives_ok(
  $$ select public.vault_grant_test_subscription((select id from public.creator_vaults where creator_id = 'v2-creator'), 'v2-fan', 30) $$,
  'renewing revives access'
);
select is(public.can_access_vault_drop_internal('v2-fan', (select id from public.vault_drops where caption = 'V2 subscriber drop')), true, 'the renewed entitlement works');
select is((select cancelled_at from public.vault_subscriptions limit 1), null, 'renewal clears the cancellation stamp');

-- a lapse denies access immediately — the clock is read, not the status alone
-- (both stamps move together, because `current_period_end > started_at` holds)
update public.vault_subscriptions
   set started_at = now() - interval '60 days',
       current_period_end = now() - interval '1 hour';
select is(public.can_access_vault_drop_internal('v2-fan', (select id from public.vault_drops where caption = 'V2 subscriber drop')), false, 'an expired period denies access before any sweep runs');
select is(public.expire_vault_subscriptions(10), 1, 'the sweep moves the lapsed row to expired');
select is((select status::text from public.vault_subscriptions limit 1), 'expired', 'the status now agrees with the clock');
select is(public.expire_vault_subscriptions(10), 0, 'the subscription sweep is idempotent');
select is(public.can_access_vault_drop_internal('v2-fan', (select id from public.vault_drops where caption = 'V2 subscriber drop')), false, 'access stays denied');

-- ── blocks close the Vault, in both directions ─────────────────────────────
select lives_ok(
  $$ select public.vault_grant_test_subscription((select id from public.creator_vaults where creator_id = 'v2-creator'), 'v2-fan', 30) $$,
  're-entitle the fan for the block test'
);
select is(public.can_access_vault_drop_internal('v2-fan', (select id from public.vault_drops where caption = 'V2 subscriber drop')), true, 'the entitled fan reads the drop before any block');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000402","role":"authenticated"}', true);
select lives_ok($$ select public.block_profile('v2-creator') $$, 'the subscriber blocks the creator');
reset role;

select is(public.can_access_vault_drop_internal('v2-fan', (select id from public.vault_drops where caption = 'V2 subscriber drop')), false, 'a block beats a live entitlement for private content');
select is(public.can_access_vault_drop_internal('v2-fan', (select id from public.vault_drops where caption = 'V2 free drop')), false, 'a block also closes free vault content');
select is(public.can_access_vault_drop_internal('v2-creator', (select id from public.vault_drops where caption = 'V2 subscriber drop')), true, 'the creator still reaches their own content while blocked');

-- the other direction: a creator-side block hides the vault from that viewer
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}', true);
select lives_ok($$ select public.block_profile('v2-blocker') $$, 'the creator blocks a viewer');
reset role;
select is(public.can_access_vault_drop_internal('v2-blocker', (select id from public.vault_drops where caption = 'V2 free drop')), false, 'a creator-side block hides the vault from that viewer');

-- unblocking restores the entitled read
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000402","role":"authenticated"}', true);
select lives_ok($$ select public.unblock_profile('v2-creator') $$, 'the subscriber unblocks');
reset role;
select is(public.can_access_vault_drop_internal('v2-fan', (select id from public.vault_drops where caption = 'V2 subscriber drop')), true, 'unblocking restores the entitled read');

-- ── RLS: what each role can actually read ───────────────────────────────────
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select isnt_empty($$ select * from public.creator_vaults $$, 'a guest reads the active vault');
select throws_ok($$ select * from public.vault_subscriptions $$, '42501', null, 'a guest cannot read subscriptions at all');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000403","role":"authenticated"}', true);
select isnt_empty($$ select * from public.creator_vaults $$, 'a non-subscriber still sees the public vault page');
select isnt_empty($$ select * from public.vault_drops where caption = 'V2 free drop' $$, 'a non-subscriber reads the free drop row');
select is_empty($$ select * from public.vault_drops where caption = 'V2 subscriber drop' $$, 'a non-subscriber cannot read the subscriber drop row');
select is_empty($$ select * from public.vault_subscriptions $$, 'a non-subscriber reads no subscription rows');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000402","role":"authenticated"}', true);
select isnt_empty($$ select * from public.vault_subscriptions $$, 'a subscriber reads their own subscription');
select isnt_empty($$ select * from public.vault_drops where caption = 'V2 subscriber drop' $$, 'a subscriber reads the subscriber drop row');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}', true);
select is_empty($$ select * from public.vault_subscriptions $$, 'the creator cannot read subscriber rows');
select isnt_empty($$ select * from public.vault_drops where caption = 'V2 subscriber drop' $$, 'the creator reads their own drops');
reset role;

-- ── 7-day expiry, and Collection permanence across it ───────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_collection((select id from public.creator_vaults where creator_id = 'v2-creator'), 'Permanent shelf') $$,
  'the creator starts a permanent collection'
);
select lives_ok(
  $$ select public.add_drop_to_collection((select id from public.vault_collections where creator_id = 'v2-creator'), (select id from public.vault_drops where caption = 'V2 subscriber drop')) $$,
  'the creator shelves the subscriber drop'
);
reset role;
select is(public.can_access_vault_drop_internal('v2-fan', (select id from public.vault_drops where caption = 'V2 subscriber drop')), true, 'the entitled subscriber reads it while it is live');

-- Age the drop past its window. The database owns published_at/expires_at, so
-- moving both together is the only way to simulate the clock here.
update public.vault_drops
   set published_at = now() - interval '8 days', expires_at = now() - interval '1 day'
 where caption = 'V2 subscriber drop';

select is(public.can_access_vault_drop_internal('v2-fan', (select id from public.vault_drops where caption = 'V2 subscriber drop')), true, 'a collected drop past its window stays readable — collection permanence');
select ok(public.expire_vault_drops(10) >= 1, 'the expiry sweep closes the window');
select is((select status::text from public.vault_drops where caption = 'V2 subscriber drop'), 'expired', 'the drop is now expired');
select is((select count(*)::int from public.vault_drops where caption = 'V2 subscriber drop'), 1, 'expiry never deletes the row');
select is((select media_object_id from public.vault_drops where caption = 'V2 subscriber drop'), 'm2-priv', 'expiry never drops the media reference');
select is((select count(*)::int from public.vault_collection_items i
  join public.vault_collections c on c.id = i.collection_id
 where c.creator_id = 'v2-creator'), 1, 'the collection item survives expiry');
select is((select count(*)::int from public.vault_collections where creator_id = 'v2-creator'), 1, 'the collection itself survives expiry');
select is(public.can_access_vault_drop_internal('v2-fan', (select id from public.vault_drops where caption = 'V2 subscriber drop')), true, 'the subscriber still reads it through the collection');
select is(public.can_access_vault_drop_internal('v2-stranger', (select id from public.vault_drops where caption = 'V2 subscriber drop')), false, 'a non-subscriber cannot reach it through the collection');
select is(public.can_access_vault_drop_internal(null, (select id from public.vault_drops where caption = 'V2 subscriber drop')), false, 'a guest cannot reach it through the collection');
select is(public.expire_vault_drops(10), 0, 'the drop sweep is idempotent');

-- the expired drop leaves the guest feed, and stays manageable for its creator
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is_empty($$ select * from public.vault_drops where caption = 'V2 subscriber drop' $$, 'an expired subscriber drop is gone from a guest feed');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}', true);
select isnt_empty($$ select * from public.vault_drops where caption = 'V2 subscriber drop' $$, 'the creator can still manage their expired drop');
reset role;
select is(public.can_access_vault_drop_internal('v2-creator', (select id from public.vault_drops where caption = 'V2 subscriber drop')), true, 'the creator still reaches the expired content');

-- a drop nobody collected leaves the feed for good
update public.vault_drops
   set published_at = now() - interval '8 days', expires_at = now() - interval '1 day'
 where caption = 'V2 free drop';
select is(public.expire_vault_drops(10), 1, 'the free drop window closes too');
select is(public.can_access_vault_drop_internal('v2-stranger', (select id from public.vault_drops where caption = 'V2 free drop')), false, 'an expired, uncollected drop is no longer readable');
select is(public.can_access_vault_drop_internal(null, (select id from public.vault_drops where caption = 'V2 free drop')), false, 'nor is it readable by a guest');

-- ── the frozen Arena scheduler: old keys preserved, Vault keys added ────────
select ok(
  (public.run_maintenance(0)) ?& array['clashes_settled', 'takes_expired', 'media', 'rate_limits_pruned', 'vault_drops_expired', 'vault_subscriptions_expired'],
  'run_maintenance still reports the Arena keys and now the Vault keys'
);
select is((public.run_maintenance(0))->>'vault_drops_expired', '0', 'a zero limit expires no vault drops');
select is((select count(*)::int from public.vault_drops where status = 'published' and expires_at <= now()), 0, 'no due drop is left unexpired by the scheduler');

select * from finish();
rollback;


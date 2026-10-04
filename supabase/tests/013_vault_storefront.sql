-- ============================================================================
-- Vault storefront tests (pgTAP). Self-contained; run: supabase test db
-- Proves the metadata-only storefront: free drops carry their public media, a
-- subscriber drop is visible as a locked card to everyone but exposes NO private
-- path, drafts are owner-only, removed drops vanish, expired-but-collected drops
-- persist, and collection membership is reported in one round trip.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000501'),
  ('00000000-0000-0000-0000-000000000502'),
  ('00000000-0000-0000-0000-000000000503');

update public.profiles set id = 's3-creator', handle = 's3_creator', name = 'S3 Creator', role = 'creator'
 where auth_user_id = '00000000-0000-0000-0000-000000000501';
update public.profiles set id = 's3-fan', handle = 's3_fan', name = 'S3 Fan', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000502';
update public.profiles set id = 's3-stranger', handle = 's3_stranger', name = 'S3 Stranger', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000503';

insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, status, visibility) values
  ('m3-pub',  's3-creator', 'public-media',  's3-creator/m3-pub/m3-pub.png',   'image', 'image/png', 'ready', 'public'),
  ('m3-priv', 's3-creator', 'private-media', 's3-creator/m3-priv/m3-priv.png', 'image', 'image/png', 'ready', 'private');

-- Fixtures via the RPC surface so ownership is derived, not hand-set.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}', true);
select lives_ok($$ select public.create_vault('S3 Studio') $$, 'creator opens a vault');
select lives_ok($$ select public.create_vault_drop((select id from public.creator_vaults where creator_id = 's3-creator'), 'Free one', 'free', 'm3-pub') $$, 'free drop');
select lives_ok($$ select public.create_vault_drop((select id from public.creator_vaults where creator_id = 's3-creator'), 'Sub one', 'subscriber', 'm3-priv') $$, 'subscriber drop');
select lives_ok($$ select public.create_vault_drop((select id from public.creator_vaults where creator_id = 's3-creator'), 'Archived one', 'free', 'm3-pub') $$, 'archived drop');
select lives_ok($$ select public.create_vault_drop((select id from public.creator_vaults where creator_id = 's3-creator'), 'Draft one', 'free') $$, 'draft drop');
select lives_ok($$ select public.publish_vault_drop((select id from public.vault_drops where caption = 'Free one')) $$, 'publish free');
select lives_ok($$ select public.publish_vault_drop((select id from public.vault_drops where caption = 'Sub one')) $$, 'publish subscriber');
select lives_ok($$ select public.publish_vault_drop((select id from public.vault_drops where caption = 'Archived one')) $$, 'publish archived');
select lives_ok($$ select public.create_collection((select id from public.creator_vaults where creator_id = 's3-creator'), 'Shelf') $$, 'collection');
select lives_ok(
  $$ select public.add_drop_to_collection((select id from public.vault_collections where creator_id = 's3-creator'), (select id from public.vault_drops where caption = 'Archived one')) $$,
  'shelve the archived drop'
);
reset role;

-- Age the archived drop out of the feed while the collection holds it.
update public.vault_drops set published_at = now() - interval '8 days', expires_at = now() - interval '1 day' where caption = 'Archived one';
select ok(public.expire_vault_drops(10) >= 1, 'the archived drop expires');

-- Grant the fan an entitlement so the subscriber case can be exercised.
select lives_ok(
  $$ select public.vault_grant_test_subscription((select id from public.creator_vaults where creator_id = 's3-creator'), 's3-fan', 30) $$,
  'the fan is entitled'
);

-- ── schema + privileges ─────────────────────────────────────────────────────
select has_function('public', 'vault_storefront', 'vault_storefront exists');
select has_function('public', 'vault_drop_card', 'vault_drop_card exists');
select is(has_function_privilege('anon', 'public.vault_storefront(text)', 'EXECUTE'), true, 'guests may read the storefront');
select is(has_function_privilege('authenticated', 'public.vault_drop_card(text)', 'EXECUTE'), true, 'signed-in users may read a drop card');
select is(
  (select count(*)::int from aclexplode((select proacl from pg_proc where oid = 'public.vault_storefront(text)'::regprocedure)) a where a.grantee = 0),
  0, 'PUBLIC has no EXECUTE on vault_storefront'
);

-- ── the storefront, as the stranger (a non-subscriber) ──────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000503","role":"authenticated"}', true);

select is(
  (select jsonb_array_length(public.vault_storefront((select id from public.creator_vaults where creator_id = 's3-creator')))),
  3, 'the storefront shows live + archived drops, not the owner-only draft'
);
select is(
  (select jsonb_path_query_first(public.vault_storefront((select id from public.creator_vaults where creator_id = 's3-creator')), '$[*] ? (@.caption == "Free one")')->>'accessible'),
  'true', 'a free drop is accessible to anyone'
);
select is(
  (select jsonb_path_query_first(public.vault_storefront((select id from public.creator_vaults where creator_id = 's3-creator')), '$[*] ? (@.caption == "Free one")')->'publicMedia'->>'bucket'),
  'public-media', 'a free drop carries its public media path'
);
select is(
  (select jsonb_path_query_first(public.vault_storefront((select id from public.creator_vaults where creator_id = 's3-creator')), '$[*] ? (@.caption == "Sub one")')->>'accessible'),
  'false', 'a subscriber drop reads as inaccessible to a non-subscriber'
);
select is(
  (select jsonb_path_query_first(public.vault_storefront((select id from public.creator_vaults where creator_id = 's3-creator')), '$[*] ? (@.caption == "Sub one")')->'publicMedia'),
  'null'::jsonb, 'a subscriber drop never exposes a media path'
);
select is(
  (select jsonb_path_query_first(public.vault_storefront((select id from public.creator_vaults where creator_id = 's3-creator')), '$[*] ? (@.caption == "Archived one")')->>'status'),
  'expired', 'an expired drop is still in the storefront'
);
select is(
  (select jsonb_array_length(jsonb_path_query_first(public.vault_storefront((select id from public.creator_vaults where creator_id = 's3-creator')), '$[*] ? (@.caption == "Archived one")')->'collectionIds')),
  1, 'the archived drop reports its collection'
);
select ok(
  (select not exists (
    select 1 from jsonb_array_elements(public.vault_storefront((select id from public.creator_vaults where creator_id = 's3-creator'))) e
     where e->>'caption' = 'Draft one'
  )),
  'another user draft is not in the storefront'
);
reset role;

-- ── the subscriber sees subscriber drops as accessible, still no public media ─
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}', true);
select is(
  (select jsonb_path_query_first(public.vault_storefront((select id from public.creator_vaults where creator_id = 's3-creator')), '$[*] ? (@.caption == "Sub one")')->>'accessible'),
  'true', 'the entitled subscriber may open the subscriber drop'
);
select is(
  (select jsonb_path_query_first(public.vault_storefront((select id from public.creator_vaults where creator_id = 's3-creator')), '$[*] ? (@.caption == "Sub one")')->'publicMedia'),
  'null'::jsonb, 'a subscriber drop still has no public media for the subscriber'
);
reset role;

-- ── the creator sees their own draft ────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}', true);
select is(
  (select jsonb_array_length(public.vault_storefront((select id from public.creator_vaults where creator_id = 's3-creator')))),
  4, 'the owner sees their draft too'
);
select is(
  (select jsonb_path_query_first(public.vault_storefront((select id from public.creator_vaults where creator_id = 's3-creator')), '$[*] ? (@.caption == "Draft one")')->>'status'),
  'draft', 'the draft is reported as a draft'
);
reset role;

-- ── drop card: locked drops still return a card; unknown ids return null ────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000503","role":"authenticated"}', true);
select is(
  (select public.vault_drop_card((select jsonb_path_query_first(public.vault_storefront((select id from public.creator_vaults where creator_id = 's3-creator')), '$[*] ? (@.caption == "Sub one")')->>'id'))->>'accessible'),
  'false', 'a locked subscriber drop still returns a card for a non-subscriber'
);
select is(public.vault_drop_card('vd_does_not_exist'), null, 'an unknown drop id has no card');
reset role;

-- removal (as the owner) tombstones the free drop
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}', true);
select lives_ok($$ select public.delete_vault_drop((select id from public.vault_drops where caption = 'Free one')) $$, 'creator removes the free drop');
reset role;

select is(
  (select public.vault_drop_card((select id from public.vault_drops where caption = 'Free one'))),
  null, 'a removed drop has no card'
);
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000503","role":"authenticated"}', true);
select is(
  (select jsonb_array_length(public.vault_storefront((select id from public.creator_vaults where creator_id = 's3-creator')))),
  2, 'a removed drop leaves the storefront'
);
reset role;

select * from finish();
rollback;


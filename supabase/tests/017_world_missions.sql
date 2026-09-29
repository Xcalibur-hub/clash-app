-- ============================================================================
-- World Missions + location-safe foundation (pgTAP).
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000801'),
  ('00000000-0000-0000-0000-000000000802'),
  ('00000000-0000-0000-0000-000000000803');

update public.profiles
   set id = 'w-alice', handle = 'w_alice', name = 'World Alice', role = 'viewer',
       reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000801';
update public.profiles
   set id = 'w-bob', handle = 'w_bob', name = 'World Bob', role = 'viewer',
       reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000802';
update public.profiles
   set id = 'w-cara', handle = 'w_cara', name = 'World Cara', role = 'viewer',
       reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000803';

insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, visibility, status)
values
  ('mw-alice-ready', 'w-alice', 'public-media', 'w-alice/mw-alice-ready/a.png', 'image', 'image/png', 'public', 'ready'),
  ('mw-alice-up', 'w-alice', 'public-media', 'w-alice/mw-alice-up/a.png', 'image', 'image/png', 'public', 'uploading'),
  ('mw-alice-priv', 'w-alice', 'private-media', 'w-alice/mw-alice-priv/a.png', 'image', 'image/png', 'private', 'ready'),
  ('mw-bob-ready', 'w-bob', 'public-media', 'w-bob/mw-bob-ready/b.png', 'image', 'image/png', 'public', 'ready'),
  ('mw-alice-ready-2', 'w-alice', 'public-media', 'w-alice/mw-alice-ready-2/a.png', 'image', 'image/png', 'public', 'ready');

-- Active mission for submission tests (seed may already exist; add a dedicated one).
insert into public.world_missions (id, title, description, prompt, status, starts_at, ends_at)
values (
  'wm_test_active',
  'Test Mission',
  'pgTAP mission',
  'Capture something nearby.',
  'ACTIVE',
  now() - interval '1 hour',
  now() + interval '2 days'
);

insert into public.world_missions (id, title, description, prompt, status, starts_at, ends_at)
values (
  'wm_test_ended',
  'Ended Mission',
  'closed',
  'Too late.',
  'ENDED',
  now() - interval '10 days',
  now() - interval '1 day'
);

-- ── schema / privileges ─────────────────────────────────────────────────────
select has_table('public', 'world_missions', 'world_missions table');
select has_table('public', 'world_drops', 'world_drops table');
select has_function('public', 'create_world_drop', 'create_world_drop exists');
select has_function('public', 'world_nearby', 'world_nearby exists');
select has_function('public', 'expire_world_drops', 'expire_world_drops exists');
select has_function('public', 'world_fuzz_location', 'world_fuzz_location exists');

select is(has_table_privilege('authenticated', 'public.world_drops', 'INSERT'), false, 'no client INSERT on world_drops');
select is(has_table_privilege('authenticated', 'public.world_drops', 'UPDATE'), false, 'no client UPDATE on world_drops');
select is(has_function_privilege('anon', 'public.create_world_drop(text,text,text,double precision,double precision)', 'EXECUTE'), false, 'anon cannot publish');
select is(has_function_privilege('authenticated', 'public.expire_world_drops(integer)', 'EXECUTE'), false, 'clients cannot expire');
select is(has_function_privilege('service_role', 'public.expire_world_drops(integer)', 'EXECUTE'), true, 'service_role may expire');

-- ── guest cannot publish ────────────────────────────────────────────────────
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select public.create_world_drop('wm_test_active', 'mw-alice-ready', 'hi', 15.4987, 73.8278) $$,
  '42501', null, 'guest cannot publish'
);
reset role;

-- ── media validation ────────────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}', true);

select throws_ok(
  $$ select public.create_world_drop('wm_test_active', 'mw-bob-ready', 'stolen', 15.4987, 73.8278) $$,
  '42501', null, 'media ownership required'
);
select throws_ok(
  $$ select public.create_world_drop('wm_test_active', 'mw-alice-up', 'not ready', 15.4987, 73.8278) $$,
  'P0003', null, 'media ready required'
);
select throws_ok(
  $$ select public.create_world_drop('wm_test_active', 'mw-alice-priv', 'private', 15.4987, 73.8278) $$,
  'P0004', null, 'private media rejected for public World Drop'
);
select throws_ok(
  $$ select public.create_world_drop('wm_test_ended', 'mw-alice-ready', 'late', 15.4987, 73.8278) $$,
  'P0006', null, 'ended Mission rejects new submission'
);

-- ── successful publish + privacy ────────────────────────────────────────────
-- Exact test point near Panjim (fake): 15.4987123, 73.8278456
select lives_ok(
  $$ select public.create_world_drop(
       'wm_test_active',
       'mw-alice-ready',
       'Golden hour at the river',
       15.4987123,
       73.8278456
     ) $$,
  'authenticated user can publish'
);

select is(
  (select author_id from public.world_drops where author_id = 'w-alice' and mission_id = 'wm_test_active'),
  'w-alice',
  'author derived server-side'
);

select ok(
  (select expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour'
     from public.world_drops where author_id = 'w-alice' and mission_id = 'wm_test_active'),
  'server stamps seven-day expiry'
);

select is(
  (select status::text from public.world_drops where author_id = 'w-alice' and mission_id = 'wm_test_active'),
  'PUBLISHED',
  'drop publishes as PUBLISHED'
);

-- Raw coordinates must NOT equal stored approx (fuzzed cell centre).
select isnt(
  round(extensions.ST_Y((select approx_location from public.world_drops where author_id = 'w-alice' and mission_id = 'wm_test_active')::extensions.geometry)::numeric, 7),
  15.4987123::numeric,
  'raw latitude not persisted'
);
select isnt(
  round(extensions.ST_X((select approx_location from public.world_drops where author_id = 'w-alice' and mission_id = 'wm_test_active')::extensions.geometry)::numeric, 7),
  73.8278456::numeric,
  'raw longitude not persisted'
);

-- Stored point equals fuzz helper output for the same inputs.
select is(
  (select approx_location from public.world_drops where author_id = 'w-alice' and mission_id = 'wm_test_active'),
  public.world_fuzz_location(15.4987123, 73.8278456),
  'approximate location stored as fuzzed cell centre'
);

-- No text column contains the raw coordinate strings.
select is(
  (select count(*)::int from public.world_drops d
    where d.author_id = 'w-alice'
      and (
        d.caption like '%15.4987123%'
        or d.location_cell like '%15.4987123%'
        or coalesce(d.location_label, '') like '%15.4987123%'
        or d.caption like '%73.8278456%'
      )),
  0,
  'raw coordinates absent from text columns'
);

-- Exact coords cannot be reconstructed: fuzz is many-to-one.
select is(
  public.world_fuzz_location(15.4987123, 73.8278456),
  public.world_fuzz_location(15.4961000, 73.8251000),
  'nearby distinct points collapse to same cell (non-reconstructible)'
);

-- One per mission
select throws_ok(
  $$ select public.create_world_drop(
       'wm_test_active',
       'mw-alice-ready-2',
       'second try',
       15.4987,
       73.8278
     ) $$,
  'P0007', null, 'one submission per mission'
);
reset role;

-- ── nearby + distance band (Bob) ────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000802","role":"authenticated"}', true);

select ok(
  jsonb_array_length(public.world_nearby(15.4990, 73.8280, 25, 20)) >= 1,
  'nearby read works'
);

select ok(
  (public.world_nearby(15.4990, 73.8280, 25, 20) -> 0 ->> 'distanceBand') in ('< 1 km', '1–3 km', '3–10 km', '10–25 km', '25+ km'),
  'response uses distance band not metres'
);

select ok(
  (public.world_nearby(15.4990, 73.8280, 25, 20) -> 0 ->> 'approxLat') is not null
  and (public.world_nearby(15.4990, 73.8280, 25, 20) -> 0 ->> 'approxLat') <> '15.4987123',
  'nearby exposes only coarse lat'
);

select is(
  public.world_nearby(15.4990, 73.8280, 25, 20) -> 0 ? 'meters',
  false,
  'exact metres not exposed'
);
reset role;

-- ── block both directions removes discovery ─────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000802","role":"authenticated"}', true);
select lives_ok($$ select public.block_profile('w-alice') $$, 'bob blocks alice');
select is(
  (select count(*)::int from jsonb_array_elements(public.world_nearby(15.4990, 73.8280, 25, 20)) e
    where e->>'id' = (select id from public.world_drops where author_id = 'w-alice' and mission_id = 'wm_test_active')),
  0,
  'block removes discovery for blocker'
);
select lives_ok($$ select public.unblock_profile('w-alice') $$, 'bob unblocks alice');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}', true);
select lives_ok($$ select public.block_profile('w-bob') $$, 'alice blocks bob');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000802","role":"authenticated"}', true);
select is(
  (select count(*)::int from jsonb_array_elements(public.world_nearby(15.4990, 73.8280, 25, 20)) e
    where e->>'id' = (select id from public.world_drops where author_id = 'w-alice' and mission_id = 'wm_test_active')),
  0,
  'block removes discovery for blocked party'
);
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}', true);
select lives_ok($$ select public.unblock_profile('w-bob') $$, 'alice unblocks bob');
reset role;

-- ── mute removes discovery ──────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000802","role":"authenticated"}', true);
select lives_ok($$ select public.mute_profile('w-alice') $$, 'bob mutes alice');
select is(
  (select count(*)::int from jsonb_array_elements(public.world_nearby(15.4990, 73.8280, 25, 20)) e
    where e->>'id' = (select id from public.world_drops where author_id = 'w-alice' and mission_id = 'wm_test_active')),
  0,
  'mute removes discovery'
);
select lives_ok($$ select public.unmute_profile('w-alice') $$, 'bob unmutes alice');
reset role;

-- ── creator removal ─────────────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}', true);
select lives_ok(
  $$ select public.remove_world_drop(
       (select id from public.world_drops where author_id = 'w-alice' and mission_id = 'wm_test_active')
     ) $$,
  'creator removal works'
);
select is(
  (select status::text from public.world_drops where author_id = 'w-alice' and mission_id = 'wm_test_active'),
  'REMOVED',
  'removed drop tombstoned'
);
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000802","role":"authenticated"}', true);
select is(
  (select count(*)::int from jsonb_array_elements(public.world_nearby(15.4990, 73.8280, 25, 20)) e
    where e->>'id' = (select id from public.world_drops where author_id = 'w-alice' and mission_id = 'wm_test_active')),
  0,
  'removed drop not discoverable'
);
reset role;

-- Republish after remove (slot freed) then expire via maintenance
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_world_drop(
       'wm_test_active',
       'mw-alice-ready-2',
       'back again',
       15.4987,
       73.8278
     ) $$,
  'may republish after remove'
);
reset role;

reset role;
select set_config('request.jwt.claims', null, true);
update public.world_drops
   set expires_at = now() - interval '1 minute'
 where author_id = 'w-alice' and status = 'PUBLISHED' and mission_id = 'wm_test_active';

select is(public.expire_world_drops(50), 1, 'automatic expiry flips one drop');
select is(
  (select status::text from public.world_drops where author_id = 'w-alice' and caption = 'back again'),
  'EXPIRED',
  'expired Drops marked EXPIRED'
);

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000802","role":"authenticated"}', true);
select is(
  (select count(*)::int from jsonb_array_elements(public.world_nearby(15.4990, 73.8280, 25, 20)) e
    where e->>'id' = (select id from public.world_drops where author_id = 'w-alice' and caption = 'back again')),
  0,
  'expired Drops not discoverable'
);
reset role;

-- Maintenance integration preserves prior keys and adds world_drops_expired
reset role;
select set_config('request.jwt.claims', null, true);
select ok(
  (public.run_maintenance(10) ? 'world_drops_expired')
  and (public.run_maintenance(10) ? 'clashes_settled')
  and (public.run_maintenance(10) ? 'prediction_games_closed')
  and (public.run_maintenance(10) ? 'vault_drops_expired'),
  'maintenance integration keeps existing jobs and world expiry'
);

-- Raw write denied under authenticated
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.world_drops (
       id, author_id, media_object_id, caption, approx_location, location_cell, status, published_at, expires_at
     ) values (
       'wd_raw', 'w-alice', 'mw-alice-ready', 'raw',
       public.world_fuzz_location(15.5, 73.8), 'teight', 'PUBLISHED', now(), now() + interval '7 days'
     ) $$,
  '42501', null, 'raw INSERT denied'
);
reset role;

select finish();
rollback;

-- ============================================================================
-- Take creation RPC tests (pgTAP). Self-contained; run: supabase test db
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

-- Fixtures: auth users + profiles (trigger builds profiles, then we pin ids).
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');

update public.profiles set id = 't-alice', handle = 'alice_t', name = 'Alice', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000001';
update public.profiles set id = 't-bob', handle = 'bob_t', name = 'Bob', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000002';

-- Media fixtures across ownership / readiness / visibility states.
insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, visibility, status)
values
  ('m-alice-ready', 't-alice', 'public-media', 't-alice/m-alice-ready/m-alice-ready.png', 'image', 'image/png', 'public', 'ready'),
  ('m-alice-upload', 't-alice', 'public-media', 't-alice/m-alice-upload/m-alice-upload.png', 'image', 'image/png', 'public', 'uploading'),
  ('m-alice-priv', 't-alice', 'private-media', 't-alice/m-alice-priv/m-alice-priv.png', 'image', 'image/png', 'private', 'ready'),
  ('m-bob-ready', 't-bob', 'public-media', 't-bob/m-bob-ready/m-bob-ready.png', 'image', 'image/png', 'public', 'ready');

-- ── schema objects ──────────────────────────────────────────────────────────
select has_function('public', 'create_take', 'create_take exists');
select has_column('public', 'takes', 'media_object_id', 'takes.media_object_id exists');

-- ── privileges: RPC is authenticated-only ────────────────────────────────────
select is(has_function_privilege('authenticated', 'public.create_take(public.hood_id, text, text, text, text)', 'EXECUTE'), true, 'authenticated can create a take');
select is(has_function_privilege('anon', 'public.create_take(public.hood_id, text, text, text, text)', 'EXECUTE'), false, 'anon cannot create a take');

-- ── signed-out user is rejected ──────────────────────────────────────────────
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"anon"}', true);
select throws_ok($$ select public.create_take('techtakes', 'hello arena') $$, '42501', null, 'signed-out user cannot drop a take');
reset role;

-- ── author is always derived from the session ────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select public.create_take('techtakes', 'alice drops a take')).author_id, 't-alice', 'author is derived from caller, not payload');
reset role;

-- ── 24-hour window + active status are server-owned ──────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok(
  (select expires_at between now() and now() + interval '24 hours' from public.takes where author_id = 't-alice' and text = 'alice drops a take'),
  'expires_at is server-stamped within 24 hours'
);
select is((select status::text from public.takes where author_id = 't-alice' and text = 'alice drops a take'), 'active', 'new take is active');
reset role;

-- ── text length is validated server-side ─────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.create_take('techtakes', '') $$, 'P0003', null, 'empty take rejected');
select throws_ok($$ select public.create_take('techtakes', repeat('x', 181)) $$, 'P0003', null, 'take over 180 chars rejected');
reset role;

-- ── media must belong to the caller ──────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.create_take('techtakes', 'with bob media', 'm-bob-ready', 'http://127.0.0.1/public-media/t-bob/m-bob-ready/m-bob-ready.png') $$, 'P0001', null, 'cannot attach another user media');
select throws_ok($$ select public.create_take('techtakes', 'with uploading media', 'm-alice-upload', 'http://127.0.0.1/public-media/t-alice/m-alice-upload/m-alice-upload.png') $$, 'P0004', null, 'cannot attach unready media');
select throws_ok($$ select public.create_take('techtakes', 'with private media', 'm-alice-priv', 'http://127.0.0.1/private-media/t-alice/m-alice-priv/m-alice-priv.png') $$, 'P0005', null, 'cannot attach private media');
reset role;

-- ── successful media take stores the object reference + rendered kind/url ────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select public.create_take('techtakes', 'alice media take', 'm-alice-ready', 'http://127.0.0.1/public-media/t-alice/m-alice-ready/m-alice-ready.png') $$, 'alice creates media take');
reset role;
select is((select media_object_id from public.takes where text = 'alice media take'), 'm-alice-ready', 'media_object_id stored');
select is((select media_kind::text from public.takes where text = 'alice media take'), 'image', 'media_kind copied from object');
select is((select media_url from public.takes where text = 'alice media take'), 'http://127.0.0.1/public-media/t-alice/m-alice-ready/m-alice-ready.png', 'media_url stored for rendering');

select * from finish();
rollback;

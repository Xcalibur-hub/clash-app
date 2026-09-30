-- ============================================================================
-- Media & storage security tests (pgTAP). Self-contained; run: supabase test db
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

-- A public + private media row owned by bob, plus two storage objects.
insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, visibility)
values
  ('m-pub', 't-bob', 'public-media', 't-bob/m-pub/m-pub.png', 'image', 'image/png', 'public'),
  ('m-priv', 't-bob', 'private-media', 't-bob/m-priv/m-priv.png', 'image', 'image/png', 'private');

insert into storage.objects (bucket_id, name, owner) values
  ('public-media', 't-bob/m-pub/m-pub.png', '00000000-0000-0000-0000-000000000002'),
  ('private-media', 't-bob/m-priv/m-priv.png', '00000000-0000-0000-0000-000000000002');

-- ── schema objects ──────────────────────────────────────────────────────────
select has_table('public', 'media_objects', 'media_objects table exists');
select has_function('public', 'create_media_upload', 'create_media_upload exists');
select has_function('public', 'complete_media_upload', 'complete_media_upload exists');
select has_function('public', 'fail_media_upload', 'fail_media_upload exists');
select has_function('public', 'delete_media', 'delete_media exists');

-- ── privileges: media_objects did NOT inherit blanket DML ───────────────────
select is(has_table_privilege('authenticated', 'public.media_objects', 'INSERT'), false, 'no blanket INSERT');
select is(has_table_privilege('authenticated', 'public.media_objects', 'UPDATE'), false, 'no blanket UPDATE');
select is(has_table_privilege('authenticated', 'public.media_objects', 'DELETE'), false, 'no blanket DELETE');

-- ── signed-out cannot create an upload ──────────────────────────────────────
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"anon"}', true);
select throws_ok($$ select public.create_media_upload('image', 'image/png', 'public') $$, '42501', null, 'signed-out user cannot create upload');
reset role;

-- ── upload is always owned by the caller ────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select public.create_media_upload('image', 'image/png', 'public') $$, 'alice creates upload');
reset role;
select isnt_empty($$ select * from public.media_objects where owner_id = 't-alice' $$, 'media is created for the caller');
select is((select count(*)::int from public.media_objects where owner_id = 't-bob'), 2, 'alice upload did not create media for bob');

-- ── cannot complete another user's media ────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.complete_media_upload('m-pub', 100) $$, 'P0001', null, 'cannot complete another user media');
reset role;

-- ── raw UPDATE of owner/path/visibility is forbidden ────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ update public.media_objects set owner_id = 't-alice' where id = 'm-pub' $$, '42501', null, 'cannot change owner_id');
select throws_ok($$ update public.media_objects set storage_path = 'x' where id = 'm-pub' $$, '42501', null, 'cannot change storage_path');
select throws_ok($$ update public.media_objects set visibility = 'public' where id = 'm-priv' $$, '42501', null, 'cannot flip private to public');
reset role;

-- ── invalid enum values rejected ────────────────────────────────────────────
select throws_ok($$ insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, visibility, status) values ('x1', 't-alice', 'public-media', 't-alice/x1/x1.png', 'image', 'image/png', 'public', 'bogus') $$, '22P02', null, 'invalid status rejected');
select throws_ok($$ insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, visibility) values ('x2', 't-alice', 'public-media', 't-alice/x2/x2.png', 'image', 'image/png', 'bogus') $$, '22P02', null, 'invalid visibility rejected');

-- ── media_objects RLS: public readable, private not ─────────────────────────
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"anon"}', true);
select isnt_empty($$ select * from public.media_objects where id = 'm-pub' $$, 'anon reads public media metadata');
select is_empty($$ select * from public.media_objects where id = 'm-priv' $$, 'anon cannot read private media metadata');
reset role;

-- ── storage.objects: public readable, private not, owner-only delete ────────
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"anon"}', true);
select isnt_empty($$ select * from storage.objects where bucket_id = 'public-media' $$, 'anon reads public bucket objects');
select is_empty($$ select * from storage.objects where bucket_id = 'private-media' $$, 'anon cannot read private bucket objects');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
-- Storage API now blocks direct DELETE on storage.objects (protect_delete trigger).
-- Assert the protected path rejects client deletes rather than relying on RLS alone.
select throws_ok(
  $$ delete from storage.objects where bucket_id = 'public-media' and name = 't-bob/m-pub/m-pub.png' returning id $$,
  null,
  null,
  'cannot delete storage objects via direct SQL'
);
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('public-media', 't-bob/x/y.png', '00000000-0000-0000-0000-000000000001') $$, '42501', null, 'cannot upload into another namespace');
reset role;

select * from finish();
rollback;

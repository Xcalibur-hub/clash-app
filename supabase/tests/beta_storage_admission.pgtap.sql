-- Disposable PostgreSQL only. Entire fixture graph and all effects roll back.
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);
select set_config('storage.operation', null, true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-media', 'public-media', true, 104857600, array['image/png','image/jpeg']),
  ('private-media', 'private-media', false, 104857600, array['image/png','image/jpeg'])
on conflict (id) do nothing;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000f201'),
  ('00000000-0000-0000-0000-00000000f202');

update public.profiles set id = 'u_f2a01', handle = 'f2_alice'
 where auth_user_id = '00000000-0000-0000-0000-00000000f201';
update public.profiles set id = 'u_f2b02', handle = 'f2_bob'
 where auth_user_id = '00000000-0000-0000-0000-00000000f202';

insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, visibility, status, created_at, ready_at, deleted_at)
values
  ('m-f2-up',        'u_f2a01', 'public-media',  'u_f2a01/m-f2-up/m-f2-up.png',   'image', 'image/png', 'public',  'uploading', now(), null, null),
  ('m-f2-priv-up',   'u_f2a01', 'private-media', 'u_f2a01/m-f2-priv/m-f2-priv.png','image', 'image/png', 'private', 'uploading', now(), null, null),
  ('m-f2-ready',     'u_f2a01', 'public-media',  'u_f2a01/m-f2-rdy/m-f2-rdy.png', 'image', 'image/png', 'public',  'ready',     now(), now(), null),
  ('m-f2-priv-rdy',  'u_f2a01', 'private-media', 'u_f2a01/m-f2-pr/m-f2-pr.png',   'image', 'image/png', 'private', 'ready',     now(), now(), null),
  ('m-f2-failed',    'u_f2a01', 'public-media',  'u_f2a01/m-f2-fail/m-f2-fail.png','image', 'image/png', 'public',  'failed',    now(), null, null),
  ('m-f2-deleted',   'u_f2a01', 'public-media',  'u_f2a01/m-f2-del/m-f2-del.png', 'image', 'image/png', 'public',  'deleted',   now(), null, now()),
  ('m-f2-softdel',   'u_f2a01', 'public-media',  'u_f2a01/m-f2-sdel/m-f2-sdel.png','image','image/png', 'public',  'uploading', now(), null, now()),
  ('m-f2-expired',   'u_f2a01', 'public-media',  'u_f2a01/m-f2-exp/m-f2-exp.png', 'image', 'image/png', 'public',  'uploading', now() - interval '25 hours', null, null),
  ('m-f2-bob-up',    'u_f2b02', 'public-media',  'u_f2b02/m-f2-bup/m-f2-bup.png', 'image', 'image/png', 'public',  'uploading', now(), null, null);

insert into storage.objects (bucket_id, name, owner, owner_id)
values
  ('public-media',  'u_f2a01/m-f2-rdy/m-f2-rdy.png', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000f201'),
  ('private-media', 'u_f2a01/m-f2-pr/m-f2-pr.png',   '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000f201');

create function pg_temp.f2_login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-00000000f20' || who, 'role', 'authenticated')::text, true)::text;
$$;

-- Policy inventory checks
select is((select count(*)::int from pg_policies where schemaname='storage' and tablename='objects' and policyname='media upload into own namespace'), 0, 'legacy own-namespace INSERT policy removed');
select is((select count(*)::int from pg_policies where schemaname='storage' and tablename='objects' and policyname='own media objects are updatable'), 0, 'legacy permissive UPDATE policy removed');
select is((select count(*)::int from pg_policies where schemaname='storage' and tablename='objects' and policyname='admitted media upload only'), 1, 'narrow admitted INSERT policy installed');
select ok(not has_function_privilege('authenticated', 'public.guard_beta_storage_upload()', 'EXECUTE'), 'storage trigger helper private');

-- Anonymous rejected
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('public-media', 'u_f2a01/m-f2-up/m-f2-up.png', '00000000-0000-0000-0000-00000000f201') $$, '42501', null, 'anon cannot insert storage objects');
reset role;

-- Negative authenticated INSERT vectors
select pg_temp.f2_login('1');
set local role authenticated;
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('public-media', 'u_f2a01/evil/unadmitted.png', '00000000-0000-0000-0000-00000000f201') $$, '42501', null, 'unadmitted own-namespace INSERT rejected');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('public-media', 'u_f2a01/m-f2-up/m-f2-up_poster.jpg', '00000000-0000-0000-0000-00000000f201') $$, '42501', null, 'path-substituted sibling rejected');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('private-media', 'u_f2a01/m-f2-up/m-f2-up.png', '00000000-0000-0000-0000-00000000f201') $$, '42501', null, 'cross-bucket mismatch rejected');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('public-media', 'u_f2b02/m-f2-bup/m-f2-bup.png', '00000000-0000-0000-0000-00000000f201') $$, '42501', null, 'cross-owner path write rejected');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('public-media', 'u_f2a01/m-f2-up/m-f2-up.png', '00000000-0000-0000-0000-00000000f202') $$, '42501', null, 'spoofed owner column rejected');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner, owner_id) values ('public-media', 'u_f2a01/m-f2-up/m-f2-up.png', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000f202') $$, '42501', null, 'spoofed owner_id column rejected');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('public-media', 'u_f2a01/m-f2-fail/m-f2-fail.png', '00000000-0000-0000-0000-00000000f201') $$, '42501', null, 'failed admission record rejected');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('public-media', 'u_f2a01/m-f2-del/m-f2-del.png', '00000000-0000-0000-0000-00000000f201') $$, '42501', null, 'deleted admission record rejected');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('public-media', 'u_f2a01/m-f2-sdel/m-f2-sdel.png', '00000000-0000-0000-0000-00000000f201') $$, '42501', null, 'deleted_at nonnull admission rejected');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('public-media', 'u_f2a01/m-f2-exp/m-f2-exp.png', '00000000-0000-0000-0000-00000000f201') $$, '42501', null, 'expired >24h uploading admission rejected');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('public-media', 'u_f2a01/m-f2-rdy/m-f2-rdy.png', '00000000-0000-0000-0000-00000000f201') on conflict (bucket_id, name collate "C") where (archived_at is null) do update set version='2' $$, '42501', null, 'UPSERT overwrite of ready object rejected');

-- Legitimate upload + completion + read + post-completion overwrite rejection
select lives_ok($$ insert into storage.objects (bucket_id, name, owner) values ('public-media', 'u_f2a01/m-f2-up/m-f2-up.png', '00000000-0000-0000-0000-00000000f201') $$, 'admitted uploading object INSERT succeeds');
select lives_ok($$ select public.complete_media_upload('m-f2-up', 1234, 100, 100) $$, 'complete_media_upload succeeds after admitted INSERT');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('public-media', 'u_f2a01/m-f2-up/m-f2-up.png', '00000000-0000-0000-0000-00000000f201') on conflict (bucket_id, name collate "C") where (archived_at is null) do update set version='x' $$, '42501', null, 'overwrite after completion rejected');
select is((select count(*)::int from storage.objects where bucket_id='private-media' and name='u_f2a01/m-f2-pr/m-f2-pr.png'), 1, 'owner retains private-media read');
select lives_ok($$ update storage.objects set version='2' where bucket_id='public-media' and name='u_f2a01/m-f2-up/m-f2-up.png' $$, 'RLS hides update silently or 0 rows');
select is((select coalesce(version, 'ok') from storage.objects where bucket_id='public-media' and name='u_f2a01/m-f2-up/m-f2-up.png'), 'ok', 'completed object version unmutated');

-- Bob cannot read private-media or overwrite alice object, and alice can delete own then replay is denied
select pg_temp.f2_login('2');
select is((select count(*)::int from storage.objects where bucket_id='private-media' and name='u_f2a01/m-f2-pr/m-f2-pr.png'), 0, 'non-owner cannot read private-media');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('public-media', 'u_f2a01/m-f2-priv/m-f2-priv.png', '00000000-0000-0000-0000-00000000f202') $$, '42501', null, 'Bob cannot upload into Alice active private admission');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner) values ('public-media', 'u_f2b02/m-f2-bup/m-f2-bup.png', '00000000-0000-0000-0000-00000000f202') $$, 'LIKE underscore wildcard u_f2a01 vs u_f2b02 does not break distinct owner upload');

-- Delete + replay check (storage.allow_delete_query simulates Storage API DELETE handler)
select pg_temp.f2_login('1');
select set_config('storage.allow_delete_query', 'true', true);
select lives_ok($$ delete from storage.objects where bucket_id='public-media' and name='u_f2a01/m-f2-up/m-f2-up.png' $$, 'owner can delete storage object');
select set_config('storage.allow_delete_query', 'false', true);
select lives_ok($$ select public.delete_media('m-f2-up') $$, 'delete_media tombstones record');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('public-media', 'u_f2a01/m-f2-up/m-f2-up.png', '00000000-0000-0000-0000-00000000f201') $$, '42501', null, 'replay INSERT after deletion rejected');
reset role;

-- Signed-upload service_role operation simulation (storage.operation = storage.object.upload_signed)
select set_config('storage.operation', 'storage.object.upload_signed', true);
set local role service_role;
select lives_ok($$ insert into storage.objects (bucket_id, name, owner, owner_id) values ('private-media', 'u_f2a01/m-f2-priv/m-f2-priv.png', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000f201') $$, 'signed upload succeeds when media_objects is uploading');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner, owner_id) values ('public-media', 'u_f2a01/m-f2-up/m-f2-up.png', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000f201') $$, '42501', null, 'stale signed upload blocked by trigger even as service_role');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner, owner_id) values ('private-media', 'u_f2a01/m-f2-priv/m-f2-priv.png', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000f201') on conflict (bucket_id, name collate "C") where (archived_at is null) do update set version='x' $$, '42501', null, 'signed upload upsert overwrite rejected');
select set_config('storage.operation', 'storage.tus.upload.create_signed', true);
select throws_ok($$ insert into storage.objects (bucket_id, name, owner, owner_id) values ('public-media', 'u_f2a01/m-f2-up/m-f2-up.png', '00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-00000000f201') $$, '42501', null, 'stale signed TUS create blocked even as service_role');

-- Trusted non-signed service_role writer preserved
select set_config('storage.operation', 'storage.object.upload', true);
select lives_ok($$ insert into storage.objects (bucket_id, name, owner) values ('public-media', 'devfx/trusted-service.png', null) $$, 'trusted service_role upload preserved');

select * from finish();
rollback;

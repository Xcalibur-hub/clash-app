-- ============================================================================
-- Comment media replies (pgTAP). Self-contained; run: supabase test db
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

-- Fixtures
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2');

update public.profiles set id = 'cm-alice', handle = 'cm_alice', name = 'Alice CM', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set id = 'cm-bob', handle = 'cm_bob', name = 'Bob CM', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-0000000000a2';

insert into public.takes (id, author_id, hood, text, created_at, expires_at, status)
values
  ('cm-take', 'cm-alice', 'techtakes', 'media reply take', now(), now() + interval '12 hours', 'active'),
  ('cm-take-expired', 'cm-alice', 'techtakes', 'expired', now() - interval '25 hours', now() - interval '1 hour', 'expired');

insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, visibility, status)
values
  ('cm-alice-img', 'cm-alice', 'public-media', 'cm-alice/cm-alice-img/x.png', 'image', 'image/png', 'public', 'ready'),
  ('cm-alice-vid', 'cm-alice', 'public-media', 'cm-alice/cm-alice-vid/x.mp4', 'video', 'video/mp4', 'public', 'ready'),
  ('cm-alice-up', 'cm-alice', 'public-media', 'cm-alice/cm-alice-up/x.png', 'image', 'image/png', 'public', 'uploading'),
  ('cm-alice-priv', 'cm-alice', 'private-media', 'cm-alice/cm-alice-priv/x.png', 'image', 'image/png', 'private', 'ready'),
  ('cm-bob-img', 'cm-bob', 'public-media', 'cm-bob/cm-bob-img/x.png', 'image', 'image/png', 'public', 'ready');

-- ── schema ──────────────────────────────────────────────────────────────────
select has_column('public', 'comments', 'media_object_id', 'comments.media_object_id exists');
select has_column('public', 'comments', 'media_kind', 'comments.media_kind exists');
select has_column('public', 'comments', 'media_url', 'comments.media_url exists');
select has_function('public', 'create_comment', 'create_comment exists');

select is(
  has_function_privilege('authenticated', 'public.create_comment(text, text, text, text, text)', 'EXECUTE'),
  true,
  'authenticated can create_comment'
);
select is(
  has_function_privilege('anon', 'public.create_comment(text, text, text, text, text)', 'EXECUTE'),
  false,
  'anon cannot create_comment'
);

-- ── text-only still works ───────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_comment('cm-take', 'text only rebuttal') $$,
  'text-only comment works'
);
reset role;
select is(
  (select media_object_id from public.comments where text = 'text only rebuttal'),
  null,
  'text-only has no media'
);

-- ── image-only ──────────────────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_comment('cm-take', '', null, 'cm-alice-img', 'http://127.0.0.1/public-media/cm-alice/cm-alice-img/x.png') $$,
  'image-only comment works'
);
reset role;
select is((select media_kind::text from public.comments where media_object_id = 'cm-alice-img'), 'image', 'image kind stamped');
select is((select text from public.comments where media_object_id = 'cm-alice-img'), '', 'image-only text may be empty');

-- ── video-only ──────────────────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_comment('cm-take', '', null, 'cm-alice-vid', 'http://127.0.0.1/public-media/cm-alice/cm-alice-vid/x.mp4') $$,
  'video-only comment works'
);
reset role;
select is((select media_kind::text from public.comments where media_object_id = 'cm-alice-vid'), 'video', 'video kind stamped');

-- ── text + media ────────────────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
-- bob needs his own ready media for text+media
select lives_ok(
  $$ select public.create_comment('cm-take', 'sure they have', null, 'cm-bob-img', 'http://127.0.0.1/public-media/cm-bob/cm-bob-img/x.png') $$,
  'text + media comment works'
);
reset role;
select is(
  (select text from public.comments where media_object_id = 'cm-bob-img'),
  'sure they have',
  'text + media keeps text'
);

-- ── reject empty ────────────────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_comment('cm-take', '') $$,
  'P0003',
  null,
  'empty comment rejected'
);
select throws_ok(
  $$ select public.create_comment('cm-take', '   ') $$,
  'P0003',
  null,
  'whitespace-only comment rejected'
);

-- ── reject another user's media ─────────────────────────────────────────────
select throws_ok(
  $$ select public.create_comment('cm-take', 'stolen', null, 'cm-bob-img', 'http://127.0.0.1/public-media/cm-bob/cm-bob-img/x.png') $$,
  'P0001',
  null,
  'cannot attach another user media'
);

-- ── reject invalid / non-ready media ────────────────────────────────────────
select throws_ok(
  $$ select public.create_comment('cm-take', 'uploading', null, 'cm-alice-up', 'http://127.0.0.1/public-media/cm-alice/cm-alice-up/x.png') $$,
  'P0004',
  null,
  'cannot attach unready media'
);
select throws_ok(
  $$ select public.create_comment('cm-take', 'private', null, 'cm-alice-priv', 'http://127.0.0.1/private-media/cm-alice/cm-alice-priv/x.png') $$,
  'P0005',
  null,
  'cannot attach private media'
);
select throws_ok(
  $$ select public.create_comment('cm-take', 'missing', null, 'cm-nope', 'http://127.0.0.1/x.png') $$,
  'P0002',
  null,
  'cannot attach missing media'
);
reset role;

-- ── threaded reply still works (with media) ─────────────────────────────────
reset role;
insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, visibility, status)
values ('cm-bob-img2', 'cm-bob', 'public-media', 'cm-bob/cm-bob-img2/x.png', 'image', 'image/png', 'public', 'ready');
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_comment(
       'cm-take',
       'nested meme',
       (select id from public.comments where text = 'text only rebuttal' limit 1),
       'cm-bob-img2',
       'http://127.0.0.1/public-media/cm-bob/cm-bob-img2/x.png'
     ) $$,
  'nested media reply works'
);
reset role;
select isnt(
  (select parent_comment_id from public.comments where media_object_id = 'cm-bob-img2'),
  null,
  'nested media reply keeps parent'
);

-- ── Clash challenger comment with media remains eligible ────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
select lives_ok(
  $$ select public.start_clash(
       'cm-take',
       (select id from public.comments where media_object_id = 'cm-bob-img' limit 1)
     ) $$,
  'start_clash accepts media challenger comment'
);
reset role;

select ok(
  (select challenger_comment_id is not null from public.clashes where take_id = 'cm-take' limit 1),
  'challenger_comment_id preserved'
);

select is(
  (select public.clash_view((select id from public.clashes where take_id = 'cm-take' limit 1)) ->> 'sideBText'),
  'sure they have',
  'clash_view sideBText from media comment'
);
select is(
  (select public.clash_view((select id from public.clashes where take_id = 'cm-take' limit 1)) ->> 'sideBMediaKind'),
  'image',
  'clash_view exposes sideBMediaKind'
);
select isnt(
  (select public.clash_view((select id from public.clashes where take_id = 'cm-take' limit 1)) ->> 'sideBMediaUrl'),
  null,
  'clash_view exposes sideBMediaUrl'
);

-- ── direct insert RLS: cannot attach foreign media ──────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.comments (id, take_id, author_id, text, media_object_id, media_url)
     values ('cm-forge', 'cm-take', 'cm-alice', 'forge', 'cm-bob-img', 'http://127.0.0.1/x.png') $$,
  'P0001',
  null,
  'direct insert cannot attach another user media'
);
reset role;

-- ── expired take rejected via RPC ───────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_comment('cm-take-expired', 'too late') $$,
  '42501',
  null,
  'RPC rejects expired take'
);
reset role;

select * from finish();
rollback;

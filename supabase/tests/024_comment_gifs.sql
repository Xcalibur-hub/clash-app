-- ============================================================================
-- Comment GIF replies (pgTAP). Self-contained; run: supabase test db
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000b2');

update public.profiles set id = 'cg-alice', handle = 'cg_alice', name = 'Alice CG', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set id = 'cg-bob', handle = 'cg_bob', name = 'Bob CG', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-0000000000b2';

insert into public.takes (id, author_id, hood, text, expires_at, status)
values ('cg-take', 'cg-alice', 'techtakes', 'gif reply take', now() + interval '12 hours', 'active');

insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, visibility, status)
values ('cg-bob-img', 'cg-bob', 'public-media', 'cg-bob/cg-bob-img/x.png', 'image', 'image/png', 'public', 'ready');

select has_column('public', 'comments', 'gif_provider', 'comments.gif_provider exists');
select has_column('public', 'comments', 'gif_external_id', 'comments.gif_external_id exists');
select ok(public.is_allowed_tenor_media_url('https://media.tenor.com/abc/tiny.gif'), 'tenor https url allowed');
select ok(not public.is_allowed_tenor_media_url('https://evil.example/x.gif'), 'non-tenor url rejected');
select ok(not public.is_allowed_tenor_media_url('http://media.tenor.com/x.gif'), 'http tenor rejected');

-- GIF-only
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_comment(
       'cg-take', '', null, null,
       'https://media.tenor.com/abc123/tiny.gif',
       'tenor', 'abc123'
     ) $$,
  'gif-only comment works'
);
reset role;
select is((select media_kind::text from public.comments where gif_external_id = 'abc123'), 'gif', 'gif kind stamped');
select is((select media_object_id from public.comments where gif_external_id = 'abc123'), null, 'gif has no media_object');

-- text + GIF
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_comment(
       'cg-take', 'literally this', null, null,
       'https://c.tenor.com/xyz/tinys.gif',
       'tenor', 'xyz789'
     ) $$,
  'text + gif works'
);

-- nested GIF
select lives_ok(
  $$ select public.create_comment(
       'cg-take',
       'nested',
       (select id from public.comments where gif_external_id = 'abc123' limit 1),
       null,
       'https://media1.tenor.com/n1/tiny.gif',
       'tenor',
       'nested1'
     ) $$,
  'nested gif reply works'
);

-- reject arbitrary host
select throws_ok(
  $$ select public.create_comment('cg-take', 'nope', null, null, 'https://evil.example/x.gif', 'tenor', 'bad1') $$,
  'P0005',
  null,
  'non-tenor gif url rejected'
);

-- reject unknown provider
select throws_ok(
  $$ select public.create_comment('cg-take', 'nope', null, null, 'https://media.tenor.com/x.gif', 'giphy', 'g1') $$,
  'P0003',
  null,
  'non-tenor provider rejected'
);

-- reject gif + upload combo
select throws_ok(
  $$ select public.create_comment(
       'cg-take', 'both', null, 'cg-bob-img',
       'https://media.tenor.com/x.gif', 'tenor', 'both1'
     ) $$,
  'P0003',
  null,
  'cannot combine gif and upload'
);

-- Clash with gif challenger comment
select lives_ok(
  $$ select public.start_clash(
       'cg-take',
       (select id from public.comments where gif_external_id = 'xyz789' limit 1)
     ) $$,
  'start_clash accepts gif challenger comment'
);
reset role;

select is(
  (select public.clash_view((select id from public.clashes where take_id = 'cg-take' limit 1)) ->> 'sideBMediaKind'),
  'gif',
  'clash_view exposes gif Side B media kind'
);
select is(
  (select public.clash_view((select id from public.clashes where take_id = 'cg-take' limit 1)) ->> 'sideBText'),
  'literally this',
  'clash_view keeps gif comment text'
);

-- text-only still works
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select lives_ok($$ select public.create_comment('cg-take', 'text still fine') $$, 'text-only still works');
reset role;

select * from finish();
rollback;

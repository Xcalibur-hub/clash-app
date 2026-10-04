-- ============================================================================
-- Phase 15.0 — storefront intentional previewMedia (never private paths)
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000601'),
  ('00000000-0000-0000-0000-000000000602');

update public.profiles set id = 's15-creator', handle = 's15_creator', name = 'S15 Creator', role = 'creator'
 where auth_user_id = '00000000-0000-0000-0000-000000000601';
update public.profiles set id = 's15-fan', handle = 's15_fan', name = 'S15 Fan', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000602';

insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, status, visibility) values
  ('m15-pub',  's15-creator', 'public-media',  's15-creator/m15-pub/m15-pub.png',   'image', 'image/png', 'ready', 'public'),
  ('m15-priv', 's15-creator', 'private-media', 's15-creator/m15-priv/m15-priv.png', 'image', 'image/png', 'ready', 'private'),
  ('m15-prev', 's15-creator', 'public-media',  's15-creator/m15-prev/m15-prev.png', 'image', 'image/png', 'ready', 'public');

insert into public.creator_vaults (id, creator_id, title, description, status)
values ('s15-vault', 's15-creator', 'S15 World', '', 'active');

insert into public.vault_drops
  (id, vault_id, creator_id, caption, media_object_id, access_level, status, published_at, expires_at)
values
  ('s15-free', 's15-vault', 's15-creator', 'Free 15', 'm15-pub', 'free', 'published',
   now(), now() + interval '7 days');

insert into public.vault_drops
  (id, vault_id, creator_id, caption, media_object_id, access_level, status,
   published_at, expires_at, public_preview_media_object_id)
values
  ('s15-sub', 's15-vault', 's15-creator', 'Sub preview 15', 'm15-priv', 'subscriber', 'published',
   now(), now() + interval '7 days', 'm15-prev');

-- Stranger: free media public; subscriber shows previewMedia only — never private path.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000602","role":"authenticated"}', true);

select is(
  (select jsonb_path_query_first(
     public.vault_storefront('s15-vault'),
     '$[*] ? (@.caption == "Free 15")'
   )->'publicMedia'->>'path'),
  's15-creator/m15-pub/m15-pub.png',
  'free drop exposes public media path'
);

select is(
  (select jsonb_path_query_first(
     public.vault_storefront('s15-vault'),
     '$[*] ? (@.caption == "Sub preview 15")'
   )->>'accessible'),
  'false',
  'non-subscriber cannot access subscriber drop'
);

select is(
  (select jsonb_path_query_first(
     public.vault_storefront('s15-vault'),
     '$[*] ? (@.caption == "Sub preview 15")'
   )->'publicMedia'),
  'null'::jsonb,
  'subscriber drop publicMedia stays null for non-subscriber'
);

select is(
  (select jsonb_path_query_first(
     public.vault_storefront('s15-vault'),
     '$[*] ? (@.caption == "Sub preview 15")'
   )->'previewMedia'->>'path'),
  's15-creator/m15-prev/m15-prev.png',
  'intentional public preview path is exposed'
);

select ok(
  (select jsonb_path_query_first(
     public.vault_storefront('s15-vault'),
     '$[*] ? (@.caption == "Sub preview 15")'
   )::text) not like '%m15-priv%',
  'private storage path never appears in storefront JSON'
);

select is(
  (select public.vault_drop_card('s15-sub')->'previewMedia'->>'bucket'),
  'public-media',
  'drop card previewMedia uses public bucket only'
);

reset role;
select * from finish();
rollback;

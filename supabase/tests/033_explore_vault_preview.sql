-- ============================================================================
-- Explore Vault PREVIEW security (pgTAP)
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

select has_function('public', 'explore_vault_preview_rows', 'vault preview row builder exists');
select has_column('public', 'vault_drops', 'public_preview_media_object_id', 'preview media column exists');

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000e101'),
  ('00000000-0000-0000-0000-00000000e102');

update public.profiles set id = 'ex-p1', handle = 'ex_p1', name = 'Preview Creator',
       public_country_code = 'KR', reputation = 12
 where auth_user_id = '00000000-0000-0000-0000-00000000e101';
update public.profiles set id = 'ex-p2', handle = 'ex_p2', name = 'Preview Viewer',
       public_country_code = 'KR', reputation = 3
 where auth_user_id = '00000000-0000-0000-0000-00000000e102';

insert into public.creator_vaults (id, creator_id, title, status)
values ('ev_prev_1', 'ex-p1', 'Preview Vault', 'active')
on conflict do nothing;

insert into public.media_objects
  (id, owner_id, bucket, storage_path, media_kind, mime_type, visibility, status)
values
  ('ex-free-m', 'ex-p1', 'public-media', 'explore/free2.jpg', 'image', 'image/jpeg', 'public', 'ready'),
  ('ex-sub-m', 'ex-p1', 'private-media', 'explore/sub2.jpg', 'image', 'image/jpeg', 'private', 'ready'),
  ('ex-teaser-m', 'ex-p1', 'public-media', 'explore/teaser.jpg', 'image', 'image/jpeg', 'public', 'ready')
on conflict (id) do nothing;

insert into public.vault_drops
  (id, vault_id, creator_id, caption, media_object_id, access_level, status, published_at, expires_at)
values
  ('ex-free-2', 'ev_prev_1', 'ex-p1', 'Free again', 'ex-free-m', 'free', 'published',
   now(), now() + interval '7 days')
on conflict (id) do nothing;

-- Subscriber drop WITHOUT preview must never appear.
insert into public.vault_drops
  (id, vault_id, creator_id, caption, media_object_id, access_level, status, published_at, expires_at)
values
  ('ex-sub-noprev', 'ev_prev_1', 'ex-p1', 'Sub no preview', 'ex-sub-m', 'subscriber', 'published',
   now(), now() + interval '7 days')
on conflict (id) do nothing;

-- Subscriber drop WITH intentional public teaser.
insert into public.vault_drops
  (id, vault_id, creator_id, caption, media_object_id, access_level, status,
   published_at, expires_at, public_preview_media_object_id)
values
  ('ex-sub-preview', 'ev_prev_1', 'ex-p1', 'Sub with teaser', 'ex-sub-m', 'subscriber', 'published',
   now(), now() + interval '7 days', 'ex-teaser-m')
on conflict (id) do nothing;

select ok(
  (public.list_explore_vault_previews(20)::text) like '%ex-free-2%',
  'free drop remains discoverable'
);

select ok(
  (public.list_explore_vault_previews(20)::text) like '%ex-sub-preview%',
  'subscriber drop with public teaser is discoverable as preview'
);

select ok(
  (public.list_explore_vault_previews(20)::text) not like '%ex-sub-noprev%',
  'subscriber drop without teaser excluded'
);

select ok(
  (public.list_explore_vault_previews(20)::text) not like '%explore/sub2.jpg%',
  'private subscriber storage path never returned'
);

select ok(
  (public.list_explore_vault_previews(20)::text) like '%explore/teaser.jpg%',
  'preview returns the intentional public teaser path only'
);

select ok(
  (public.get_explore_country('KR') -> 'vaultPreviews')::text like '%ex-sub-preview%',
  'country page surfaces preview teasers'
);

select ok(
  (public.get_explore_country('KR') -> 'vaultPreviews')::text not like '%explore/sub2.jpg%',
  'country page never exposes private media paths'
);

select * from finish();
rollback;

-- ============================================================================
-- Phase 15.1B — Vault Discover Creator Worlds (pgTAP)
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

select has_function('public', 'list_vault_discover_worlds', 'discover worlds exists');
select has_function('public', 'list_vault_discover_offers', 'discover offers exists');
select has_function('public', 'vault_world_has_public_surface', 'public surface helper exists');

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000d401'),
  ('00000000-0000-0000-0000-00000000d402'),
  ('00000000-0000-0000-0000-00000000d403'),
  ('00000000-0000-0000-0000-00000000d404');

update public.profiles set id = 'vd-maya', handle = 'vd_maya', name = 'VD Maya', role = 'creator'
 where auth_user_id = '00000000-0000-0000-0000-00000000d401';
update public.profiles set id = 'vd-leo', handle = 'vd_leo', name = 'VD Leo', role = 'creator'
 where auth_user_id = '00000000-0000-0000-0000-00000000d402';
update public.profiles set id = 'vd-fan', handle = 'vd_fan', name = 'VD Fan', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-00000000d403';
update public.profiles set id = 'vd-blocked', handle = 'vd_blocked', name = 'VD Blocked', role = 'creator'
 where auth_user_id = '00000000-0000-0000-0000-00000000d404';

insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, status, visibility) values
  ('vd-maya-free', 'vd-maya', 'public-media', 'vd/maya-free.png', 'image', 'image/png', 'ready', 'public'),
  ('vd-maya-sub', 'vd-maya', 'private-media', 'vd/maya-sub.png', 'image', 'image/png', 'ready', 'private'),
  ('vd-maya-teaser', 'vd-maya', 'public-media', 'vd/maya-teaser.png', 'image', 'image/png', 'ready', 'public'),
  ('vd-maya-cover', 'vd-maya', 'public-media', 'vd/maya-cover.png', 'image', 'image/png', 'ready', 'public'),
  ('vd-leo-free', 'vd-leo', 'public-media', 'vd/leo-free.png', 'image', 'image/png', 'ready', 'public'),
  ('vd-blocked-free', 'vd-blocked', 'public-media', 'vd/blocked-free.png', 'image', 'image/png', 'ready', 'public');

insert into public.creator_vaults (id, creator_id, title, status) values
  ('vd-maya-vault', 'vd-maya', 'Maya World', 'active'),
  ('vd-leo-vault', 'vd-leo', 'Leo World', 'active'),
  ('vd-blocked-vault', 'vd-blocked', 'Blocked World', 'active');

insert into public.vault_drops
  (id, vault_id, creator_id, caption, media_object_id, access_level, status,
   published_at, expires_at, public_preview_media_object_id)
values
  ('vd-maya-free', 'vd-maya-vault', 'vd-maya', 'Midnight free', 'vd-maya-free', 'free', 'published',
   now(), now() + interval '7 days', null),
  ('vd-maya-preview', 'vd-maya-vault', 'vd-maya', 'Sub preview', 'vd-maya-sub', 'subscriber', 'published',
   now(), now() + interval '7 days', 'vd-maya-teaser'),
  ('vd-maya-noprev', 'vd-maya-vault', 'vd-maya', 'Sub locked', 'vd-maya-sub', 'subscriber', 'published',
   now(), now() + interval '7 days', null),
  ('vd-maya-expired', 'vd-maya-vault', 'vd-maya', 'Expired', 'vd-maya-free', 'free', 'published',
   now() - interval '10 days', now() - interval '3 days', null),
  ('vd-leo-free', 'vd-leo-vault', 'vd-leo', 'Tokyo night', 'vd-leo-free', 'free', 'published',
   now(), now() + interval '7 days', null),
  ('vd-blocked-free', 'vd-blocked-vault', 'vd-blocked', 'Hidden', 'vd-blocked-free', 'free', 'published',
   now(), now() + interval '7 days', null);

insert into public.vault_drops
  (id, vault_id, creator_id, caption, media_object_id, access_level, status)
values
  ('vd-maya-draft', 'vd-maya-vault', 'vd-maya', 'Draft drop', 'vd-maya-free', 'free', 'draft');

insert into public.creator_services
  (id, creator_id, title, description, category, cover_media_object_id, access_type, status)
values
  ('vd-maya-svc', 'vd-maya', 'Horror Review', 'Notes', 'consultation', 'vd-maya-cover', 'contact', 'published'),
  ('vd-maya-svc-draft', 'vd-maya', 'Draft Service', 'No', 'other', null, 'contact', 'draft');

insert into public.creator_courses
  (id, creator_id, title, description, cover_media_object_id, access_type, status)
values
  ('vd-maya-course', 'vd-maya', 'Filmmaking at Night', 'Series', 'vd-maya-cover', 'free', 'published'),
  ('vd-maya-course-draft', 'vd-maya', 'Draft Course', 'No', null, 'free', 'draft');

insert into public.course_lessons
  (id, course_id, title, description, position, content_type, body_text, access_type, status, media_object_id)
values
  ('vd-maya-l1', 'vd-maya-course', 'Intro', 'Start', 1, 'text', 'Hello', 'free', 'published', null),
  ('vd-maya-l-sub', 'vd-maya-course', 'Private', 'Members', 2, 'video', '', 'subscriber', 'published', 'vd-maya-sub');

insert into public.creator_products
  (id, creator_id, title, description, product_type, cover_media_object_id,
   price_amount_minor, currency, access_type, inventory_mode, status)
values
  ('vd-maya-prod', 'vd-maya', 'Night LUT Pack', 'LUTs', 'digital', 'vd-maya-cover',
   1000, 'INR', 'paid', 'unlimited', 'published'),
  ('vd-maya-prod-draft', 'vd-maya', 'Draft Pack', 'No', 'digital', null,
   100, 'INR', 'paid', 'unlimited', 'draft');

-- Fan with ZERO follows must still discover worlds
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d403","role":"authenticated"}', true);

select ok(
  (public.list_vault_discover_worlds(20)::text) like '%vd-maya%',
  'Discover returns published Creator Worlds with zero follows'
);

select ok(
  (public.list_vault_discover_worlds(20)::text) like '%vd-leo%',
  'Discover contains multiple Creator Worlds'
);

select ok(
  (public.list_vault_discover_worlds(20)::text) not like '%vd-maya-draft%',
  'draft drops are not discover world payloads'
);

select ok(
  (public.list_explore_vault_previews(20)::text) not like '%vd-maya-draft%',
  'draft drops excluded from drop previews'
);

select ok(
  (public.list_explore_vault_previews(20)::text) not like '%vd-maya-expired%',
  'expired drops excluded from drop previews'
);

select ok(
  (public.list_explore_vault_previews(20)::text) like '%vd-maya-preview%',
  'intentional previews allowed'
);

select ok(
  (public.list_explore_vault_previews(20)::text) not like '%vd/maya-sub.png%',
  'subscriber private media path never returned'
);

select ok(
  (public.list_explore_vault_previews(20)::text) like '%vd/maya-teaser.png%',
  'preview returns public teaser path only'
);

select ok(
  (public.list_vault_discover_offers('service', 10)::text) like '%vd-maya-svc%',
  'published services feed Discover'
);

select ok(
  (public.list_vault_discover_offers('service', 10)::text) not like '%vd-maya-svc-draft%',
  'draft services excluded'
);

select ok(
  (public.list_vault_discover_offers('course', 10)::text) like '%vd-maya-course%',
  'published courses feed Discover'
);

select ok(
  (public.list_vault_discover_offers('course', 10)::text) not like '%vd-maya-course-draft%',
  'draft courses excluded'
);

select ok(
  (public.list_vault_discover_offers('product', 10)::text) like '%vd-maya-prod%',
  'published products feed Discover'
);

select ok(
  (public.list_vault_discover_offers('product', 10)::text) not like '%vd-maya-prod-draft%',
  'draft products excluded'
);

select ok(
  (public.list_vault_discover_offers('course', 10)::text) not like '%vd/maya-sub.png%',
  'subscriber lesson private media never appears in Discover offers'
);

-- Blocked creator excluded for fan
reset role;
select set_config('request.jwt.claims', null, true);
insert into public.blocks (blocker_id, blocked_id) values ('vd-fan', 'vd-blocked');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d403","role":"authenticated"}', true);

select ok(
  (public.list_vault_discover_worlds(20)::text) not like '%vd-blocked%',
  'blocked creators excluded from Discover worlds'
);

select ok(
  (public.list_explore_vault_previews(20)::text) not like '%vd-blocked-free%',
  'blocked creators excluded from drop previews'
);

-- Followed creator still appears (relationship does not gate Discover)
select ok(
  (select count(*) > 0 from jsonb_array_elements(public.list_vault_discover_worlds(20)) e
    where e->>'creatorId' = 'vd-maya'),
  'Creator World module signals present for Maya'
);

select * from finish();
rollback;

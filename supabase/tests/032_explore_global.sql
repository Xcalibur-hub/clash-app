-- ============================================================================
-- Explore global discovery (pgTAP)
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

select has_function('public', 'get_explore_world_summary', 'world summary exists');
select has_function('public', 'get_explore_country', 'country page exists');
select has_function('public', 'get_global_viral', 'global viral exists');
select has_function('public', 'get_teleport_candidate', 'teleport exists');
select has_function('public', 'search_explore', 'search exists');
select has_function('public', 'list_explore_vault_previews', 'vault previews exists');

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000e001'),
  ('00000000-0000-0000-0000-00000000e002'),
  ('00000000-0000-0000-0000-00000000e003'),
  ('00000000-0000-0000-0000-00000000e004');

update public.profiles set id = 'ex-a', handle = 'ex_a', name = 'Explore A',
       public_country_code = 'IN', reputation = 10
 where auth_user_id = '00000000-0000-0000-0000-00000000e001';
update public.profiles set id = 'ex-b', handle = 'ex_b', name = 'Explore B',
       public_country_code = 'IN', reputation = 8
 where auth_user_id = '00000000-0000-0000-0000-00000000e002';
update public.profiles set id = 'ex-c', handle = 'ex_c', name = 'Explore C',
       public_country_code = 'IN', reputation = 6
 where auth_user_id = '00000000-0000-0000-0000-00000000e003';
update public.profiles set id = 'ex-d', handle = 'ex_d', name = 'Explore D',
       public_country_code = 'JP', reputation = 4
 where auth_user_id = '00000000-0000-0000-0000-00000000e004';

-- Privacy floor: IN has 3 → visible; JP has 1 → suppressed in summary counts.
select ok(
  (public.get_explore_world_summary() -> 'countries') @> '[{"countryCode":"IN"}]'::jsonb,
  'India appears when activity >= 3'
);

select ok(
  not (public.get_explore_world_summary() -> 'countries') @> '[{"countryCode":"JP"}]'::jsonb,
  'Japan omitted below privacy floor'
);

select is(
  (public.get_explore_country('IN') ->> 'activityCount')::integer,
  3,
  'country page returns activity when above floor'
);

select ok(
  public.get_explore_country('JP') ->> 'activityCount' is null,
  'country page suppresses activity below floor'
);

-- Challenge + treasure foundations
insert into public.explore_challenges
  (id, title, description, challenge_type, country_code, starts_at, ends_at, status, visibility)
values
  ('ec_in_1', 'Best street-food photo in India', 'snap it', 'COUNTRY', 'IN',
   now() - interval '1 hour', now() + interval '2 days', 'active', 'public');

insert into public.explore_treasure_hunts
  (id, title, description, country_code, starts_at, ends_at, status, clue,
   reward_type, gifts_remaining, visibility)
values
  ('th_in_1', 'India clue trail', 'digital hunt', 'IN',
   now() - interval '1 hour', now() + interval '1 day', 'active',
   'A clue is hidden across today''s public posts.', 'badge', 2, 'public');

select ok(
  (public.get_explore_country('IN') -> 'challenges') @> '[{"id":"ec_in_1"}]'::jsonb,
  'country challenges surface'
);

select ok(
  (public.get_explore_country('IN') -> 'treasures') @> '[{"id":"th_in_1"}]'::jsonb,
  'country treasures surface'
);

-- Reward authority: clients cannot write treasure progress
select is(
  has_table_privilege('authenticated', 'public.explore_treasure_progress', 'INSERT'),
  false,
  'clients cannot insert treasure progress'
);
select is(
  has_table_privilege('authenticated', 'public.explore_treasure_progress', 'UPDATE'),
  false,
  'clients cannot update treasure progress'
);

-- Vault security: subscriber-only must never appear in explore previews
insert into public.creator_vaults (id, creator_id, title, status)
values ('ev_1', 'ex-a', 'Explore Vault', 'active')
on conflict do nothing;

-- If creator_vaults insert shape differs, skip via exception guard.
-- Use existing media objects from seed if present; otherwise create public/private pair.
insert into public.media_objects
  (id, owner_id, bucket, storage_path, media_kind, mime_type, visibility, status)
values
  ('ex-pub-media', 'ex-a', 'public-media', 'explore/free.jpg', 'image', 'image/jpeg', 'public', 'ready'),
  ('ex-priv-media', 'ex-a', 'private-media', 'explore/sub.jpg', 'image', 'image/jpeg', 'private', 'ready')
on conflict (id) do nothing;

insert into public.vault_drops
  (id, vault_id, creator_id, caption, media_object_id, access_level, status, published_at, expires_at)
values
  ('ex-free-drop', 'ev_1', 'ex-a', 'Free explore drop', 'ex-pub-media', 'free', 'published',
   now(), now() + interval '7 days'),
  ('ex-sub-drop', 'ev_1', 'ex-a', 'Subscriber only drop', 'ex-priv-media', 'subscriber', 'published',
   now(), now() + interval '7 days')
on conflict (id) do nothing;

select ok(
  (public.list_explore_vault_previews(20)::text) like '%ex-free-drop%',
  'free vault preview is listable'
);

select ok(
  (public.list_explore_vault_previews(20)::text) not like '%ex-sub-drop%',
  'subscriber-only vault drop excluded from explore'
);

select ok(
  (public.get_explore_country('IN') -> 'vaultPreviews')::text not like '%ex-sub-drop%',
  'country page never returns subscriber vault media'
);

-- Teleport returns a candidate shape
select ok(
  public.get_teleport_candidate('{}'::text[]) ? 'candidate',
  'teleport returns candidate envelope'
);

-- Search countries
select ok(
  (public.search_explore('indi', 10) -> 'countries') @> '[{"countryCode":"IN"}]'::jsonb,
  'search finds India'
);

-- Block filtering: A blocks B → B hidden from A's country creators
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000e001', 'role', 'authenticated')::text,
  true
);
insert into public.blocks (blocker_id, blocked_id) values ('ex-a', 'ex-b')
on conflict do nothing;

select ok(
  (public.get_explore_country('IN') -> 'creators')::text not like '%ex-b%',
  'blocked creator excluded for viewer'
);

select * from finish();
rollback;

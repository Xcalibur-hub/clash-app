-- ============================================================================
-- World Drop detail read (pgTAP) — additive RPC from Phase 5 Step 2.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000811'),
  ('00000000-0000-0000-0000-000000000812');

update public.profiles
   set id = 'wdv-a', handle = 'wdv_a', name = 'WDV A', role = 'viewer',
       reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000811';
update public.profiles
   set id = 'wdv-b', handle = 'wdv_b', name = 'WDV B', role = 'viewer',
       reputation = 0, coins = 0, streak = 0
 where auth_user_id = '00000000-0000-0000-0000-000000000812';

insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, visibility, status)
values ('mw-wdv-a', 'wdv-a', 'public-media', 'wdv-a/mw-wdv-a/a.png', 'image', 'image/png', 'public', 'ready');

insert into public.world_missions (id, title, description, prompt, status, starts_at, ends_at)
values (
  'wm_wdv', 'WDV Mission', '', 'Capture.', 'ACTIVE',
  now() - interval '1 hour', now() + interval '2 days'
);

select has_function('public', 'world_drop_view', 'world_drop_view exists');
select is(has_function_privilege('anon', 'public.world_drop_view(text)', 'EXECUTE'), true, 'anon may read drop view');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000811","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_world_drop('wm_wdv', 'mw-wdv-a', 'lane light', 15.4987, 73.8278) $$,
  'publish for detail view'
);
reset role;

select ok(
  public.world_drop_view((select id from public.world_drops where author_id = 'wdv-a' and mission_id = 'wm_wdv')) is not null,
  'published drop is readable by id'
);
select is(
  public.world_drop_view((select id from public.world_drops where author_id = 'wdv-a' and mission_id = 'wm_wdv')) ? 'approxLat',
  true,
  'detail exposes approx lat'
);
select is(
  public.world_drop_view((select id from public.world_drops where author_id = 'wdv-a' and mission_id = 'wm_wdv')) ? 'meters',
  false,
  'detail does not expose metres'
);

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000812","role":"authenticated"}', true);
select lives_ok($$ select public.block_profile('wdv-a') $$, 'b blocks a');
select is(
  public.world_drop_view((select id from public.world_drops where author_id = 'wdv-a' and mission_id = 'wm_wdv')),
  null,
  'blocked author drop view is null'
);
reset role;

select is(public.world_drop_view('missing-drop'), null, 'missing drop returns null');

select finish();
rollback;

-- ============================================================================
-- Phase 15.2 — Creator Communities (pgTAP). Run: supabase test db
-- Covers: membership/eligibility gating (public / followers / subscribers /
-- expired entitlement), server-side identity, pseudonym projection, announcement
-- authority, cross-community + cross-creator denial, blocks, reporting,
-- hiding/deletion, and rate limiting.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

select has_function('public', 'vault_community_viewer_can_access', 'access predicate exists');
select has_function('public', 'vault_community_alias', 'alias builder exists');
select has_function('public', 'enter_vault_community', 'enter RPC exists');
select has_function('public', 'create_vault_community_post', 'post RPC exists');
select has_function('public', 'create_vault_community_reply', 'reply RPC exists');
select has_function('public', 'list_vault_community_posts', 'feed RPC exists');

-- Privileges: guests have no community surface at all.
select is(has_function_privilege('anon', 'public.enter_vault_community(text)', 'EXECUTE'), false, 'anon cannot enter a community');
select is(has_function_privilege('anon', 'public.vault_community_summary(text)', 'EXECUTE'), false, 'anon cannot read a summary');
select is(has_table_privilege('anon', 'public.vault_communities', 'SELECT'), false, 'anon cannot select communities');
select is(has_function_privilege('authenticated', 'public.create_vault_community_post(text,public.vault_community_post_type,text,text,boolean)', 'EXECUTE'), true, 'authenticated may post');

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000c101'),
  ('00000000-0000-0000-0000-00000000c102'),
  ('00000000-0000-0000-0000-00000000c103'),
  ('00000000-0000-0000-0000-00000000c104'),
  ('00000000-0000-0000-0000-00000000c105'),
  ('00000000-0000-0000-0000-00000000c106'),
  ('00000000-0000-0000-0000-00000000c107');

update public.profiles set id = 'cc-maya',   handle = 'cc_maya',   name = 'CC Maya',   role = 'creator' where auth_user_id = '00000000-0000-0000-0000-00000000c101';
update public.profiles set id = 'cc-leo',    handle = 'cc_leo',    name = 'CC Leo',    role = 'creator' where auth_user_id = '00000000-0000-0000-0000-00000000c102';
update public.profiles set id = 'cc-aria',   handle = 'cc_aria',   name = 'CC Aria',   role = 'creator' where auth_user_id = '00000000-0000-0000-0000-00000000c103';
update public.profiles set id = 'cc-blocked', handle = 'cc_blocked', name = 'CC Blocked', role = 'creator' where auth_user_id = '00000000-0000-0000-0000-00000000c104';
update public.profiles set id = 'cc-fan',    handle = 'cc_fan',    name = 'CC Fan',    role = 'viewer'  where auth_user_id = '00000000-0000-0000-0000-00000000c105';
update public.profiles set id = 'cc-rate',   handle = 'cc_rate',   name = 'CC Rate',   role = 'viewer'  where auth_user_id = '00000000-0000-0000-0000-00000000c106';
update public.profiles set id = 'cc-expired', handle = 'cc_expired', name = 'CC Expired', role = 'viewer' where auth_user_id = '00000000-0000-0000-0000-00000000c107';

insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, status, visibility) values
  ('cc-maya-pub', 'cc-maya', 'public-media', 'cc/maya.png', 'image', 'image/png', 'ready', 'public'),
  ('cc-leo-priv', 'cc-leo', 'private-media', 'cc/leo.png', 'image', 'image/png', 'ready', 'private');

insert into public.creator_vaults (id, creator_id, title, status) values
  ('cc-maya-vault', 'cc-maya', 'CC Maya World', 'active'),
  ('cc-leo-vault', 'cc-leo', 'CC Leo World', 'active'),
  ('cc-aria-vault', 'cc-aria', 'CC Aria World', 'active'),
  ('cc-blocked-vault', 'cc-blocked', 'CC Blocked World', 'active');

insert into public.vault_communities
  (id, creator_id, vault_id, name, access_type, status, pseudonymous_enabled) values
  ('cc-cmt-sub', 'cc-maya', 'cc-maya-vault', 'Maya Subscribers', 'subscribers', 'active', true),
  ('cc-cmt-pub', 'cc-leo', 'cc-leo-vault', 'Leo Public', 'public', 'active', false),
  ('cc-cmt-fol', 'cc-aria', 'cc-aria-vault', 'Aria Followers', 'followers', 'active', false),
  ('cc-cmt-blocked', 'cc-blocked', 'cc-blocked-vault', 'Blocked Room', 'public', 'active', false);

-- Fan follows Aria and subscribes to Maya; the blocked creator blocks the fan.
insert into public.follows (follower_id, following_id) values ('cc-fan', 'cc-aria');
select public.vault_grant_test_subscription('cc-maya-vault', 'cc-fan', 30);
insert into public.blocks (blocker_id, blocked_id) values ('cc-blocked', 'cc-fan');

-- An entitlement that already lapsed (period end in the past) — must be denied.
insert into public.vault_subscriptions
  (id, subscriber_id, vault_id, status, started_at, current_period_end)
values
  ('cc-exp-sub', 'cc-expired', 'cc-maya-vault', 'active',
   now() - interval '40 days', now() - interval '10 days');

-- A fixed post id for the cross-creator moderation test (readable by its own
-- community, invisible to another creator through RLS).
insert into public.vault_community_posts
  (id, community_id, author_profile_id, post_type, body)
values
  ('cc-mod-post', 'cc-cmt-sub', 'cc-maya', 'discussion', 'Moderation target');

-- ── Access predicate ────────────────────────────────────────────────────────
select is(public.vault_community_viewer_can_access_internal('cc-maya', 'cc-cmt-sub'), true, 'a creator always reaches their own community');
select is(public.vault_community_viewer_can_access_internal('cc-fan', 'cc-cmt-pub'), true, 'any signed-in user reaches a public community');
select is(public.vault_community_viewer_can_access_internal(null, 'cc-cmt-pub'), false, 'a guest reaches nothing');
select is(public.vault_community_viewer_can_access_internal('cc-fan', 'cc-cmt-sub'), true, 'an active subscriber reaches a subscriber community');
select is(public.vault_community_viewer_can_access_internal('cc-rate', 'cc-cmt-sub'), false, 'a non-subscriber cannot reach a subscriber community');
select is(public.vault_community_viewer_can_access_internal('cc-fan', 'cc-cmt-fol'), true, 'a follower reaches a follower community');
select is(public.vault_community_viewer_can_access_internal('cc-rate', 'cc-cmt-fol'), false, 'a non-follower cannot reach a follower community');
select is(public.vault_community_viewer_can_access_internal('cc-fan', 'cc-cmt-blocked'), false, 'a blocked pair is never permitted');

-- ── Expired entitlement denies access ───────────────────────────────────────
select is(public.vault_community_viewer_can_access_internal('cc-expired', 'cc-cmt-sub'), false, 'a lapsed subscription is denied');

-- ── Writes as the fan (subscriber + follower) ───────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c105","role":"authenticated"}', true);

select throws_ok(
  $$ select public.create_vault_community_post('cc-cmt-sub','discussion','with media','cc-maya-pub',false) $$,
  'P0003', null, 'a post cannot attach media the author does not own'
);
select lives_ok(
  $$ select public.create_vault_community_post('cc-cmt-sub','discussion','Fan discussion',null,false) $$,
  'an eligible member can start a discussion'
);
select throws_ok(
  $$ select public.create_vault_community_post('cc-cmt-sub','announcement','Sneaky',null,false) $$,
  'P0001', null, 'a member cannot create an announcement'
);
select lives_ok(
  $$ select public.create_vault_community_post('cc-cmt-pub','discussion','Public hello',null,false) $$,
  'a public community accepts a signed-in post'
);
select is(
  (public.create_vault_community_post('cc-cmt-sub','discussion','Alias post',null,true))->>'authorId',
  null, 'a pseudonymous post exposes no profile id'
);
select is(
  (public.create_vault_community_post('cc-cmt-sub','discussion','Alias post 2',null,true))->>'authorName',
  public.vault_community_alias('cc-cmt-sub', 'cc-fan'),
  'a pseudonymous post renders the stable community alias'
);
select is((public.enter_vault_community('cc-cmt-pub'))->>'viewerAccess', 'true', 'entering records membership and access');

-- Replies: one level only.
select lives_ok(
  $$ select public.create_vault_community_reply(
       (select id from public.vault_community_posts where community_id='cc-cmt-sub' and body='Fan discussion'),
       'Top reply', null, false) $$,
  'a member can reply to a post'
);
select lives_ok(
  $$ select public.create_vault_community_reply(
       (select id from public.vault_community_posts where community_id='cc-cmt-sub' and body='Fan discussion'),
       'Second level',
       (select id from public.vault_community_replies where body='Top reply'),
       false) $$,
  'a member can reply once more'
);
select throws_ok(
  $$ select public.create_vault_community_reply(
       (select id from public.vault_community_posts where community_id='cc-cmt-sub' and body='Fan discussion'),
       'Third level',
       (select id from public.vault_community_replies where body='Second level'),
       false) $$,
  'P0003', null, 'replies stop at one level of nesting'
);

-- ── Cross-community denial (a user with no access cannot write) ─────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c106","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_vault_community_post('cc-cmt-fol','discussion','Nope',null,false) $$,
  'P0005', null, 'a non-follower cannot post into a follower community'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c105","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_vault_community_post('cc-cmt-blocked','discussion','Nope',null,false) $$,
  'P0005', null, 'a blocked pair cannot post'
);

-- ── Creator authority + cross-creator moderation denial ─────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c101","role":"authenticated"}', true);
select is(
  (public.create_vault_community_post('cc-cmt-sub','announcement','From Maya Friday',null,false))->>'type',
  'announcement', 'the creator can post an announcement'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c102","role":"authenticated"}', true);
select throws_ok(
  $$ select public.hide_vault_community_post('cc-mod-post', true) $$,
  'P0001', null, 'a creator cannot moderate another creator community'
);

-- ── Reporting + deletion + hiding ───────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c105","role":"authenticated"}', true);
select lives_ok(
  $$ select public.submit_report('community_post',
       (select id from public.vault_community_posts where community_id='cc-cmt-sub' and body='Fan discussion'),
       'other', 'from test') $$,
  'a member can report a community post'
);
select lives_ok(
  $$ select public.create_vault_community_post('cc-cmt-sub','discussion','Delete me',null,false) $$,
  'author can create a post to delete'
);
select lives_ok(
  $$ select public.delete_vault_community_post(
       (select id from public.vault_community_posts where community_id='cc-cmt-sub' and body='Delete me')) $$,
  'the author can delete their own post'
);
select is(
  (select status::text from public.vault_community_posts where body='Delete me'),
  'deleted', 'a deleted post is tombstoned'
);
select is(
  (public.list_vault_community_posts('cc-cmt-sub', 40, null, null)::text) like '%Delete me%',
  false, 'a deleted post leaves the feed'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c101","role":"authenticated"}', true);
select lives_ok(
  $$ select public.hide_vault_community_post(
       (select id from public.vault_community_posts where community_id='cc-cmt-sub' and body='Fan discussion'),
       true) $$,
  'the creator can hide a member post'
);
select is(
  (public.list_vault_community_posts('cc-cmt-sub', 40, null, null)::text) like '%Fan discussion%',
  false, 'a hidden post leaves the feed'
);

-- ── Rate limiting ───────────────────────────────────────────────────────────
reset role;
insert into public.rate_limit_events (actor_id, action)
select 'cc-rate', 'community_post' from generate_series(1, 20);
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c106","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_vault_community_post('cc-cmt-pub','discussion','Rate test',null,false) $$,
  'P0001', null, 'the post rate limit is enforced server-side'
);

select * from finish();
rollback;

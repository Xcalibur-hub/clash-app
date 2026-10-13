-- ============================================================================
-- Phase 11 Step 2A — comment / reply notification writers (pgTAP).
-- Self-contained; run: supabase test db (no reset required if schema applied).
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-0000000000c3');

update public.profiles set id = 'cn-alice', handle = 'cn_alice', name = 'Alice CN', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set id = 'cn-bob', handle = 'cn_bob', name = 'Bob CN', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-0000000000c2';
update public.profiles set id = 'cn-cara', handle = 'cn_cara', name = 'Cara CN', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-0000000000c3';

insert into public.takes (id, author_id, hood, text, created_at, expires_at, status)
values
  ('cn-take', 'cn-alice', 'techtakes', 'notif take', now(), now() + interval '12 hours', 'active'),
  ('cn-take-self', 'cn-bob', 'techtakes', 'bob owns', now(), now() + interval '12 hours', 'active'),
  ('cn-take-block', 'cn-alice', 'techtakes', 'blocked take', now(), now() + interval '12 hours', 'active');

-- Schema / privileges
select has_function('public', 'notify_arena_comment', 'notify_arena_comment exists');
select has_function('public', 'arena_comment_notify', 'arena_comment_notify exists');
select has_trigger('public', 'comments', 'comments_notify_arena', 'comments_notify_arena trigger exists');

select is(
  has_function_privilege('authenticated', 'public.arena_comment_notify(text, text, text, public.notification_kind, text)', 'EXECUTE'),
  false,
  'authenticated cannot call arena_comment_notify'
);
select is(
  has_table_privilege('authenticated', 'public.notifications', 'INSERT'),
  false,
  'authenticated cannot INSERT notifications'
);

-- 1. Comment on another user's Take → one `comment` notification
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
select lives_ok($$ select public.create_comment('cn-take', 'bob top level') $$, 'bob comments on alice take');
reset role;

select is(
  (select count(*)::int from public.notifications
    where recipient_id = 'cn-alice' and actor_id = 'cn-bob' and kind = 'comment'
      and entity_type = 'take' and entity_id = 'cn-take'),
  1,
  'take owner receives exactly one comment notification'
);
select is(
  (select count(*)::int from public.notifications
    where actor_id = 'cn-bob' and kind = 'comment' and entity_id = 'cn-take'),
  1,
  'no duplicate comment notifications for one action'
);

-- 2. Reply → parent author gets `reply`
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_comment(
       'cn-take',
       'cara nested',
       (select id from public.comments where text = 'bob top level' limit 1)
     ) $$,
  'cara replies to bob'
);
reset role;

select is(
  (select count(*)::int from public.notifications
    where recipient_id = 'cn-bob' and actor_id = 'cn-cara' and kind = 'reply'
      and entity_type = 'take' and entity_id = 'cn-take'),
  1,
  'parent author receives reply notification'
);

-- 5. Distinct eligible recipients: Take owner also gets `comment` when not the parent
select is(
  (select count(*)::int from public.notifications
    where recipient_id = 'cn-alice' and actor_id = 'cn-cara' and kind = 'comment'
      and entity_id = 'cn-take'),
  1,
  'distinct take owner also receives comment notification for nested reply'
);
select is(
  (select count(*)::int from public.notifications
    where actor_id = 'cn-cara' and entity_id = 'cn-take'),
  2,
  'nested reply yields two notifications max (parent reply + owner comment)'
);

-- 3. Self-comment creates no self-notification
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
select lives_ok($$ select public.create_comment('cn-take-self', 'bob on own take') $$, 'self top-level comment');
reset role;

select is(
  (select count(*)::int from public.notifications
    where recipient_id = 'cn-bob' and actor_id = 'cn-bob'),
  0,
  'no self-notification for commenting on own Take'
);

-- 4. Self-reply creates no self-notification
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_comment(
       'cn-take',
       'bob replies to self',
       (select id from public.comments where text = 'bob top level' limit 1)
     ) $$,
  'bob replies to own comment'
);
reset role;

select is(
  (select count(*)::int from public.notifications
    where recipient_id = 'cn-bob' and actor_id = 'cn-bob'),
  0,
  'no self-notification for replying to own comment'
);
-- Take owner still notified once for that nested action
select is(
  (select count(*)::int from public.notifications
    where recipient_id = 'cn-alice' and actor_id = 'cn-bob' and kind = 'comment'
      and entity_id = 'cn-take'
      and id = 'comment_' || (select id from public.comments where text = 'bob replies to self' limit 1)),
  1,
  'take owner still notified when replier answers their own rebuttal'
);

-- 6. Blocked interaction does not leak notifications
insert into public.blocks (blocker_id, blocked_id) values ('cn-alice', 'cn-cara');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_comment('cn-take-block', 'blocked attempt') $$,
  'P0005',
  null,
  'blocked user cannot comment on take'
);
reset role;

select is(
  (select count(*)::int from public.notifications
    where entity_id = 'cn-take-block'),
  0,
  'blocked failed comment leaves no notification'
);

-- 7. Failed comment creation does not leave a notification (empty text)
create temporary table cn_notif_before as
  select count(*)::int as n from public.notifications where actor_id = 'cn-bob';

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_comment('cn-take', '') $$,
  'P0003',
  null,
  'empty comment rejected'
);
reset role;

select is(
  (select count(*)::int from public.notifications where actor_id = 'cn-bob'),
  (select n from cn_notif_before),
  'rejected create_comment does not add notifications'
);

-- 8. Existing notification RLS
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.notifications (id, recipient_id, kind, entity_type, entity_id)
     values ('n-forge-cn', 'cn-alice', 'comment', 'take', 'cn-take') $$,
  '42501',
  null,
  'client cannot forge notifications'
);
select is_empty(
  $$ select * from public.notifications where recipient_id = 'cn-alice' $$,
  'bob cannot read alice notifications'
);
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select isnt_empty(
  $$ select * from public.notifications where recipient_id = 'cn-alice' and kind = 'comment' $$,
  'alice can read her own comment notifications'
);
reset role;

-- Existing create_comment still works (regression smoke)
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
select lives_ok($$ select public.create_comment('cn-take', 'still works after notifs') $$, 'create_comment unchanged');
reset role;

select finish();
rollback;

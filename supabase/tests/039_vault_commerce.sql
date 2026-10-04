-- ============================================================================
-- Phase 15.1 — Vault services / store / courses
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000701'),
  ('00000000-0000-0000-0000-000000000702'),
  ('00000000-0000-0000-0000-000000000703');

update public.profiles set id = 'c15-creator', handle = 'c15_creator', name = 'C15 Creator', role = 'creator'
 where auth_user_id = '00000000-0000-0000-0000-000000000701';
update public.profiles set id = 'c15-fan', handle = 'c15_fan', name = 'C15 Fan', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000702';
update public.profiles set id = 'c15-other', handle = 'c15_other', name = 'C15 Other', role = 'creator'
 where auth_user_id = '00000000-0000-0000-0000-000000000703';

insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, status, visibility) values
  ('c15-cover', 'c15-creator', 'public-media', 'c15-creator/cover.png', 'image', 'image/png', 'ready', 'public'),
  ('c15-priv', 'c15-creator', 'private-media', 'c15-creator/priv.mp4', 'video', 'video/mp4', 'ready', 'private');

insert into public.creator_vaults (id, creator_id, title, status)
values ('c15-vault', 'c15-creator', 'C15 World', 'active');

-- Creator creates offerings
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","role":"authenticated"}', true);

select lives_ok(
  $$ select public.create_creator_service('Portfolio Review', '30 min', 'consultation', 'online', 'contact') $$,
  'creator creates service'
);
select lives_ok(
  $$ select public.set_creator_service_status((select id from public.creator_services where creator_id = 'c15-creator' limit 1), 'published') $$,
  'creator publishes service'
);
select lives_ok(
  $$ select public.create_creator_product('Preset Pack', 'Looks', 'digital', 'free', 0, 'INR', 'c15-cover') $$,
  'creator creates product'
);
select lives_ok(
  $$ select public.set_creator_product_status((select id from public.creator_products where creator_id = 'c15-creator' limit 1), 'published') $$,
  'creator publishes product'
);
select lives_ok(
  $$ select public.create_creator_course('Filmmaking at Night', 'Series', 'free') $$,
  'creator creates course'
);
select lives_ok(
  $$ select public.create_course_lesson(
       (select id from public.creator_courses where creator_id = 'c15-creator' limit 1),
       'Introduction', 'Start here', 'text', 'Welcome', null, 'free', false
     ) $$,
  'creator adds free lesson'
);
select lives_ok(
  $$ select public.create_course_lesson(
       (select id from public.creator_courses where creator_id = 'c15-creator' limit 1),
       'Subscriber cut', 'Members', 'video', '', 'c15-priv', 'subscriber', false
     ) $$,
  'creator adds subscriber lesson'
);
select lives_ok(
  $$ select public.set_creator_course_status((select id from public.creator_courses where creator_id = 'c15-creator' limit 1), 'published') $$,
  'publish course'
);
select lives_ok(
  $$ select public.set_course_lesson_status((select id from public.course_lessons where title = 'Introduction'), 'published') $$,
  'publish free lesson'
);
select lives_ok(
  $$ select public.set_course_lesson_status((select id from public.course_lessons where title = 'Subscriber cut'), 'published') $$,
  'publish subscriber lesson'
);

-- Unsafe URL rejected
select throws_ok(
  $$ select public.create_creator_product('Bad', '', 'external', 'paid', 100, 'INR', null, 'javascript:alert(1)') $$,
  'P0005', null, 'unsafe external url rejected'
);

-- Other creator cannot edit
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000703","role":"authenticated"}', true);
select throws_ok(
  $$ select public.set_creator_service_status((select id from public.creator_services where creator_id = 'c15-creator' limit 1), 'archived') $$,
  'P0002', null, 'other creator cannot modify service'
);
select throws_ok(
  $$ select public.set_creator_product_status((select id from public.creator_products where creator_id = 'c15-creator' limit 1), 'archived') $$,
  'P0002', null, 'other creator cannot modify product'
);
select throws_ok(
  $$ select public.set_creator_course_status((select id from public.creator_courses where creator_id = 'c15-creator' limit 1), 'archived') $$,
  'P0002', null, 'other creator cannot modify course'
);

-- Fan visibility + request
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000702","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.creator_services where creator_id = 'c15-creator' and status = 'published'),
  1, 'published service visible to fan'
);
select lives_ok(
  $$ select public.request_creator_service(
       (select id from public.creator_services where creator_id = 'c15-creator' limit 1),
       'I would love a review'
     ) $$,
  'fan can request service'
);

-- Requester cannot accept
select throws_ok(
  $$ select public.set_service_request_status(
       (select id from public.vault_service_requests where requester_id = 'c15-fan' limit 1),
       'accepted'
     ) $$,
  'P0001', null, 'requester cannot accept'
);

-- Creator accepts
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","role":"authenticated"}', true);
select lives_ok(
  $$ select public.set_service_request_status(
       (select id from public.vault_service_requests where requester_id = 'c15-fan' limit 1),
       'accepted'
     ) $$,
  'creator can accept request'
);

-- Lesson access
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000702","role":"authenticated"}', true);
select is(
  public.can_access_course_lesson('c15-fan', (select id from public.course_lessons where title = 'Introduction')),
  true, 'free lesson accessible'
);
select is(
  public.can_access_course_lesson('c15-fan', (select id from public.course_lessons where title = 'Subscriber cut')),
  false, 'subscriber lesson locked without sub'
);
select is(
  (select public.course_lesson_card((select id from public.course_lessons where title = 'Subscriber cut'))->>'accessible'),
  'false', 'card reports locked'
);
select ok(
  (select public.course_lesson_media_target((select id from public.course_lessons where title = 'Subscriber cut')) is null),
  'no private media target when locked'
);

-- Progress only for accessible
select lives_ok(
  $$ select public.complete_course_lesson((select id from public.course_lessons where title = 'Introduction')) $$,
  'can complete accessible lesson'
);
select throws_ok(
  $$ select public.complete_course_lesson((select id from public.course_lessons where title = 'Subscriber cut')) $$,
  'P0005', null, 'cannot complete inaccessible lesson'
);

-- Draft hidden from fan
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_creator_service('Draft Only', '', 'other', 'online', 'contact') $$,
  'draft service created'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000702","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.creator_services where creator_id = 'c15-creator' and title = 'Draft Only'),
  0, 'draft service hidden from fan'
);

-- Blocked cannot request (capture id as owner before block hides the row via RLS)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","role":"authenticated"}', true);
select set_config('clash.svc_id', (select id from public.creator_services where creator_id = 'c15-creator' and status = 'published' limit 1), true);
reset role;
insert into public.blocks (blocker_id, blocked_id) values ('c15-creator', 'c15-fan');
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000702","role":"authenticated"}', true);
select throws_ok(
  $$ select public.request_creator_service(current_setting('clash.svc_id', true), 'blocked attempt') $$,
  'P0001', null, 'blocked user cannot request'
);

-- Request privacy: other creator cannot see fan request
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000703","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.vault_service_requests where requester_id = 'c15-fan'),
  0, 'other users cannot read service requests'
);

-- Lesson ordering
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","role":"authenticated"}', true);
select is(
  (select array_agg(title order by position) from public.course_lessons
    where course_id = (select id from public.creator_courses where creator_id = 'c15-creator' limit 1)),
  array['Introduction', 'Subscriber cut']::text[],
  'lesson ordering deterministic'
);

reset role;
select * from finish();
rollback;

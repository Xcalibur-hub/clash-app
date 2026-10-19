-- Step 4E regressions (pgTAP) — transaction-scoped
begin;
select no_plan();
set local search_path = public, extensions;
reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000d0001'),
  ('00000000-0000-0000-0000-0000000d0002'),
  ('00000000-0000-0000-0000-0000000d0003');

update public.profiles set id='e-author', handle='e_author', name='Author'
 where auth_user_id='00000000-0000-0000-0000-0000000d0001';
update public.profiles set id='e-challenger', handle='e_challenger', name='Challenger'
 where auth_user_id='00000000-0000-0000-0000-0000000d0002';
update public.profiles set id='e-fan', handle='e_fan', name='Fan'
 where auth_user_id='00000000-0000-0000-0000-0000000d0003';

insert into public.takes (id, author_id, hood, text, status) values
  ('e-active', 'e-author', 'techtakes', 'Active proposition', 'active'),
  ('e-removed', 'e-author', 'techtakes', 'Removed proposition', 'removed');

insert into public.arena_daily_topics
  (id, title, description, hood, status, opens_at, final_arguments_at, judging_at, closes_at)
values
  ('e-topic-live', 'Live topic', 'pgTAP', 'techtakes', 'live',
    now() - interval '1 hour', now() + interval '1 hour', now() + interval '2 hour', now() + interval '3 hour'),
  ('e-topic-sched', 'Scheduled topic', 'pgTAP', 'techtakes', 'scheduled',
    now() + interval '1 hour', now() + interval '2 hour', now() + interval '3 hour', now() + interval '4 hour');

insert into public.clashes (id, take_id, challenger_id, status, opens_at, closes_at) values
  ('e-removed-clash', 'e-removed', 'e-challenger', 'open', now() - interval '5 min', now() + interval '1 hour'),
  ('e-sched-clash', 'e-active', 'e-challenger', 'open', now() - interval '5 min', now() + interval '1 hour'),
  ('e-live-clash', 'e-active', 'e-challenger', 'open', now() - interval '5 min', now() + interval '1 hour');

insert into public.arena_rooms (id, topic_id, clash_id, status, capacity, participant_count, opens_at, closes_at) values
  ('e-sched-room', 'e-topic-sched', 'e-sched-clash', 'OPEN', 2, 2, now() - interval '5 min', now() + interval '1 hour');

-- 1. Removed Take cannot be followed
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000d0003')::text, true);
set role authenticated;
select throws_ok($$ select public.follow_clash('e-removed-clash') $$, '42501', null,
  'removed source Take cannot be followed');
reset role;

-- 2. Removed Take never notifies an existing follower
insert into public.clash_follows (clash_id, follower_id) values ('e-removed-clash','e-fan')
on conflict (clash_id, follower_id) do nothing;
insert into public.verdicts
  (clash_id, winner_side, side_a_score, side_b_score, jury_size, agreement, margin, verdict_label)
values ('e-removed-clash','A',1,0,1,1,1,'CLEAR DECISION');
select is((select count(*)::int from public.notifications
            where entity_id='e-removed-clash' and kind='clash_result'), 0,
  'removed Take produces no follower notification');

-- 3. Scheduled Room requires membership
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000d0003')::text, true);
set role authenticated;
select throws_ok($$ select public.follow_clash('e-sched-clash') $$, '42501', null,
  'non-member cannot follow a scheduled-topic Room Clash');
reset role;
insert into public.arena_room_participants (room_id, topic_id, profile_id, role)
values ('e-sched-room', 'e-topic-sched', 'e-fan', 'spectator');
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000d0003')::text, true);
set role authenticated;
select lives_ok($$ select public.follow_clash('e-sched-clash') $$,
  'Room member can follow a scheduled-topic Clash');
reset role;

-- 4. Expected-account guard closes the token-acquisition race
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000d0003')::text, true);
set role authenticated;
select throws_ok(
  $$ select public.follow_clash('e-live-clash', 'e-challenger') $$,
  '42501', null, 'RPC refuses when the token identity differs from the expected profile');
select lives_ok(
  $$ select public.follow_clash('e-live-clash', 'e-fan') $$,
  'RPC accepts the matching expected profile');
reset role;

-- 5. Followers can unfollow after settlement
update public.clashes set status='settled' where id='e-live-clash';
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000d0003')::text, true);
set role authenticated;
select lives_ok($$ select public.unfollow_clash('e-live-clash', 'e-fan') $$,
  'unfollow works after settlement');
select is(public.is_following_clash('e-live-clash'), false, 'relationship removed after settlement');
reset role;

-- 6. Existing fighter notification does not abort settlement
insert into public.notifications (id, recipient_id, actor_id, kind, entity_type, entity_id)
values ('e-preexisting','e-author', null, 'clash_result', 'clash', 'e-sched-clash');
insert into public.judgements (clash_id, juror_id, side) values ('e-sched-clash','e-fan','A');
update public.clashes set closes_at = now() - interval '1 minute' where id='e-sched-clash';
select lives_ok($$ select public.settle_clash('e-sched-clash') $$,
  'settlement is not aborted by a pre-existing fighter notification');
select is((select count(*)::int from public.notifications
            where recipient_id='e-author' and kind='clash_result' and entity_id='e-sched-clash'), 1,
  'fighter keeps exactly one result notification');

-- 7. Structural dedup index exists
select is((select count(*)::int from pg_indexes
            where schemaname='public' and indexname='notifications_clash_result_unique'), 1,
  'clash_result uniqueness index is installed');

select finish();
rollback;


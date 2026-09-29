-- ============================================================================
-- Social foundation security tests (pgTAP).
-- Run locally with:  npm run supabase:test   (supabase test db)
-- Permanent suite — extend here for later phases.
-- ============================================================================
begin;
select no_plan();

-- Reset to superuser for setup.
reset role;
select set_config('request.jwt.claims', null, true);

-- Create auth users; the profile trigger builds their profiles, then we pin
-- deterministic ids/handles/roles for the assertions below.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000009');

update public.profiles set id = 't-alice', handle = 'alice_t', name = 'Alice', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000001';
update public.profiles set id = 't-bob', handle = 'bob_t', name = 'Bob', role = 'viewer'
 where auth_user_id = '00000000-0000-0000-0000-000000000002';
update public.profiles set id = 't-mod', handle = 'mod_t', name = 'Mod', role = 'moderator'
 where auth_user_id = '00000000-0000-0000-0000-000000000009';

-- ── schema objects ──────────────────────────────────────────────────────────
select has_table('public', 'follows', 'follows table exists');
select has_table('public', 'blocks', 'blocks table exists');
select has_table('public', 'mutes', 'mutes table exists');
select has_table('public', 'reports', 'reports table exists');
select has_table('public', 'moderation_actions', 'moderation_actions table exists');
select has_table('public', 'notifications', 'notifications table exists');
select has_function('public', 'follow_profile', 'follow_profile exists');
select has_function('public', 'block_profile', 'block_profile exists');
select has_function('public', 'submit_report', 'submit_report exists');
select has_trigger('public', 'follows', 'follows_notify', 'follows_notify trigger exists');

-- ── privileges: new tables did NOT inherit blanket DML ──────────────────────
select is(has_table_privilege('authenticated', 'public.follows', 'INSERT'), false, 'authenticated cannot INSERT follows');
select is(has_table_privilege('authenticated', 'public.follows', 'UPDATE'), false, 'authenticated cannot UPDATE follows');
select is(has_table_privilege('authenticated', 'public.follows', 'DELETE'), false, 'authenticated cannot DELETE follows');
select is(has_table_privilege('authenticated', 'public.moderation_actions', 'INSERT'), false, 'authenticated cannot INSERT moderation_actions');
select is(has_table_privilege('authenticated', 'public.notifications', 'INSERT'), false, 'authenticated cannot INSERT notifications');
select is(has_table_privilege('anon', 'public.notifications', 'SELECT'), false, 'anon cannot read notifications');

-- ── follows ─────────────────────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok($$ select public.follow_profile('t-alice') $$, 'P0001', null, 'cannot follow self');
select throws_ok($$ insert into public.follows (follower_id, following_id) values ('t-bob', 't-alice') $$, '42501', null, 'cannot forge a follow for another user');
select lives_ok($$ select public.follow_profile('t-bob') $$, 'alice follows bob');
reset role;

-- ── blocks ──────────────────────────────────────────────────────────────────
-- bob follows alice, then alice blocks bob.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok($$ select public.follow_profile('t-alice') $$, 'bob follows alice');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select public.block_profile('t-bob') $$, 'alice blocks bob');
reset role;

select is_empty($$ select * from public.follows where follower_id in ('t-alice', 't-bob') $$, 'block dissolved follows both directions');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.follow_profile('t-alice') $$, 'P0003', null, 'blocked user cannot follow back');
reset role;

-- only the blocker can unblock
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok($$ select public.unblock_profile('t-alice') $$, 'blocked user unblock attempt is a no-op');
reset role;
select isnt_empty($$ select * from public.blocks where blocker_id = 't-alice' and blocked_id = 't-bob' $$, 'block persists: only the blocker can unblock');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select public.unblock_profile('t-bob') $$, 'blocker unblocks');
reset role;
select is_empty($$ select * from public.blocks where blocker_id = 't-alice' and blocked_id = 't-bob' $$, 'block removed by blocker');

-- ── mutes ───────────────────────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select public.mute_profile('t-bob') $$, 'alice mutes bob');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq($$ select muted_id from public.mutes where muter_id = 't-alice' $$, $$ values ('t-bob') $$, 'muter sees own mute');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is_empty($$ select * from public.mutes where muter_id = 't-alice' $$, 'mute is private to owner');
reset role;

-- ── reports ─────────────────────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select public.submit_report('profile', 't-bob', 'spam', null) $$, 'reporter can submit a report');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ update public.reports set status = 'resolved' $$, '42501', null, 'reporter cannot set status');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is_empty($$ select * from public.reports $$, 'other users cannot read reports');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000009","role":"authenticated"}', true);
select isnt_empty($$ select * from public.reports $$, 'staff can read reports');
reset role;

-- ── notifications ───────────────────────────────────────────────────────────
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select public.follow_profile('t-bob') $$, 'alice follows bob (notification)');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select isnt_empty($$ select * from public.notifications where recipient_id = 't-bob' $$, 'recipient reads own notification');
select lives_ok($$ update public.notifications set read_at = now() where recipient_id = 't-bob' $$, 'recipient marks own notification read');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is_empty($$ select * from public.notifications where recipient_id = 't-bob' $$, 'another user cannot read notifications');
select throws_ok($$ insert into public.notifications (id, recipient_id, kind) values ('n-forge', 't-alice', 'new_follower') $$, '42501', null, 'client cannot forge notifications');
reset role;

select * from finish();
rollback;

-- ============================================================================
-- Phase A.1 — Arena Crews behavioral coverage (pgTAP)
-- Proves membership, ownership, invites, requests, follows, counters, RLS.
-- Run: supabase test db
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

-- ── Privileges: clients cannot forge Crew state ─────────────────────────────
select is(has_table_privilege('authenticated', 'public.arena_crews', 'INSERT'),
  false, 'clients cannot insert crews');
select is(has_table_privilege('authenticated', 'public.arena_crews', 'UPDATE'),
  false, 'clients cannot update crews (reputation/counters)');
select is(has_table_privilege('authenticated', 'public.arena_crews', 'DELETE'),
  false, 'clients cannot delete crews');
select is(has_table_privilege('authenticated', 'public.arena_crew_memberships', 'INSERT'),
  false, 'clients cannot insert memberships');
select is(has_table_privilege('authenticated', 'public.arena_crew_memberships', 'UPDATE'),
  false, 'clients cannot modify membership roles');
select is(has_table_privilege('authenticated', 'public.arena_crew_follows', 'INSERT'),
  false, 'clients cannot insert follows directly');
select is(has_table_privilege('authenticated', 'public.arena_crew_invites', 'INSERT'),
  false, 'clients cannot insert invites');
select is(has_table_privilege('authenticated', 'public.arena_crew_join_requests', 'INSERT'),
  false, 'clients cannot forge join requests');
select is(has_table_privilege('authenticated', 'public.arena_crew_leave_cooldowns', 'INSERT'),
  false, 'clients cannot write cooldown ledger');
select is(has_table_privilege('authenticated', 'public.arena_crew_leave_cooldowns', 'UPDATE'),
  false, 'clients cannot alter cooldown ledger');
select is(has_function_privilege('authenticated',
  'public.arena_crew_notify(text,text,public.notification_kind,public.report_target,text)',
  'EXECUTE'), false, 'notify helper is server-only');

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000f101'),
  ('00000000-0000-0000-0000-00000000f102'),
  ('00000000-0000-0000-0000-00000000f103'),
  ('00000000-0000-0000-0000-00000000f104'),
  ('00000000-0000-0000-0000-00000000f105'),
  ('00000000-0000-0000-0000-00000000f106'),
  ('00000000-0000-0000-0000-00000000f107'),
  ('00000000-0000-0000-0000-00000000f108'),
  ('00000000-0000-0000-0000-00000000f109'),
  ('00000000-0000-0000-0000-00000000f110'),
  ('00000000-0000-0000-0000-00000000f111'),
  ('00000000-0000-0000-0000-00000000f112');

update public.profiles set id = 'ac-owner',  handle = 'ac_owner',  name = 'Crew Owner'
 where auth_user_id = '00000000-0000-0000-0000-00000000f101';
update public.profiles set id = 'ac-joiner', handle = 'ac_joiner', name = 'Crew Joiner'
 where auth_user_id = '00000000-0000-0000-0000-00000000f102';
update public.profiles set id = 'ac-member', handle = 'ac_member', name = 'Crew Member'
 where auth_user_id = '00000000-0000-0000-0000-00000000f103';
update public.profiles set id = 'ac-mod',    handle = 'ac_mod',    name = 'Crew Mod'
 where auth_user_id = '00000000-0000-0000-0000-00000000f104';
update public.profiles set id = 'ac-guest',  handle = 'ac_guest',  name = 'Crew Guest'
 where auth_user_id = '00000000-0000-0000-0000-00000000f105';
update public.profiles set id = 'ac-req',    handle = 'ac_req',    name = 'Crew Requester'
 where auth_user_id = '00000000-0000-0000-0000-00000000f106';
update public.profiles set id = 'ac-inv',    handle = 'ac_inv',    name = 'Crew Invitee'
 where auth_user_id = '00000000-0000-0000-0000-00000000f107';
update public.profiles set id = 'ac-block',  handle = 'ac_block',  name = 'Crew Blocked'
 where auth_user_id = '00000000-0000-0000-0000-00000000f108';
update public.profiles set id = 'ac-follow', handle = 'ac_follow', name = 'Crew Follower'
 where auth_user_id = '00000000-0000-0000-0000-00000000f109';
update public.profiles set id = 'ac-other',  handle = 'ac_other',  name = 'Crew Other'
 where auth_user_id = '00000000-0000-0000-0000-00000000f110';
update public.profiles set id = 'ac-req2',   handle = 'ac_req2',   name = 'Crew Req Two'
 where auth_user_id = '00000000-0000-0000-0000-00000000f111';
update public.profiles set id = 'ac-cool',   handle = 'ac_cool',   name = 'Crew Cool'
 where auth_user_id = '00000000-0000-0000-0000-00000000f112';

-- ── Membership: create → OWNER + active + member_count ──────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}', true);

select is(
  (public.create_arena_crew('Open Alpha', 'open-alpha', 'first crew', 'OPEN', array['Tech']))->>'name',
  'Open Alpha',
  'create_arena_crew returns payload'
);

select is(
  (select role::text from public.arena_crew_memberships
    where profile_id = 'ac-owner' and left_at is null),
  'OWNER',
  'creator is OWNER'
);
select ok(
  exists (
    select 1 from public.arena_crew_memberships
     where profile_id = 'ac-owner' and left_at is null
  ),
  'creator is an active member'
);
select is(
  (select member_count from public.arena_crews where slug = 'open-alpha'),
  1,
  'member_count is 1 after create'
);

select throws_ok(
  $$ select public.create_arena_crew('Second', 'second-crew', '', 'OPEN', '{}') $$,
  'P0003',
  'already in a crew',
  'user cannot have two active Crew memberships via create'
);

select throws_ok(
  $$ select public.create_arena_crew('Dup Slug', 'open-alpha', '', 'OPEN', '{}') $$,
  'P0003',
  'already in a crew',
  'already-in-crew checked before slug (owner still blocked)'
);

-- Separate owner for slug-taken path
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f110","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_arena_crew('Dup Slug', 'open-alpha', '', 'OPEN', '{}') $$,
  'P0007',
  'crew slug is taken',
  'slug taken rejected'
);

-- ── OPEN join / REQUEST / INVITE_ONLY direct join ───────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f110","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_arena_crew('Request Hub', 'request-hub', '', 'REQUEST', array['Gaming']) $$,
  'REQUEST crew creates'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f105","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_arena_crew('Invite Hub', 'invite-hub', '', 'INVITE_ONLY', array['Sports']) $$,
  'INVITE_ONLY crew creates'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f102","role":"authenticated"}', true);

select is(
  (public.join_arena_crew((select id from public.arena_crews where slug = 'open-alpha')))->>'memberCount',
  '2',
  'OPEN crew can be joined; member_count updates'
);
select is(
  (select role::text from public.arena_crew_memberships
    where profile_id = 'ac-joiner' and left_at is null),
  'MEMBER',
  'joiner is MEMBER'
);

select throws_ok(
  $$ select public.join_arena_crew((select id from public.arena_crews where slug = 'request-hub')) $$,
  'P0003',
  'already in a crew',
  'cannot join second crew while active'
);

-- Free joiner for mode checks: leave first
select lives_ok(
  $$ select public.leave_arena_crew((select id from public.arena_crews where slug = 'open-alpha')) $$,
  'member can leave'
);
select ok(
  (select left_at is not null from public.arena_crew_memberships
    where crew_id = (select id from public.arena_crews where slug = 'open-alpha')
      and profile_id = 'ac-joiner'),
  'leaving marks membership inactive'
);
select is(
  (select member_count from public.arena_crews where slug = 'open-alpha'),
  1,
  'leaving updates member_count'
);
select ok(
  exists (
    select 1 from public.arena_crew_leave_cooldowns
     where profile_id = 'ac-joiner' and join_after > now()
  ),
  'leaving creates 72-hour cooldown'
);
select ok(
  (select join_after >= left_at + interval '71 hours 59 minutes'
     from public.arena_crew_leave_cooldowns where profile_id = 'ac-joiner'),
  'cooldown window is ~72 hours'
);

select throws_ok(
  $$ select public.join_arena_crew((select id from public.arena_crews where slug = 'open-alpha')) $$,
  'P0001',
  'crew rejoin cooldown active',
  'cannot immediately join during cooldown'
);

-- Clear cooldown to test mode gates, then re-apply for later cooldown expiry test
update public.arena_crew_leave_cooldowns
   set join_after = now() - interval '1 minute'
 where profile_id = 'ac-joiner';

select throws_ok(
  $$ select public.join_arena_crew((select id from public.arena_crews where slug = 'request-hub')) $$,
  'P0003',
  'this crew is not open join',
  'REQUEST crew cannot be directly joined'
);
select throws_ok(
  $$ select public.join_arena_crew((select id from public.arena_crews where slug = 'invite-hub')) $$,
  'P0003',
  'this crew is not open join',
  'INVITE_ONLY crew cannot be directly joined'
);

-- Rejoin after simulated cooldown expiry
select is(
  (public.join_arena_crew((select id from public.arena_crews where slug = 'open-alpha')))->>'memberCount',
  '2',
  'rejoining after cooldown expiry works'
);

-- ── Ownership protections ───────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}', true);
select throws_ok(
  $$ select public.leave_arena_crew((select id from public.arena_crews where slug = 'open-alpha')) $$,
  'P0003',
  'transfer ownership before leaving',
  'sole OWNER cannot leave'
);

-- Unauthorized MEMBER cannot invite / decide
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f102","role":"authenticated"}', true);
select throws_ok(
  $$ select public.invite_to_arena_crew(
       (select id from public.arena_crews where slug = 'open-alpha'), 'ac-inv') $$,
  '42501',
  'only owners and moderators can invite',
  'MEMBER cannot invite'
);

-- Direct role escalate blocked for authenticated clients
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f102","role":"authenticated"}', true);
select throws_ok(
  $$ update public.arena_crew_memberships set role = 'OWNER'
      where profile_id = 'ac-joiner' $$,
  '42501',
  null,
  'ownership protections cannot be bypassed through direct table writes'
);
select throws_ok(
  $$ insert into public.arena_crews
       (id, slug, name, created_by, member_count)
     values ('ac_fake', 'fake-crew', 'Fake', 'ac-joiner', 1) $$,
  '42501',
  null,
  'authenticated cannot insert Crew'
);
select throws_ok(
  $$ update public.arena_crews set total_reputation = 99999 where slug = 'open-alpha' $$,
  '42501',
  null,
  'authenticated cannot alter Crew reputation'
);
select throws_ok(
  $$ insert into public.arena_crew_memberships (crew_id, profile_id, role)
     values ((select id from public.arena_crews where slug = 'open-alpha'), 'ac-inv', 'OWNER') $$,
  '42501',
  null,
  'authenticated cannot insert membership'
);
select throws_ok(
  $$ update public.arena_crews set member_count = 999 where slug = 'open-alpha' $$,
  '42501',
  null,
  'authenticated cannot manipulate member_count'
);
select throws_ok(
  $$ update public.arena_crews set follower_count = 999 where slug = 'open-alpha' $$,
  '42501',
  null,
  'authenticated cannot manipulate follower_count'
);
select throws_ok(
  $$ insert into public.arena_crew_invites (id, crew_id, inviter_id, recipient_id)
     values ('aci_fake', (select id from public.arena_crews where slug = 'open-alpha'),
             'ac-joiner', 'ac-inv') $$,
  '42501',
  null,
  'authenticated cannot insert invite'
);
select throws_ok(
  $$ insert into public.arena_crew_join_requests (id, crew_id, requester_id)
     values ('acr_fake', (select id from public.arena_crews where slug = 'request-hub'),
             'ac-joiner') $$,
  '42501',
  null,
  'authenticated cannot forge join request'
);
select throws_ok(
  $$ insert into public.arena_crew_leave_cooldowns (profile_id, left_at, join_after)
     values ('ac-joiner', now(), now() + interval '1 hour')
     on conflict (profile_id) do update set join_after = excluded.join_after $$,
  '42501',
  null,
  'authenticated cannot bypass cooldown ledger'
);
reset role;

-- ── Invites ─────────────────────────────────────────────────────────────────
-- Promote ac-mod into open-alpha as MODERATOR via server role (fixture only)
reset role;
select set_config('request.jwt.claims', null, true);

-- Clear joiner from open-alpha so invites have room; leave as joiner
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f102","role":"authenticated"}', true);
select lives_ok(
  $$ select public.leave_arena_crew((select id from public.arena_crews where slug = 'open-alpha')) $$,
  'joiner leaves ahead of invite suite'
);
update public.arena_crew_leave_cooldowns
   set join_after = now() - interval '1 minute'
 where profile_id = 'ac-joiner';

-- Seed moderator membership (postgres fixture — no transfer RPC exists)
insert into public.arena_crew_memberships (crew_id, profile_id, role, is_primary)
values (
  (select id from public.arena_crews where slug = 'open-alpha'),
  'ac-mod',
  'MODERATOR',
  true
);
update public.arena_crews
   set member_count = (
     select count(*)::integer from public.arena_crew_memberships m
      where m.crew_id = (select id from public.arena_crews where slug = 'open-alpha')
        and m.left_at is null
   )
 where slug = 'open-alpha';

-- Seed a plain MEMBER for permission negative tests
insert into public.arena_crew_memberships (crew_id, profile_id, role, is_primary)
values (
  (select id from public.arena_crews where slug = 'open-alpha'),
  'ac-member',
  'MEMBER',
  true
);
update public.arena_crews
   set member_count = (
     select count(*)::integer from public.arena_crew_memberships m
      where m.crew_id = (select id from public.arena_crews where slug = 'open-alpha')
        and m.left_at is null
   )
 where slug = 'open-alpha';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}', true);
select is(
  (public.invite_to_arena_crew(
     (select id from public.arena_crews where slug = 'open-alpha'), 'ac-inv'))->>'status',
  'PENDING',
  'OWNER can invite'
);

-- Decline so we can re-test moderator invite
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f107","role":"authenticated"}', true);
select is(
  (public.respond_arena_crew_invite(
     (select id from public.arena_crew_invites
       where recipient_id = 'ac-inv' and status = 'PENDING'), false))->>'status',
  'DECLINED',
  'declining works'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f104","role":"authenticated"}', true);
select is(
  (public.invite_to_arena_crew(
     (select id from public.arena_crews where slug = 'open-alpha'), 'ac-inv'))->>'status',
  'PENDING',
  'MODERATOR can invite'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f103","role":"authenticated"}', true);
select throws_ok(
  $$ select public.invite_to_arena_crew(
       (select id from public.arena_crews where slug = 'open-alpha'), 'ac-cool') $$,
  '42501',
  'only owners and moderators can invite',
  'normal MEMBER cannot invite'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}', true);
select throws_ok(
  $$ select public.invite_to_arena_crew(
       (select id from public.arena_crews where slug = 'open-alpha'), 'ac-owner') $$,
  'P0003',
  'invalid recipient',
  'user cannot invite themselves'
);
select throws_ok(
  $$ select public.invite_to_arena_crew(
       (select id from public.arena_crews where slug = 'open-alpha'), 'ac-member') $$,
  'P0003',
  'already a member',
  'existing member cannot be invited'
);

insert into public.blocks (blocker_id, blocked_id) values ('ac-owner', 'ac-block');
select throws_ok(
  $$ select public.invite_to_arena_crew(
       (select id from public.arena_crews where slug = 'open-alpha'), 'ac-block') $$,
  'P0005',
  'blocked',
  'blocked relationships prevent invitations'
);

-- Duplicate pending invite for same recipient
select throws_ok(
  $$ select public.invite_to_arena_crew(
       (select id from public.arena_crews where slug = 'open-alpha'), 'ac-inv') $$,
  'P0003',
  'invite already pending',
  'duplicate pending invitation rejected'
);

-- Non-recipient cannot respond
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f102","role":"authenticated"}', true);
select throws_ok(
  $$ select public.respond_arena_crew_invite(
       (select id from public.arena_crew_invites
         where recipient_id = 'ac-inv' and status = 'PENDING'), true) $$,
  '42501',
  'not your invite',
  'only intended recipient can respond'
);

-- Expire invite then accept fails (keep expires_at > created_at check)
update public.arena_crew_invites
   set created_at = now() - interval '8 days',
       expires_at = now() - interval '1 day'
 where recipient_id = 'ac-inv' and status = 'PENDING';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f107","role":"authenticated"}', true);
select is(
  (public.respond_arena_crew_invite(
     (select id from public.arena_crew_invites
       where recipient_id = 'ac-inv' and status = 'PENDING' limit 1), true))->>'status',
  'EXPIRED',
  'expired invite cannot be accepted'
);
select is(
  (select status::text from public.arena_crew_invites
    where recipient_id = 'ac-inv' and status = 'EXPIRED' limit 1),
  'EXPIRED',
  'expired invite marked EXPIRED (persists — no raise rollback)'
);
select ok(
  not exists (
    select 1 from public.arena_crew_memberships
     where profile_id = 'ac-inv' and left_at is null
  ),
  'expired accept does not create membership'
);

-- Fresh invite → accept creates membership
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}', true);
select is(
  (public.invite_to_arena_crew(
     (select id from public.arena_crews where slug = 'open-alpha'), 'ac-inv'))->>'status',
  'PENDING',
  'fresh invite after expiry'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f107","role":"authenticated"}', true);
select lives_ok(
  $$ select public.respond_arena_crew_invite(
       (select id from public.arena_crew_invites
         where recipient_id = 'ac-inv' and status = 'PENDING'), true) $$,
  'accepting invite succeeds'
);
select ok(
  exists (
    select 1 from public.arena_crew_memberships
     where profile_id = 'ac-inv' and left_at is null
       and crew_id = (select id from public.arena_crews where slug = 'open-alpha')
  ),
  'accepting creates active membership'
);
select is(
  (select member_count from public.arena_crews where slug = 'open-alpha'),
  (select count(*)::integer from public.arena_crew_memberships m
    where m.crew_id = (select id from public.arena_crews where slug = 'open-alpha')
      and m.left_at is null),
  'accepting keeps member_count correct'
);

-- One-active-crew + cooldown on accept
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}', true);
select is(
  (public.invite_to_arena_crew(
     (select id from public.arena_crews where slug = 'open-alpha'), 'ac-cool'))->>'status',
  'PENDING',
  'invite cool user'
);

-- Put cool into another crew first via create, then try accept
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f112","role":"authenticated"}', true);
-- Decline the pending invite first so create isn't blocked by... wait, create doesn't care about invites.
-- But cool has pending invite - create should work if not a member.
select lives_ok(
  $$ select public.create_arena_crew('Cool Solo', 'cool-solo', '', 'OPEN', '{}') $$,
  'invitee can create own crew while invite pending'
);
select throws_ok(
  $$ select public.respond_arena_crew_invite(
       (select id from public.arena_crew_invites
         where recipient_id = 'ac-cool' and status = 'PENDING'), true) $$,
  'P0003',
  'already in a crew',
  'accepting respects the one-active-Crew rule'
);

-- Leave cool-solo to trigger cooldown, then accept should fail cooldown
select lives_ok(
  -- need another owner first — sole owner cannot leave. Transfer via fixture:
  $$ select 1 $$,
  'noop'
);
reset role;
-- Add second OWNER so cool can leave (no transfer RPC — fixture dual-owner)
update public.arena_crew_memberships
   set role = 'OWNER'
 where crew_id = (select id from public.arena_crews where slug = 'cool-solo')
   and profile_id = 'ac-cool';
insert into public.arena_crew_memberships (crew_id, profile_id, role, is_primary)
values (
  (select id from public.arena_crews where slug = 'cool-solo'),
  'ac-follow',
  'OWNER',
  true
);
update public.arena_crews
   set member_count = (
     select count(*)::integer from public.arena_crew_memberships m
      where m.crew_id = (select id from public.arena_crews where slug = 'cool-solo')
        and m.left_at is null
   )
 where slug = 'cool-solo';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f112","role":"authenticated"}', true);
select lives_ok(
  $$ select public.leave_arena_crew((select id from public.arena_crews where slug = 'cool-solo')) $$,
  'cool leaves to enter cooldown'
);
select throws_ok(
  $$ select public.respond_arena_crew_invite(
       (select id from public.arena_crew_invites
         where recipient_id = 'ac-cool' and status = 'PENDING'), true) $$,
  'P0001',
  'crew rejoin cooldown active',
  'accepting respects the 72-hour cooldown'
);

-- ── Join requests ───────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f106","role":"authenticated"}', true);
select throws_ok(
  $$ select public.request_arena_crew_join(
       (select id from public.arena_crews where slug = 'open-alpha')) $$,
  'P0003',
  'this crew does not take requests',
  'only REQUEST crews accept requests'
);

select is(
  (public.request_arena_crew_join(
     (select id from public.arena_crews where slug = 'request-hub')))->>'status',
  'PENDING',
  'REQUEST crew accepts a join request'
);

select throws_ok(
  $$ select public.request_arena_crew_join(
       (select id from public.arena_crews where slug = 'request-hub')) $$,
  'P0003',
  'request already pending',
  'duplicate pending request is rejected'
);

-- Requester cannot approve themselves
select throws_ok(
  $$ select public.decide_arena_crew_join_request(
       (select id from public.arena_crew_join_requests
         where requester_id = 'ac-req' and status = 'PENDING'), true) $$,
  '42501',
  'only owners and moderators can decide',
  'requester cannot approve themselves'
);

-- Seed a MEMBER on request-hub (ac-joiner is free after leaving open-alpha).
reset role;
update public.arena_crew_leave_cooldowns
   set join_after = now() - interval '1 minute'
 where profile_id = 'ac-joiner';
insert into public.arena_crew_memberships (crew_id, profile_id, role, is_primary)
values (
  (select id from public.arena_crews where slug = 'request-hub'),
  'ac-joiner',
  'MEMBER',
  true
)
on conflict (crew_id, profile_id) do update
  set left_at = null, role = 'MEMBER', is_primary = true, joined_at = now()
where public.arena_crew_memberships.left_at is not null;

update public.arena_crews
   set member_count = (
     select count(*)::integer from public.arena_crew_memberships m
      where m.crew_id = (select id from public.arena_crews where slug = 'request-hub')
        and m.left_at is null
   )
 where slug = 'request-hub';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f102","role":"authenticated"}', true);
select throws_ok(
  $$ select public.decide_arena_crew_join_request(
       (select id from public.arena_crew_join_requests
         where requester_id = 'ac-req' and status = 'PENDING'), true) $$,
  '42501',
  'only owners and moderators can decide',
  'MEMBER cannot approve a request'
);

-- Promote joiner to MODERATOR on request-hub for approve path
reset role;
update public.arena_crew_memberships
   set role = 'MODERATOR'
 where crew_id = (select id from public.arena_crews where slug = 'request-hub')
   and profile_id = 'ac-joiner' and left_at is null;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f102","role":"authenticated"}', true);
select lives_ok(
  $$ select public.decide_arena_crew_join_request(
       (select id from public.arena_crew_join_requests
         where requester_id = 'ac-req' and status = 'PENDING'), true) $$,
  'MODERATOR can approve'
);
select ok(
  exists (
    select 1 from public.arena_crew_memberships
     where profile_id = 'ac-req' and left_at is null
       and crew_id = (select id from public.arena_crews where slug = 'request-hub')
  ),
  'approval creates membership'
);
select is(
  (select member_count from public.arena_crews where slug = 'request-hub'),
  (select count(*)::integer from public.arena_crew_memberships m
    where m.crew_id = (select id from public.arena_crews where slug = 'request-hub')
      and m.left_at is null),
  'approval keeps member_count correct'
);

-- Decline path + OWNER approve + one-active + cooldown
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f111","role":"authenticated"}', true);
select is(
  (public.request_arena_crew_join(
     (select id from public.arena_crews where slug = 'request-hub')))->>'status',
  'PENDING',
  'second requester can request'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f110","role":"authenticated"}', true);
select is(
  (public.decide_arena_crew_join_request(
     (select id from public.arena_crew_join_requests
       where requester_id = 'ac-req2' and status = 'PENDING'), false))->>'status',
  'DECLINED',
  'OWNER can decline; declining works'
);

-- req2 requests again after decline (status no longer pending — unique allows new pending)
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f111","role":"authenticated"}', true);
select is(
  (public.request_arena_crew_join(
     (select id from public.arena_crews where slug = 'request-hub')))->>'status',
  'PENDING',
  'can request again after decline'
);

-- Put req2 into another crew so approval hits one-active
select lives_ok(
  $$ select public.create_arena_crew('Req2 Home', 'req2-home', '', 'OPEN', '{}') $$,
  'req2 creates competing crew'
);
-- Wait - request_arena_crew_join already called assert_join_allowed; then create
-- would fail because... they aren't members yet when requesting. After request,
-- they create a crew - that works. Then OWNER approves - should fail already in crew.

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f110","role":"authenticated"}', true);
select throws_ok(
  $$ select public.decide_arena_crew_join_request(
       (select id from public.arena_crew_join_requests
         where requester_id = 'ac-req2' and status = 'PENDING'), true) $$,
  'P0003',
  'already in a crew',
  'approval respects one-active-Crew membership'
);

-- Cooldown on approval: leave req2-home (need dual owner), then approve fails cooldown
reset role;
-- Free ac-follow from cool-solo before seeding as co-OWNER of req2-home.
update public.arena_crew_memberships
   set left_at = now(), is_primary = false
 where profile_id = 'ac-follow' and left_at is null;

insert into public.arena_crew_memberships (crew_id, profile_id, role, is_primary)
values (
  (select id from public.arena_crews where slug = 'req2-home'),
  'ac-follow',
  'OWNER',
  true
)
on conflict (crew_id, profile_id) do update
  set left_at = null, role = 'OWNER', is_primary = true, joined_at = now()
where public.arena_crew_memberships.left_at is not null;

update public.arena_crews
   set member_count = (
     select count(*)::integer from public.arena_crew_memberships m
      where m.crew_id = arena_crews.id and m.left_at is null
   )
 where slug in ('req2-home', 'cool-solo');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f111","role":"authenticated"}', true);
select lives_ok(
  $$ select public.leave_arena_crew((select id from public.arena_crews where slug = 'req2-home')) $$,
  'req2 leaves into cooldown'
);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f110","role":"authenticated"}', true);
select throws_ok(
  $$ select public.decide_arena_crew_join_request(
       (select id from public.arena_crew_join_requests
         where requester_id = 'ac-req2' and status = 'PENDING'), true) $$,
  'P0001',
  'crew rejoin cooldown active',
  'approval respects cooldown'
);

-- Clear cooldown and approve successfully as OWNER
update public.arena_crew_leave_cooldowns
   set join_after = now() - interval '1 minute'
 where profile_id = 'ac-req2';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f110","role":"authenticated"}', true);
select ok(
  (public.decide_arena_crew_join_request(
     (select id from public.arena_crew_join_requests
       where requester_id = 'ac-req2' and status = 'PENDING'), true)
  ) ? 'memberCount',
  'OWNER can approve after cooldown cleared'
);
select is(
  (select member_count from public.arena_crews where slug = 'request-hub'),
  (select count(*)::integer from public.arena_crew_memberships m
    where m.crew_id = (select id from public.arena_crews where slug = 'request-hub')
      and m.left_at is null),
  'member_count remains correct after request approval'
);

-- Free follower account before follow suite (was co-OWNER of req2-home).
reset role;
update public.arena_crew_memberships
   set left_at = now(), is_primary = false
 where profile_id = 'ac-follow' and left_at is null;
update public.arena_crews
   set member_count = (
     select count(*)::integer from public.arena_crew_memberships m
      where m.crew_id = arena_crews.id and m.left_at is null
   )
 where slug = 'req2-home';

-- ── Following ───────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f109","role":"authenticated"}', true);
-- ac-follow may have left cool-solo; ensure not blocking. Follow multiple crews.
select is(
  (public.follow_arena_crew((select id from public.arena_crews where slug = 'open-alpha')))->>'followerCount',
  '1',
  'follow updates follower_count'
);
select is(
  (public.follow_arena_crew((select id from public.arena_crews where slug = 'request-hub')))->>'followerCount',
  '1',
  'user can follow multiple Crews'
);
select is(
  (select count(*)::integer from public.arena_crew_memberships
    where profile_id = 'ac-follow' and left_at is null),
  0,
  'following does NOT count as membership'
);
select is(
  (select member_count from public.arena_crews where slug = 'open-alpha'),
  (select count(*)::integer from public.arena_crew_memberships m
    where m.crew_id = (select id from public.arena_crews where slug = 'open-alpha')
      and m.left_at is null),
  'following does NOT affect member_count'
);

select is(
  (public.follow_arena_crew((select id from public.arena_crews where slug = 'open-alpha')))->>'followerCount',
  '1',
  'repeated follow is idempotent'
);
select lives_ok(
  $$ select public.unfollow_arena_crew((select id from public.arena_crews where slug = 'open-alpha')) $$,
  'unfollow works'
);
select is(
  (select follower_count from public.arena_crews where slug = 'open-alpha'),
  0,
  'unfollow updates follower_count'
);
select lives_ok(
  $$ select public.unfollow_arena_crew((select id from public.arena_crews where slug = 'open-alpha')) $$,
  'repeated unfollow is safe'
);
select is(
  (select follower_count from public.arena_crews where slug = 'open-alpha'),
  0,
  'repeated unfollow leaves follower_count stable'
);

-- Follow while belonging to another Crew: ac-inv is member of open-alpha
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f107","role":"authenticated"}', true);
select is(
  (public.follow_arena_crew((select id from public.arena_crews where slug = 'invite-hub')))->>'followerCount',
  '1',
  'user can follow a Crew while belonging to another Crew'
);

-- ── Counter loops: join→leave→rejoin and follow→follow→unfollow→unfollow ────
update public.arena_crew_leave_cooldowns
   set join_after = now() - interval '1 minute'
 where profile_id = 'ac-cool';
-- Cancel leftover pending invite for cool
update public.arena_crew_invites
   set status = 'CANCELLED', responded_at = now()
 where recipient_id = 'ac-cool' and status = 'PENDING';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f112","role":"authenticated"}', true);
select lives_ok(
  $$ select public.join_arena_crew((select id from public.arena_crews where slug = 'open-alpha')) $$,
  'join in counter loop'
);
select is(
  (select member_count from public.arena_crews where slug = 'open-alpha'),
  (select count(*)::integer from public.arena_crew_memberships m
    where m.crew_id = (select id from public.arena_crews where slug = 'open-alpha')
      and m.left_at is null),
  'join member_count matches active rows'
);
select lives_ok(
  $$ select public.leave_arena_crew((select id from public.arena_crews where slug = 'open-alpha')) $$,
  'leave in counter loop'
);
select is(
  (select member_count from public.arena_crews where slug = 'open-alpha'),
  (select count(*)::integer from public.arena_crew_memberships m
    where m.crew_id = (select id from public.arena_crews where slug = 'open-alpha')
      and m.left_at is null),
  'leave member_count matches active rows'
);
update public.arena_crew_leave_cooldowns
   set join_after = now() - interval '1 minute'
 where profile_id = 'ac-cool';
select lives_ok(
  $$ select public.join_arena_crew((select id from public.arena_crews where slug = 'open-alpha')) $$,
  'rejoin in counter loop'
);
select is(
  (select member_count from public.arena_crews where slug = 'open-alpha'),
  (select count(*)::integer from public.arena_crew_memberships m
    where m.crew_id = (select id from public.arena_crews where slug = 'open-alpha')
      and m.left_at is null),
  'rejoin member_count matches active rows'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f109","role":"authenticated"}', true);
select lives_ok($$ select public.follow_arena_crew((select id from public.arena_crews where slug = 'invite-hub')) $$, 'follow 1');
select lives_ok($$ select public.follow_arena_crew((select id from public.arena_crews where slug = 'invite-hub')) $$, 'follow 2 idempotent');
select is(
  (select follower_count from public.arena_crews where slug = 'invite-hub'),
  (select count(*)::integer from public.arena_crew_follows f
    where f.crew_id = (select id from public.arena_crews where slug = 'invite-hub')),
  'follower_count matches after follow loop'
);
select lives_ok($$ select public.unfollow_arena_crew((select id from public.arena_crews where slug = 'invite-hub')) $$, 'unfollow 1');
select lives_ok($$ select public.unfollow_arena_crew((select id from public.arena_crews where slug = 'invite-hub')) $$, 'unfollow 2 safe');
select is(
  (select follower_count from public.arena_crews where slug = 'invite-hub'),
  (select count(*)::integer from public.arena_crew_follows f
    where f.crew_id = (select id from public.arena_crews where slug = 'invite-hub')),
  'follower_count matches after unfollow loop'
);

-- One-active membership index still present
select ok(
  exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'arena_crew_memberships_one_active_per_profile_idx'
  ),
  'partial unique index remains the DB-level one-active guarantee'
);

select * from finish();
rollback;

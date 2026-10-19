-- ============================================================================
-- Follow hardening (pgTAP) — Step 4C
-- Transaction-scoped. Reproduces the Codex findings: client-forgeable
-- notifications, missing challenger/mute authorization, post-verdict follows,
-- and per-recipient delivery filtering.
-- ============================================================================
begin;
select no_plan();
set local search_path = public, extensions;
reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000e0001'),
  ('00000000-0000-0000-0000-0000000e0002'),
  ('00000000-0000-0000-0000-0000000e0003'),
  ('00000000-0000-0000-0000-0000000e0004'),
  ('00000000-0000-0000-0000-0000000e0005');

update public.profiles set id='h-author', handle='h_author', name='Author'
 where auth_user_id='00000000-0000-0000-0000-0000000e0001';
update public.profiles set id='h-challenger', handle='h_challenger', name='Challenger'
 where auth_user_id='00000000-0000-0000-0000-0000000e0002';
update public.profiles set id='h-fan', handle='h_fan', name='Fan'
 where auth_user_id='00000000-0000-0000-0000-0000000e0003';
update public.profiles set id='h-revoked', handle='h_revoked', name='Revoked'
 where auth_user_id='00000000-0000-0000-0000-0000000e0004';
update public.profiles set id='h-blocked', handle='h_blocked', name='Blocked'
 where auth_user_id='00000000-0000-0000-0000-0000000e0005';

insert into public.takes (id, author_id, hood, text)
values ('h-take', 'h-author', 'techtakes', 'Hardening proposition');

insert into public.clashes (id, take_id, challenger_id, status, opens_at, closes_at) values
  ('h-open', 'h-take', 'h-challenger', 'open', now() - interval '5 min', now() + interval '1 hour'),
  ('h-settled', 'h-take', 'h-challenger', 'settled', now() - interval '2 hour', now() - interval '1 hour');

-- 1. Client roles can no longer forge notifications ------------------------
set role anon;
select throws_ok(
  $$ select public.clash_notify('h-fan', null, 'clash_result', 'h-open') $$,
  '42501', null, 'anon cannot execute the notification writer');
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000e0003')::text, true);
set role authenticated;
select throws_ok(
  $$ select public.clash_notify('h-fan', null, 'clash_result', 'h-open') $$,
  '42501', null, 'authenticated cannot execute the notification writer');
reset role;

-- 2. Challenger block is part of visibility --------------------------------
insert into public.blocks (blocker_id, blocked_id) values ('h-challenger', 'h-blocked');
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000e0005')::text, true);
set role authenticated;
select throws_ok($$ select public.follow_clash('h-open') $$, '42501', null,
  'viewer blocked by the challenger cannot follow');
reset role;

-- 3. Viewer mute of the author is part of visibility -----------------------
insert into public.mutes (muter_id, muted_id) values ('h-revoked', 'h-author');
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000e0004')::text, true);
set role authenticated;
select throws_ok($$ select public.follow_clash('h-open') $$, '42501', null,
  'viewer who muted the source author cannot follow');
reset role;

-- 4. Post-verdict (settled) follow is refused: cutoff is verdict insertion --
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000e0003')::text, true);
set role authenticated;
select throws_ok($$ select public.follow_clash('h-settled') $$, '42501', null,
  'settled clash cannot be followed');
select public.follow_clash('h-open');
reset role;

-- 5. Delivery filters per recipient, not in bulk --------------------------
-- h-revoked and h-blocked cannot follow, so make them followers directly to
-- simulate access being revoked AFTER following.
insert into public.clash_follows (clash_id, follower_id) values
  ('h-open', 'h-revoked'), ('h-open', 'h-blocked');
insert into public.verdicts
  (clash_id, winner_side, side_a_score, side_b_score, jury_size, agreement, margin, verdict_label)
values ('h-open','A',2,0,2,1,2,'CLEAR DECISION');

select is((select count(*)::int from public.notifications
            where recipient_id='h-fan' and kind='clash_result' and entity_id='h-open'), 1,
  'eligible follower is notified');
select is((select count(*)::int from public.notifications
            where recipient_id='h-revoked' and kind='clash_result' and entity_id='h-open'), 0,
  'recipient who muted the author is filtered at delivery');
select is((select count(*)::int from public.notifications
            where recipient_id='h-blocked' and kind='clash_result' and entity_id='h-open'), 0,
  'recipient blocked by the challenger is filtered at delivery');

-- 6. Definer callers still work after the privilege revoke ----------------
select is((select count(*)::int from public.notifications
            where recipient_id='h-author' and kind='clash_result'), 0,
  'no fighter notification is fabricated by the trigger');

select finish();
rollback;

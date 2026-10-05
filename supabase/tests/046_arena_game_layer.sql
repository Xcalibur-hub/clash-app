-- ============================================================================
-- Phase 14 — Arena game layer (pgTAP): reputation facets, Call Backup, events.
-- Run: supabase test db
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

-- ── 1. Containment: nothing here can be written by a client ────────────────
select has_function('public', 'call_arena_backup', 'call_arena_backup exists');
select has_function('public', 'respond_arena_backup', 'respond_arena_backup exists');
select has_function('public', 'list_arena_backup_candidates', 'candidate ranking exists');
select has_function('public', 'list_arena_room_events', 'battle event feed exists');
select has_function('public', 'get_my_arena_reputation', 'own reputation read exists');

select is(has_table_privilege('authenticated', 'public.profile_reputation_facets', 'INSERT'),
  false, 'a client cannot write a reputation facet');
select is(has_table_privilege('authenticated', 'public.profile_reputation_facets', 'UPDATE'),
  false, 'a client cannot update a reputation facet');
select is(has_table_privilege('authenticated', 'public.arena_room_events', 'INSERT'),
  false, 'a client cannot fabricate a battle event');
select is(has_table_privilege('authenticated', 'public.arena_backup_invites', 'INSERT'),
  false, 'a client cannot mint an invitation');
select is(has_table_privilege('authenticated', 'public.arena_backup_invites', 'UPDATE'),
  false, 'a client cannot answer an invitation directly');
select is(has_table_privilege('authenticated', 'public.arena_backup_preferences', 'UPDATE'),
  false, 'a client cannot update a preference row directly');
select is(has_function_privilege('authenticated',
  'public.arena_event(text,text,public.arena_room_event_kind,text,text,jsonb,text)', 'EXECUTE'),
  false, 'the raw event writer is server-only');
select is(has_function_privilege('authenticated', 'public.award_arena_fun_moment(text)', 'EXECUTE'),
  false, 'the entertainment award is server-only');
select is(has_function_privilege('authenticated', 'public.expire_arena_backup_invites(integer)', 'EXECUTE'),
  false, 'the expiry sweep is server-only');
select is(has_function_privilege('anon', 'public.call_arena_backup(text,text)', 'EXECUTE'),
  false, 'a guest cannot call backup');

-- ── 2. Fixtures ────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000e001'), ('00000000-0000-0000-0000-00000000e002'),
  ('00000000-0000-0000-0000-00000000e003'), ('00000000-0000-0000-0000-00000000e004'),
  ('00000000-0000-0000-0000-00000000e005'), ('00000000-0000-0000-0000-00000000e006'),
  ('00000000-0000-0000-0000-00000000e007'), ('00000000-0000-0000-0000-00000000e008'),
  ('00000000-0000-0000-0000-00000000e009');

update public.profiles set id = 'ag-caller',  handle = 'ag_caller',  name = 'Arena Caller'  where auth_user_id = '00000000-0000-0000-0000-00000000e001';
update public.profiles set id = 'ag-newbie',  handle = 'ag_newbie',  name = 'Arena Newbie'  where auth_user_id = '00000000-0000-0000-0000-00000000e002';
update public.profiles set id = 'ag-expert',  handle = 'ag_expert',  name = 'Arena Expert'  where auth_user_id = '00000000-0000-0000-0000-00000000e003';
update public.profiles set id = 'ag-expert2', handle = 'ag_expert2', name = 'Arena Expert2' where auth_user_id = '00000000-0000-0000-0000-00000000e004';
update public.profiles set id = 'ag-veteran', handle = 'ag_veteran', name = 'Arena Veteran' where auth_user_id = '00000000-0000-0000-0000-00000000e005';
update public.profiles set id = 'ag-other',   handle = 'ag_other',   name = 'Arena Other'   where auth_user_id = '00000000-0000-0000-0000-00000000e006';
update public.profiles set id = 'ag-spect',   handle = 'ag_spect',   name = 'Arena Spect'   where auth_user_id = '00000000-0000-0000-0000-00000000e007';
update public.profiles set id = 'ag-funny',   handle = 'ag_funny',   name = 'Arena Funny'   where auth_user_id = '00000000-0000-0000-0000-00000000e008';
update public.profiles set id = 'ag-optedout',handle = 'ag_optedout',name = 'Arena Optout'  where auth_user_id = '00000000-0000-0000-0000-00000000e009';

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000e011');
update public.profiles set id = 'ag-mind', handle = 'ag_mind', name = 'Arena Mind'
 where auth_user_id = '00000000-0000-0000-0000-00000000e011';
-- A respected member who never enters the live room, so policy tests are not
-- shadowed by "already in this room".
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000e012');
update public.profiles set id = 'ag-expert3', handle = 'ag_expert3', name = 'Arena Expert3',
       home_hood = 'movies' where auth_user_id = '00000000-0000-0000-0000-00000000e012';

update public.profiles set home_hood = 'movies'
 where id in ('ag-caller', 'ag-expert', 'ag-expert2', 'ag-veteran');


-- 12 settled rooms of history, so standing is earned rather than declared.
insert into public.arena_daily_topics
  (id, title, hood, status, opens_at, final_arguments_at, judging_at, closes_at)
select 'ag-h' || g, 'History ' || g, 'movies', 'closed',
       now() - interval '4 days', now() - interval '4 days' + interval '1 hour',
       now() - interval '4 days' + interval '2 hours', now() - interval '4 days' + interval '3 hours'
  from generate_series(1, 12) g;

insert into public.arena_rooms
  (id, topic_id, status, capacity, participant_count, opens_at, closes_at)
select 'ag-hr' || g, 'ag-h' || g, 'SETTLED', 40, 1,
       now() - interval '4 days', now() - interval '4 days' + interval '3 hours'
  from generate_series(1, 12) g;

insert into public.arena_room_participants (room_id, topic_id, profile_id, initial_stance, role)
select 'ag-hr' || g, 'ag-h' || g, 'ag-veteran', 'AGREE', 'debater' from generate_series(1, 12) g;
insert into public.arena_room_participants (room_id, topic_id, profile_id, initial_stance, role)
select 'ag-hr' || g, 'ag-h' || g, 'ag-caller', 'AGREE', 'debater' from generate_series(1, 5) g;
insert into public.arena_room_participants (room_id, topic_id, profile_id, initial_stance, role)
select 'ag-hr' || g, 'ag-h' || g, 'ag-expert', 'AGREE', 'debater' from generate_series(1, 5) g;
insert into public.arena_room_participants (room_id, topic_id, profile_id, initial_stance, role)
select 'ag-hr' || g, 'ag-h' || g, 'ag-expert2', 'AGREE', 'debater' from generate_series(1, 5) g;
-- A contributor with no facets yet: enough history to summon, no substance credit.
insert into public.arena_room_participants (room_id, topic_id, profile_id, initial_stance, role)
select 'ag-hr' || g, 'ag-h' || g, 'ag-other', 'AGREE', 'debater' from generate_series(1, 5) g;
insert into public.arena_room_participants (room_id, topic_id, profile_id, initial_stance, role)
select 'ag-hr' || g, 'ag-h' || g, 'ag-expert3', 'AGREE', 'debater' from generate_series(1, 5) g;

-- Substance and entertainment both arrive through the real ledger.
insert into public.reputation_events (id, profile_id, kind, reputation_delta)
values ('ag-re-e', 'ag-expert', 'arena_useful_evidence', 20),
       ('ag-re-e2', 'ag-expert2', 'arena_useful_evidence', 20),
       ('ag-re-e3', 'ag-expert3', 'arena_useful_evidence', 20),
       ('ag-re-fun', 'ag-funny', 'arena_crowd_favorite', 500),
       ('ag-re-mind', 'ag-mind', 'arena_mind_impact', 500);

-- The live battle.
insert into public.arena_daily_topics
  (id, title, hood, status, opens_at, final_arguments_at, judging_at, closes_at)
values ('ag-live', 'Pixel takes better photos than iPhone', 'movies', 'live',
        now() - interval '1 hour', now() + interval '2 hours',
        now() + interval '3 hours', now() + interval '4 hours');

insert into public.arena_rooms
  (id, topic_id, status, capacity, participant_count, opens_at, closes_at)
values ('ag-r1', 'ag-live', 'OPEN', 20, 0, now() - interval '1 hour', now() + interval '4 hours'),
       ('ag-full', 'ag-live', 'OPEN', 20, 20, now() - interval '1 hour', now() + interval '4 hours'),
       ('ag-spect-room', 'ag-live', 'OPEN', 20, 0, now() - interval '1 hour', now() + interval '4 hours');

insert into public.arena_room_participants (room_id, topic_id, profile_id, initial_stance, role)
values ('ag-r1', 'ag-live', 'ag-caller', 'AGREE', 'debater'),
       ('ag-full', 'ag-live', 'ag-other', 'DISAGREE', 'debater'),
       ('ag-spect-room', 'ag-live', 'ag-spect', null, 'spectator');

-- ── 3. Standing comes from behaviour, never from entertainment ─────────────
select is(public.arena_standing_for('ag-mind'), 'CONTRIBUTOR'::public.arena_standing,
  'a mind-impact credit lifts standing out of the bottom rung (substance, not fun)');
select is(public.arena_standing_for('ag-newbie'), 'NEWCOMER'::public.arena_standing,
  'a brand-new member is a newcomer');
select is(public.arena_standing_for('ag-funny'), 'NEWCOMER'::public.arena_standing,
  'ENTERTAINMENT alone never grants standing: being funny is not authority');
select is(public.arena_standing_for('ag-caller'), 'CONTRIBUTOR'::public.arena_standing,
  'showing up five times makes a contributor');
select is(public.arena_standing_for('ag-expert'), 'DEBATER'::public.arena_standing,
  'debating plus useful evidence makes a debater');
select is(public.arena_standing_for('ag-veteran'), 'VETERAN'::public.arena_standing,
  'twelve battles makes a veteran');
select is(public.arena_may_call_backup('ag-newbie'), false,
  'a newcomer cannot summon anyone yet');
select is(public.arena_may_be_called('ag-funny'), false,
  'cluster of entertainment credit does not make someone a callable expert');
select is(public.arena_may_call_backup('ag-caller'), true, 'a contributor may call backup');
select is(public.arena_may_be_called('ag-expert'), true, 'a debater may be called');
select is(public.arena_may_be_called('ag-veteran'), true, 'a veteran may be called');
select is(public.arena_may_be_called('ag-other'), false,
  'a member with no Arena history is not callable yet');

-- The five facets stay separate: entertainment never leaks into debate.
select is(public.reputation_facet_json('ag-funny') ->> 'ENTERTAINMENT', '500',
  'entertainment credit is recorded');
select is(public.reputation_facet_json('ag-funny') ->> 'DEBATE', '0',
  'entertainment credit is not debate quality');
select is(public.reputation_facet_json('ag-expert') ->> 'EVIDENCE', '20',
  'evidence credit lands on the evidence facet');

-- Nothing client-side can award reputation.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
select is((public.get_my_arena_reputation() ->> 'standing'), 'CONTRIBUTOR',
  'a member can read their own standing');
select is((public.get_my_arena_reputation() ->> 'profileId'), 'ag-caller',
  'the standing read is own-only and takes no profile argument');
select is((public.get_my_arena_reputation()::text like '%stance%'), false,
  'own reputation payload carries no stance');
reset role;


-- ── 4. Call Backup: eligibility, ranking, abuse protection ─────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e002","role":"authenticated"}', true);
select throws_ok($$ select public.list_arena_backup_candidates('ag-r1', 5) $$,
  'P0003', null, 'a newcomer cannot even browse candidates');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
select ok(
  public.list_arena_backup_candidates('ag-r1', 5)
    @> jsonb_build_array(jsonb_build_object('profileId', 'ag-expert')),
  'the shortlist includes a relevant respected member'
);
select is(
  (public.list_arena_backup_candidates('ag-r1', 5)::text like '%ag-newbie%'),
  false, 'a newcomer is never suggested'
);
select is(
  (public.list_arena_backup_candidates('ag-r1', 5)::text like '%ag-funny%'),
  false, 'entertainment reputation alone does not qualify a candidate'
);
select is(
  (public.list_arena_backup_candidates('ag-r1', 5)::text like '%ag-other%'),
  false, 'someone already in the room is not suggested'
);
select is(
  (public.list_arena_backup_candidates('ag-r1', 5)::text like '%stance%'),
  false, 'the shortlist exposes no stance'
);
-- Deterministic: same room, same order.
select is(
  public.list_arena_backup_candidates('ag-r1', 5),
  public.list_arena_backup_candidates('ag-r1', 5),
  'candidate ranking is deterministic'
);

select throws_ok($$ select public.call_arena_backup('ag-r1', 'ag-caller') $$,
  'P0003', null, 'nobody can call themselves');
select throws_ok($$ select public.call_arena_backup('ag-r1', 'ag-newbie') $$,
  'P0003', null, 'a newcomer cannot be summoned');

select (public.call_arena_backup('ag-r1', 'ag-expert') ->> 'inviteId') as ag_inv_1 \gset
select is(
  (select status from public.arena_backup_invites where id = :'ag_inv_1'),
  'PENDING', 'a call opens as pending'
);
select is(
  (select count(*) from public.notifications
    where entity_id = :'ag_inv_1' and kind = 'arena_backup_request'),
  1::bigint, 'exactly one notification is sent for a call'
);
select is(
  (select kind from public.arena_room_events
    where room_id = 'ag-r1' and kind = 'BACKUP_CALLED' limit 1),
  'BACKUP_CALLED', 'the room sees a real battle event'
);

-- One live call per person, whoever calls.
select throws_ok($$ select public.call_arena_backup('ag-r1', 'ag-expert') $$,
  'P0007', null, 'the same recipient cannot be called twice');
select is(
  (select count(*) from public.arena_backup_invites where recipient_id = 'ag-expert'),
  1::bigint, 'a duplicate call is impossible'
);

-- Cooldown is per caller, and cancelling does not refund it.
select is(public.cancel_arena_backup(:'ag_inv_1') ->> 'status', 'CANCELLED',
  'the caller can withdraw a call');
reset role;
select is((select status from public.arena_backup_invites where id = :'ag_inv_1'),
  'CANCELLED', 'a withdrawn call is retired, not deleted');

-- A second caller runs the cooldown budget down.
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000e010');
update public.profiles set id = 'ag-caller2', handle = 'ag_caller2', name = 'Arena Caller2',
       home_hood = 'movies' where auth_user_id = '00000000-0000-0000-0000-00000000e010';
insert into public.arena_room_participants (room_id, topic_id, profile_id, initial_stance, role)
select 'ag-hr' || g, 'ag-h' || g, 'ag-caller2', 'AGREE', 'debater' from generate_series(1, 5) g;
insert into public.arena_room_participants (room_id, topic_id, profile_id, initial_stance, role)
values ('ag-r1', 'ag-live', 'ag-caller2', 'DISAGREE', 'debater');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e010","role":"authenticated"}', true);
select (public.call_arena_backup('ag-r1', 'ag-expert') ->> 'inviteId') as ag_c2_1 \gset
select public.cancel_arena_backup(:'ag_c2_1');
select (public.call_arena_backup('ag-r1', 'ag-expert') ->> 'inviteId') as ag_c2_2 \gset
select public.cancel_arena_backup(:'ag_c2_2');
select (public.call_arena_backup('ag-r1', 'ag-veteran') ->> 'inviteId') as ag_c2_3 \gset
select public.cancel_arena_backup(:'ag_c2_3');
select throws_ok($$ select public.call_arena_backup('ag-r1', 'ag-expert') $$,
  'P0001', null, 'the per-caller backup cooldown is enforced server-side');



-- ── 5. Answering a call: identity, capacity, concurrency ───────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
select (public.call_arena_backup('ag-r1', 'ag-expert') ->> 'inviteId') as ag_inv_2 \gset

-- Wrong recipient cannot answer.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e004","role":"authenticated"}', true);
select throws_ok(
  format('select public.respond_arena_backup(%L, true, %L)', :'ag_inv_2', 'AGREE'),
  '42501', null, 'a call can only be answered by the person called');

-- The recipient sees it, and it carries no stance.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e003","role":"authenticated"}', true);
select ok(public.list_my_arena_backup_invites() @> jsonb_build_array(
    jsonb_build_object('inviteId', :'ag_inv_2', 'roomId', 'ag-r1')),
  'the called member sees the live invitation');
select is((public.list_my_arena_backup_invites()::text like '%stance%'), false,
  'an incoming call exposes no stance');

-- Declining is private and final.
select is(public.respond_arena_backup(:'ag_inv_2', false) ->> 'status', 'DECLINED',
  'the called member can decline');
select is(
  (select count(*) from public.notifications where entity_id = :'ag_inv_2' and kind = 'arena_backup_arrival'),
  0::bigint, 'a decline does not notify the caller');
select throws_ok(
  format('select public.respond_arena_backup(%L, true, %L)', :'ag_inv_2', 'AGREE'),
  'P0006', null, 'an answered call cannot be answered again');

-- Expiry: a stale call cannot be accepted.
reset role;
select set_config('request.jwt.claims', null, true);
update public.arena_backup_invites
   set status = 'CANCELLED', responded_at = now()
 where status = 'PENDING' and recipient_id = 'ag-veteran';
insert into public.arena_backup_invites
  (id, room_id, topic_id, caller_id, recipient_id, status, created_at, expires_at)
values ('ag-expired', 'ag-r1', 'ag-live', 'ag-caller', 'ag-veteran', 'PENDING',
        now() - interval '30 minutes', now() - interval '20 minutes');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e005","role":"authenticated"}', true);
select is(public.respond_arena_backup('ag-expired', true, 'AGREE') ->> 'status', 'EXPIRED',
  'an expired call answers with the truth instead of joining');
reset role;
select is((select status from public.arena_backup_invites where id = 'ag-expired'), 'EXPIRED',
  'an expired call is retired truthfully');
select is(
  (select count(*) from public.arena_room_events
    where room_id = 'ag-r1' and kind = 'BACKUP_EXPIRED' and dedupe_key = 'BACKUP_EXPIRED:ag-expired'),
  1::bigint, 'an expired call is recorded in the room feed');

-- A saturated room is reported, never bypassed.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e006","role":"authenticated"}', true);
select (public.call_arena_backup('ag-full', 'ag-veteran') ->> 'inviteId') as ag_full_inv \gset
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e005","role":"authenticated"}', true);
select is(public.respond_arena_backup(:'ag_full_inv', true, 'AGREE') ->> 'status', 'room_full',
  'a full room answers with the truth');
select is(public.respond_arena_backup(:'ag_full_inv', true, 'AGREE') ->> 'spectateAvailable', 'true',
  'and it says spectating is still available');
select is(
  (select participant_count from public.arena_rooms where id = 'ag-full'),
  20, 'capacity was not bypassed');
select is(
  (select status from public.arena_backup_invites where id = :'ag_full_inv'),
  'PENDING', 'a call blocked by capacity stays open rather than being consumed');
reset role;
select is(
  (select count(*) from public.arena_room_participants
    where room_id = 'ag-full' and profile_id = 'ag-veteran'),
  0::bigint, 'no debater row was created in the saturated room');


-- ── 6. Arrival: the trust half of the reputation model ─────────────────────
reset role;
select set_config('request.jwt.claims', null, true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
select (public.call_arena_backup('ag-r1', 'ag-expert2') ->> 'inviteId') as ag_arrive \gset
reset role;
select (select reputation from public.profiles where id = 'ag-expert2') as ag_rep_before \gset

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e004","role":"authenticated"}', true);
select is(public.respond_arena_backup(:'ag_arrive', true, 'DISAGREE') ->> 'status', 'ACCEPTED',
  'accepting a call joins the battle');
select throws_ok(
  format('select public.respond_arena_backup(%L, true, %L)', :'ag_arrive', 'DISAGREE'),
  'P0006', null, 'an answered call cannot be answered twice');
reset role;
select is(
  (select count(*) from public.arena_room_participants
    where room_id = 'ag-r1' and profile_id = 'ag-expert2'),
  1::bigint, 'a repeated accept never doubles the participant row');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e004","role":"authenticated"}', true);
select is((public.get_my_arena_reputation() ->> 'standing'), 'DEBATER',
  'the arriving fighter keeps their standing');
select is(public.reputation_facet_json('ag-expert2') ->> 'TRUST', '8',
  'showing up when called credits the trust facet, not debate');
select is(
  (select reputation from public.profiles where id = 'ag-expert2'),
  :'ag_rep_before'::integer + 8, 'the global number moves like every other award');
select is(
  (select role from public.arena_room_participants
    where room_id = 'ag-r1' and profile_id = 'ag-expert2'),
  'debater', 'the arrival is a real debater row');
select is(
  (select count(*) from public.arena_room_events
    where room_id = 'ag-r1' and kind = 'BACKUP_ARRIVED'),
  1::bigint, 'the room sees exactly one arrival event');
reset role;
select is(
  (select count(*) from public.notifications
    where entity_id = :'ag_arrive' and kind = 'arena_backup_arrival'),
  1::bigint, 'the caller is told the backup arrived, once');

-- A spectator elsewhere in the topic is moved into the fight, not duplicated.
reset role;
select set_config('request.jwt.claims', null, true);
-- The saturated-room call is retired first: one live call per person is a rule.
update public.arena_backup_invites
   set status = 'CANCELLED', responded_at = now()
 where id = :'ag_full_inv';
delete from public.rate_limit_events
 where actor_id = 'ag-caller' and action = 'arena_backup_call';
-- Age the earlier calls out of the 30-minute room window and the repeat guard:
-- those rules are proven above, and this section tests blocks, mutes and opt-out.
update public.arena_backup_invites
   set created_at = now() - interval '45 minutes'
 where room_id = 'ag-r1' and status <> 'PENDING' and created_at > now() - interval '45 minutes';
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
reset role;
select set_config('request.jwt.claims', null, true);
insert into public.arena_room_participants (room_id, topic_id, profile_id, initial_stance, role)
values ('ag-spect-room', 'ag-live', 'ag-veteran', null, 'spectator');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
select (public.call_arena_backup('ag-r1', 'ag-veteran') ->> 'inviteId') as ag_move \gset
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e005","role":"authenticated"}', true);
select is(public.respond_arena_backup(:'ag_move', true, 'AGREE') ->> 'role', 'debater',
  'a called spectator becomes a debater');
reset role;
select is(
  (select room_id from public.arena_room_participants
    where topic_id = 'ag-live' and profile_id = 'ag-veteran'),
  'ag-r1', 'the call moves them into the calling room');
select is(
  (select count(*) from public.arena_room_participants
    where topic_id = 'ag-live' and profile_id = 'ag-veteran'),
  1::bigint, 'a person never holds two rows for one topic');

-- ── 7. Abuse protection: blocks, mutes, opt-out, following ─────────────────
reset role;
select set_config('request.jwt.claims', null, true);
-- The per-caller cooldown is proven above; clear it so this section tests
-- what it says it tests (blocks, mutes, opt-out) rather than the clock.
delete from public.rate_limit_events
 where actor_id in ('ag-caller', 'ag-caller2') and action = 'arena_backup_call';
insert into public.blocks (blocker_id, blocked_id) values ('ag-expert2', 'ag-caller');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
select is(
  (public.list_arena_backup_candidates('ag-r1', 10)::text like '%ag-expert2%'),
  false, 'a blocked member disappears from the shortlist');
select throws_ok($$ select public.call_arena_backup('ag-r1', 'ag-expert2') $$,
  'P0005', null, 'a block is respected by the call itself');
reset role;
delete from public.blocks where blocker_id = 'ag-expert2' and blocked_id = 'ag-caller';

insert into public.mutes (muter_id, muted_id) values ('ag-caller', 'ag-veteran');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
select throws_ok($$ select public.call_arena_backup('ag-r1', 'ag-veteran') $$,
  'P0005', null, 'a mute is respected too');
reset role;
delete from public.mutes where muter_id = 'ag-caller' and muted_id = 'ag-veteran';

-- Opt-out takes effect immediately.
insert into public.arena_backup_preferences (profile_id, policy)
values ('ag-expert', 'NOBODY'), ('ag-expert3', 'FOLLOWING');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
select throws_ok($$ select public.call_arena_backup('ag-r1', 'ag-expert') $$,
  'P0004', null, 'a member who opted out cannot be called');
select throws_ok($$ select public.call_arena_backup('ag-r1', 'ag-expert3') $$,
  'P0004', null, 'a follow-only member cannot be called by a stranger');
reset role;
insert into public.follows (follower_id, following_id) values ('ag-expert3', 'ag-caller');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
select is(
  (public.call_arena_backup('ag-r1', 'ag-expert3') ->> 'status'),
  'PENDING', 'a follow-only member can be called by someone they follow');


-- ── 8. Reactions: a compact vocabulary, never a judgement ──────────────────
reset role;
select set_config('request.jwt.claims', null, true);
insert into public.arena_room_messages (id, room_id, author_id, kind, body)
values ('ag-msg-1', 'ag-r1', 'ag-caller', 'text', 'A real argument'),
       ('ag-msg-fun', 'ag-r1', 'ag-funny', 'text', 'A very funny post');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
select throws_ok($$ select public.react_arena_room_message('ag-msg-1', 'hello') $$,
  'P0003', null, 'an arbitrary string is not a reaction');
select is((public.react_arena_room_message('ag-msg-1', '🧾') ->> 'reacted'), 'true',
  'a palette reaction is accepted');
select is((public.react_arena_room_message('ag-msg-1', '🧾') ->> 'reacted'), 'false',
  'the same reaction toggles off');
select is(
  (select count(*) from public.arena_room_argument_votes where message_id = 'ag-msg-1'),
  0::bigint, 'a reaction never becomes a judgement vote');

-- Reaction spam is rate limited (60 per 10 minutes).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e005","role":"authenticated"}', true);
do $$
begin
  for i in 1..60 loop
    perform public.react_arena_room_message('ag-msg-1', '💀');
  end loop;
end $$;
select throws_ok($$ select public.react_arena_room_message('ag-msg-1', '💀') $$,
  'P0001', null, 'the reaction rate limit is enforced server-side');

-- ── 9. Battle events come from the database's own transitions ──────────────
reset role;
select set_config('request.jwt.claims', null, true);
update public.arena_rooms set status = 'FINAL_ARGUMENTS' where id = 'ag-r1';
select is(
  (select count(*) from public.arena_room_events
    where room_id = 'ag-r1' and kind = 'PHASE_CHANGED'
      and dedupe_key = 'PHASE_CHANGED:ag-r1:FINAL_ARGUMENTS'),
  1::bigint, 'a phase change writes exactly one event');

update public.arena_rooms set status = 'JUDGING' where id = 'ag-r1';
select is(
  (select kind from public.arena_room_events
    where room_id = 'ag-r1' and dedupe_key = 'JUDGING_STARTED:ag-r1:JUDGING'),
  'JUDGING_STARTED', 'judging gets its own event vocabulary');

-- An evidence burst is computed, not tapped.
insert into public.arena_room_evidence (id, room_id, topic_id, author_id, kind, title, source_url)
values ('ag-ev1', 'ag-r1', 'ag-live', 'ag-caller', 'link', 'One', 'https://example.com/1'),
       ('ag-ev2', 'ag-r1', 'ag-live', 'ag-caller', 'link', 'Two', 'https://example.com/2'),
       ('ag-ev3', 'ag-r1', 'ag-live', 'ag-expert', 'link', 'Three', 'https://example.com/3');
select is(
  (select count(*) from public.arena_room_events where room_id = 'ag-r1' and kind = 'EVIDENCE_SURGED'),
  1::bigint, 'three citations inside three minutes is one surge, not three events'
);

-- The same dedupe key can never double-post.
select public.arena_event('ag-r1', 'ag-live', 'PHASE_CHANGED', null, null, '{}'::jsonb,
  'PHASE_CHANGED:ag-r1:FINAL_ARGUMENTS');
select is(
  (select count(*) from public.arena_room_events
    where room_id = 'ag-r1' and dedupe_key = 'PHASE_CHANGED:ag-r1:FINAL_ARGUMENTS'),
  1::bigint, 'a replayed transition cannot double-post'
);

-- Settlement produces its own event.
update public.arena_daily_topics
   set opens_at = now() - interval '4 hours',
       final_arguments_at = now() - interval '3 hours',
       judging_at = now() - interval '2 hours',
       closes_at = now() - interval '1 minute'
 where id = 'ag-live';
select public.settle_arena_room('ag-r1');
select is((select status::text from public.arena_rooms where id = 'ag-r1'), 'SETTLED',
  'the room settles');
select is(
  (select kind from public.arena_room_events
    where room_id = 'ag-r1' and dedupe_key = 'RESULT_SETTLED:ag-r1:SETTLED'),
  'RESULT_SETTLED', 'settlement is recorded as a battle event'
);


-- ── 10. Entertainment is credited, and never confused with a verdict ───────
insert into public.arena_room_message_reactions (message_id, profile_id, emoji)
select 'ag-msg-fun', p.id, '💀'
  from (values ('ag-caller'), ('ag-expert'), ('ag-expert2'), ('ag-other'), ('ag-newbie')) p(id);
select is(public.award_arena_fun_moment('ag-r1'), true,
  'the room''s crowd moment is awarded once');
select is(public.reputation_facet_json('ag-funny') ->> 'ENTERTAINMENT', '512',
  'the crowd moment lands on the entertainment facet');
select is(public.reputation_facet_json('ag-funny') ->> 'DEBATE', '0',
  'it does not become argument quality');
select is(public.arena_standing_for('ag-funny'), 'NEWCOMER'::public.arena_standing,
  'and it grants no authority over arguments');
select is(public.award_arena_fun_moment('ag-r1'), false, 'the award is idempotent');

-- ── 11. Capacity and roles ─────────────────────────────────────────────────
select is((public.arena_room_load('ag-full') ->> 'saturated'), 'true',
  'a full room reports saturation');
select is((public.arena_room_load('ag-full') ->> 'acceptingDebaters'), 'false',
  'and stops accepting debaters');
select is((public.arena_room_load('ag-full') ->> 'spectateAvailable'), 'true',
  'while spectating stays open');
select is((public.arena_room_load('ag-full')::text like '%stance%'), false,
  'room load exposes no stance');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
select is((public.arena_room_load('ag-r1') ->> 'viewerIsMember'), 'true',
  'the load reflects real membership');
select is((public.arena_room_load('ag-full') ->> 'viewerIsMember'), 'false',
  'and does not claim membership the viewer does not have');

-- ── 12. RLS: invitations, events and preferences stay private ──────────────
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e006","role":"authenticated"}', true);
select set_config('role', 'authenticated', true);
select is(
  (select count(*) from public.arena_backup_invites
    where caller_id <> 'ag-other' and recipient_id <> 'ag-other'),
  0::bigint, 'a member sees only invitations they are part of');
select is((select count(*) from public.arena_backup_preferences), 0::bigint,
  'a stranger cannot read anyone''s backup preference');
select is((select count(*) from public.notifications
            where entity_id = :'ag_arrive' and kind = 'arena_backup_arrival'),
  0::bigint, 'a stranger cannot read the arrival notification');
select is((select count(*) from public.profile_reputation_facets), 0::bigint,
  'a stranger cannot read anyone''s facets');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e002","role":"authenticated"}', true);
select throws_ok($$ select public.list_arena_room_events('ag-r1') $$,
  '42501', null, 'a non-member cannot read a room''s battle feed');
select is((select count(*) from public.arena_room_events), 0::bigint,
  'and the events table refuses them too');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated"}', true);
select is(
  (select count(*) from public.arena_backup_invites where caller_id <> 'ag-caller'),
  0::bigint, 'an invitation is visible only to its two parties');

-- ── 13. Private stance stays private ───────────────────────────────────────
-- A membership row is owner-only under RLS: nobody can read another person's
-- stance, even though the table is selectable.
select is(
  (select count(*) from public.arena_room_participants where profile_id <> 'ag-caller'),
  0::bigint, 'a participant row other than your own is invisible');
reset role;
select set_config('role', 'postgres', true);
select is(has_column_privilege('authenticated', 'public.arena_room_participants',
  'initial_stance', 'SELECT'), true,
  'the table is selectable; RLS is what hides a stance, not a column grant');
select is(
  (select count(*) from pg_policies
    where tablename = 'arena_room_participants' and policyname = 'an arena membership is visible to its owner'),
  1::bigint, 'and exactly one owner-only read policy guards those rows');

-- A preference is only ever changed through the caller's own row.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e003","role":"authenticated"}', true);
select is(public.set_arena_backup_preference('EVERYONE') ->> 'policy', 'EVERYONE',
  'a member can change their own preference');
reset role;
select is((select policy::text from public.arena_backup_preferences where profile_id = 'ag-expert3'),
  'FOLLOWING', 'and it cannot touch anybody else''s preference');

-- Opting out retires live calls immediately.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e004","role":"authenticated"}', true);
select public.set_arena_backup_preference('NOBODY');
reset role;
select is(
  (select count(*) from public.arena_backup_invites
    where recipient_id = 'ag-expert2' and status = 'PENDING'),
  0::bigint, 'opting out retires any live call at once');

select * from finish();
rollback;


-- ============================================================================
-- Phase 15.4 â€” Interactive Creator Live (pgTAP). Run: supabase test db
-- Covers: creator-owned lifecycle, cross-creator denial, inactive-session
-- rejection, subscriber/expired entitlement, blocks, duplicate votes, a
-- threshold that only the server can fire, exactly-once triggering, the closed
-- action vocabulary, private media and ended interactions.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

select has_function('public', 'create_creator_live_session', 'session create RPC exists');
select has_function('public', 'start_creator_live_session', 'start RPC exists');
select has_function('public', 'end_creator_live_session', 'end RPC exists');
select has_function('public', 'create_creator_live_interaction', 'interaction RPC exists');
select has_function('public', 'submit_creator_live_vote', 'vote RPC exists');
select has_function('public', 'close_creator_live_interaction', 'close RPC exists');
select has_function('public', 'creator_live_viewer_can_access', 'access predicate exists');

-- Guests cannot drive a session; the reward path is authenticated-only.
select is(has_function_privilege('anon', 'public.start_creator_live_session(text)', 'EXECUTE'), false, 'anon cannot start a session');
select is(has_function_privilege('anon', 'public.submit_creator_live_vote(text,text)', 'EXECUTE'), false, 'anon cannot vote');
select is(has_function_privilege('authenticated', 'public.submit_creator_live_vote(text,text)', 'EXECUTE'), true, 'authenticated may vote');
select is(has_table_privilege('authenticated', 'public.creator_live_votes', 'INSERT'), false, 'votes are never client-inserted');
select is(has_table_privilege('authenticated', 'public.creator_live_interactions', 'UPDATE'), false, 'interactions are never client-updated');
select is(has_table_privilege('authenticated', 'public.creator_live_sessions', 'INSERT'), false, 'sessions are never client-inserted');
select is(has_table_privilege('authenticated', 'public.creator_live_viewers', 'SELECT'), false, 'the watch roster is never readable');
select is(has_function_privilege('anon', 'public.creator_live_session_card(public.creator_live_sessions,text)', 'EXECUTE'), false, 'the raw card builder stays internal');

-- Fixtures
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000f501'),
  ('00000000-0000-0000-0000-00000000f502'),
  ('00000000-0000-0000-0000-00000000f503'),
  ('00000000-0000-0000-0000-00000000f504'),
  ('00000000-0000-0000-0000-00000000f505');

update public.profiles set id = 'lv-maya',     handle = 'lv_maya',     name = 'LV Maya',     role = 'creator' where auth_user_id = '00000000-0000-0000-0000-00000000f501';
update public.profiles set id = 'lv-fan',      handle = 'lv_fan',      name = 'LV Fan',      role = 'viewer'  where auth_user_id = '00000000-0000-0000-0000-00000000f502';
update public.profiles set id = 'lv-blocked',  handle = 'lv_blocked',  name = 'LV Blocked',  role = 'creator' where auth_user_id = '00000000-0000-0000-0000-00000000f503';
update public.profiles set id = 'lv-expired',  handle = 'lv_expired',  name = 'LV Expired',  role = 'viewer'  where auth_user_id = '00000000-0000-0000-0000-00000000f504';
update public.profiles set id = 'lv-other',    handle = 'lv_other',    name = 'LV Other',    role = 'creator' where auth_user_id = '00000000-0000-0000-0000-00000000f505';

insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, status, visibility) values
  ('lv-cover', 'lv-maya', 'public-media', 'lv/cover.png', 'image', 'image/png', 'ready', 'public'),
  ('lv-priv', 'lv-maya', 'private-media', 'lv/cover.png', 'image', 'image/png', 'ready', 'private');

insert into public.creator_vaults (id, creator_id, title, status) values
  ('lv-maya-vault', 'lv-maya', 'LV Maya World', 'active'),
  ('lv-blocked-vault', 'lv-blocked', 'LV Blocked World', 'active'),
  ('lv-other-vault', 'lv-other', 'LV Other World', 'active');

-- The blocked creator blocks the fan.
insert into public.blocks (blocker_id, blocked_id) values ('lv-blocked', 'lv-fan');

-- â”€â”€ Creator-owned lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f501","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_creator_live_session('We are filming Episode 05', 'Basement or attic?', 'FREE', null, 'lv-cover', true, true, true, true, null, 'standby') $$,
  'a creator creates their own session'
);
select throws_ok(
  $$ select public.create_creator_live_session('Private cover', '', 'FREE', null, 'lv-priv', true, true, true, true, null, 'standby') $$,
  'P0004', null, 'private media is refused as a cover'
);
select throws_ok(
  $$ select public.create_creator_live_session('Bad provider', '', 'FREE', null, null, true, true, true, true, 'http://insecure.test/live', 'hls') $$,
  'P0003', null, 'a real provider needs an https url'
);

select (public.create_creator_live_session('We are filming Episode 05', 'Basement or attic?', 'FREE', null, 'lv-cover', true, true, true, true, null, 'standby')).id as free_session_id \gset
select ((public.start_creator_live_session(:'free_session_id')).status) as started;

-- Cross-creator denial: another creator can neither start nor end it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f505","role":"authenticated"}', true);
select throws_ok(
  $$ select public.end_creator_live_session((select id from public.creator_live_sessions where creator_id = 'lv-maya' and status = 'LIVE' limit 1)) $$,
  'P0001', null, 'another creator cannot end this session'
);
select throws_ok(
  $$ select public.create_creator_live_interaction((select id from public.creator_live_sessions where creator_id = 'lv-maya' and status = 'LIVE' limit 1), 'POLL', 'Hijack', '[{"id":"a","label":"A"},{"id":"b","label":"B"}]'::jsonb, null, null, null) $$,
  'P0001', null, 'another creator cannot open an interaction'
);

-- Interactions: only enabled types, only the closed option vocabulary.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f501","role":"authenticated"}', true);
select (public.create_creator_live_interaction(:'free_session_id', 'POLL', 'Where should we film next?', '[{"id":"basement","label":"Basement"},{"id":"attic","label":"Attic"}]'::jsonb, null, null, null)).id as poll_id \gset
select (public.create_creator_live_interaction(:'free_session_id', 'CROWD_ACTION', 'Turn the lights off', null, 'LIGHTS_OFF', 3, null)).id as crowd_id \gset
select throws_ok(
  $$ select public.create_creator_live_interaction((select id from public.creator_live_sessions where creator_id = 'lv-maya' and status = 'LIVE' limit 1), 'POLL', 'Free form', '[{"id":"a b c","label":"A"}]'::jsonb, null, null, null) $$,
  'P0003', null, 'free-form option ids are impossible'
);
select throws_ok(
  $$ select public.create_creator_live_interaction((select id from public.creator_live_sessions where creator_id = 'lv-maya' and status = 'LIVE' limit 1), 'CROWD_ACTION', 'No threshold', null, 'LIGHTS_OFF', null, null) $$,
  'P0003', null, 'a crowd action needs a threshold'
);
select throws_ok(
  $$ select public.create_creator_live_interaction((select id from public.creator_live_sessions where creator_id = 'lv-maya' and status = 'LIVE' limit 1), 'POLL', 'Too many', '[{"id":"a","label":"A"},{"id":"b","label":"B"},{"id":"c","label":"C"},{"id":"d","label":"D"},{"id":"e","label":"E"}]'::jsonb, null, null, null) $$,
  'P0003', null, 'at most four options'
);


-- â”€â”€ Votes: intent only, idempotent, entitlement-aware â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f502","role":"authenticated"}', true);
select is((public.submit_creator_live_vote(:'poll_id', 'basement'))->>'accepted', 'true', 'a viewer vote is accepted');
select is((public.submit_creator_live_vote(:'poll_id', 'basement'))->>'alreadyVoted', 'true', 'replaying the same vote is idempotent');
select is((public.submit_creator_live_vote(:'poll_id', 'attic'))->>'accepted', 'false', 'a recorded vote cannot be switched');
select is(
  (select count(*) from public.creator_live_votes where interaction_id = :'poll_id' and profile_id = 'lv-fan'),
  1::bigint, 'exactly one vote row exists for the viewer'
);
-- A viewer who has not voted yet, with an option that does not exist.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f505","role":"authenticated"}', true);
select throws_ok(
  $$ select public.submit_creator_live_vote((select id from public.creator_live_interactions where type = 'POLL' and creator_id = 'lv-maya' limit 1), 'nowhere') $$,
  'P0003', null, 'an unknown option is refused'
);
select is(
  (select count(*) from public.creator_live_votes v
     join public.creator_live_interactions i on i.id = v.interaction_id
    where i.type = 'POLL' and v.profile_id = 'lv-fan'),
  1::bigint, 'a refused option never reaches the tally'
);
select is((public.touch_creator_live_viewer(:'free_session_id')) > 0, true, 'watching is counted without exposing who');

-- A creator never votes on their own interaction.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f501","role":"authenticated"}', true);
select throws_ok(
  $$ select public.submit_creator_live_vote((select id from public.creator_live_interactions where creator_id = 'lv-maya' and type = 'POLL' order by created_at desc limit 1), 'basement') $$,
  'P0001', null, 'the creator cannot vote'
);

-- â”€â”€ Threshold: the server counts, and fires exactly once â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f502","role":"authenticated"}', true);
select is((public.submit_creator_live_vote(:'crowd_id', null))->>'triggered', 'false', 'one support does not trigger a threshold of three');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f504","role":"authenticated"}', true);
select is((public.submit_creator_live_vote(:'crowd_id', null))->>'total', '2', 'counts are server-computed');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f505","role":"authenticated"}', true);
select is((public.submit_creator_live_vote(:'crowd_id', null))->>'triggered', 'true', 'the third support triggers the action');
select is(
  (public.submit_creator_live_vote(:'crowd_id', null))->>'alreadyVoted',
  'true', 'a replayed support after triggering is still idempotent'
);
select is(
  (select count(*) from public.creator_live_events where kind = 'ACTION_TRIGGERED'),
  1::bigint, 'the action fired exactly once'
);
select is(
  (select trigger_count from public.creator_live_interactions where id = :'crowd_id'),
  1, 'the trigger flag is one'
);
select is(
  (select action_kind::text from public.creator_live_interactions where id = :'crowd_id'),
  'LIGHTS_OFF', 'only the pre-approved identifier was emitted'
);


-- â”€â”€ Subscriber-only access, enforced server-side â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f501","role":"authenticated"}', true);
select (public.create_creator_live_session('Members only session', 'Behind the curtain', 'SUBSCRIBER', null, null, true, true, false, false, null, 'standby')).id as sub_session_id \gset
select ((public.start_creator_live_session(:'sub_session_id')).status) as sub_started;
select (public.create_creator_live_interaction(:'sub_session_id', 'CHOICE', 'Heavy or minimal?', '[{"id":"heavy","label":"Heavy drums"},{"id":"minimal","label":"Minimal drums"}]'::jsonb, null, null, null)).id as sub_choice_id \gset

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f502","role":"authenticated"}', true);
select is(public.get_creator_live_session(:'sub_session_id'), null, 'a non-subscriber cannot read a members session');
select throws_ok(
  $$ select public.submit_creator_live_vote((select id from public.creator_live_interactions where type = 'CHOICE' and creator_id = 'lv-maya' order by created_at desc limit 1), 'heavy') $$,
  'P0001', null, 'a non-subscriber cannot take part'
);

select public.vault_grant_test_subscription('lv-maya-vault', 'lv-fan', 30);
select is((public.get_creator_live_session(:'sub_session_id') ->> 'viewerAccess'), 'true', 'an active subscriber reaches the session');
select is((public.submit_creator_live_vote(:'sub_choice_id', 'heavy'))->>'accepted', 'true', 'an active subscriber can take part');

-- An entitlement that already lapsed must be denied.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f504","role":"authenticated"}', true);
insert into public.vault_subscriptions (id, subscriber_id, vault_id, status, started_at, current_period_end)
values ('lv-exp-sub', 'lv-expired', 'lv-maya-vault', 'active', now() - interval '40 days', now() - interval '10 days');
select is(public.get_creator_live_session(:'sub_session_id'), null, 'an expired subscription cannot read the session');
select throws_ok(
  $$ select public.submit_creator_live_vote((select id from public.creator_live_interactions where type = 'CHOICE' and creator_id = 'lv-maya' order by created_at desc limit 1), 'heavy') $$,
  'P0001', null, 'an expired subscription cannot take part'
);

-- â”€â”€ Blocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f503","role":"authenticated"}', true);
select (public.create_creator_live_session('Blocked broadcast', '', 'FREE', null, null, true, true, false, false, null, 'standby')).id as blocked_session_id \gset
select ((public.start_creator_live_session(:'blocked_session_id')).status) as blocked_started;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f502","role":"authenticated"}', true);
select is(public.get_creator_live_session(:'blocked_session_id'), null, 'a blocked creator is invisible');
select is(public.list_creator_live_sessions('lv-blocked', 10), '[]'::jsonb, 'a blocked creator never lists');

-- â”€â”€ Ending a session closes the floor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f501","role":"authenticated"}', true);
select ((public.end_creator_live_session(:'free_session_id')).status) as ended_status;
select is(
  (select count(*) from public.creator_live_interactions where session_id = :'free_session_id' and status = 'OPEN'),
  0::bigint, 'ending a session closes every interaction'
);
select is(
  ((public.close_creator_live_interaction(:'poll_id'))).status::text,
  'CLOSED', 'closing an interaction is idempotent'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f505","role":"authenticated"}', true);
select throws_ok(
  $$ select public.submit_creator_live_vote((select id from public.creator_live_interactions where type = 'POLL' and creator_id = 'lv-maya' limit 1), 'attic') $$,
  'P0004', null, 'an ended session rejects participation'
);

-- The viewer-safe event log replays after a reconnect, and the report path
-- reuses the shared pipeline.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f502","role":"authenticated"}', true);
select is(jsonb_array_length(public.creator_live_events_since(:'free_session_id', null, 60)) > 0, true, 'the event log is replayable');
select is(
  (public.report_creator_live_session(:'sub_session_id', 'spam', null)) like 'rpt_%',
  true, 'a visible session can be reported'
);
select throws_ok(
  $$ select public.report_creator_live_session('cls_missing', 'spam', null) $$,
  'P0002', null, 'an invisible session cannot be reported'
);

select * from finish();
rollback;

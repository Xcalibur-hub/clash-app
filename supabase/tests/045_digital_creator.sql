-- ============================================================================
-- Phase 15.5B — Digital Creator (pgTAP). Run: supabase test db
-- Covers: creator-only connection, consent before enabling, cross-creator
-- isolation, secret/reference containment, session gating (disabled, blocked,
-- subscriber, expired), disconnect, impersonation, text fallback and rate
-- limits — plus the rule that an avatar can never widen Creator AI knowledge.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

select has_function('public', 'set_creator_digital_version', 'connection RPC exists');
select has_function('public', 'disconnect_creator_digital_version', 'disconnect RPC exists');
select has_function('public', 'start_digital_creator_session', 'session RPC exists');
select has_function('public', 'end_digital_creator_session', 'end session RPC exists');
select has_function('public', 'digital_creator_session_card', 'session card RPC exists');

-- ── Containment: no secret, no client write, no client read of references ──
select hasnt_column('public', 'creator_ai_profiles', 'provider_api_key', 'no provider key column exists');
select hasnt_column('public', 'creator_ai_profiles', 'avatar_provider_secret', 'no provider secret column exists');
select is(has_column_privilege('authenticated', 'public.creator_ai_profiles', 'avatar_external_id', 'SELECT'), false, 'external references are not client-readable');
select is(has_column_privilege('authenticated', 'public.creator_ai_profiles', 'likeness_consent_at', 'SELECT'), false, 'consent rows are not client-readable');
select is(has_table_privilege('authenticated', 'public.digital_creator_sessions', 'INSERT'), false, 'sessions are never client-inserted');
select is(has_table_privilege('authenticated', 'public.digital_creator_sessions', 'UPDATE'), false, 'sessions are never client-updated');
select is(has_function_privilege('authenticated', 'public.creator_ai_finish_turn(text,text,text,text)', 'EXECUTE'), false, 'a client still cannot write an AI reply');
select is(has_function_privilege('anon', 'public.start_digital_creator_session(text,text)', 'EXECUTE'), false, 'anon cannot open a digital session');

-- ── Fixtures ───────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000b701'),
  ('00000000-0000-0000-0000-00000000b702'),
  ('00000000-0000-0000-0000-00000000b703'),
  ('00000000-0000-0000-0000-00000000b704'),
  ('00000000-0000-0000-0000-00000000b705'),
  ('00000000-0000-0000-0000-00000000b706');

update public.profiles set id = 'dg-maya',    handle = 'dg_maya',    name = 'DG Maya',    role = 'creator' where auth_user_id = '00000000-0000-0000-0000-00000000b701';
update public.profiles set id = 'dg-other',   handle = 'dg_other',   name = 'DG Other',   role = 'creator' where auth_user_id = '00000000-0000-0000-0000-00000000b702';
update public.profiles set id = 'dg-fan',     handle = 'dg_fan',     name = 'DG Fan',     role = 'viewer'  where auth_user_id = '00000000-0000-0000-0000-00000000b703';
update public.profiles set id = 'dg-expired', handle = 'dg_expired', name = 'DG Expired', role = 'viewer'  where auth_user_id = '00000000-0000-0000-0000-00000000b704';
update public.profiles set id = 'dg-blocked', handle = 'dg_blocked', name = 'DG Blocked', role = 'creator' where auth_user_id = '00000000-0000-0000-0000-00000000b705';
update public.profiles set id = 'dg-rate',    handle = 'dg_rate',    name = 'DG Rate',    role = 'viewer'  where auth_user_id = '00000000-0000-0000-0000-00000000b706';

insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, status, visibility) values
  ('dg-portrait', 'dg-maya', 'public-media', 'dg/portrait.png', 'image', 'image/png', 'ready', 'public'),
  ('dg-private', 'dg-maya', 'private-media', 'dg/portrait.png', 'image', 'image/png', 'ready', 'private'),
  ('dg-sub-media', 'dg-maya', 'private-media', 'dg/sub.png', 'image', 'image/png', 'ready', 'private');

insert into public.creator_vaults (id, creator_id, title, status) values
  ('dg-maya-vault', 'dg-maya', 'DG Maya World', 'active'),
  ('dg-other-vault', 'dg-other', 'DG Other World', 'active'),
  ('dg-blocked-vault', 'dg-blocked', 'DG Blocked World', 'active');

insert into public.vault_drops
  (id, vault_id, creator_id, caption, media_object_id, access_level, status, published_at, expires_at)
values
  ('dg-drop-free', 'dg-maya-vault', 'dg-maya', 'Free cut', 'dg-portrait', 'free', 'published',
   now() - interval '1 day', now() + interval '6 days'),
  ('dg-drop-sub', 'dg-maya-vault', 'dg-maya', 'Members cut', 'dg-sub-media', 'subscriber', 'published',
   now() - interval '1 day', now() + interval '6 days');

insert into public.blocks (blocker_id, blocked_id) values ('dg-blocked', 'dg-fan');

-- ── Connection is creator-only and requires explicit consent ───────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b703","role":"authenticated"}', true);
select throws_ok(
  $$ select public.set_creator_digital_version('demo_avatar', 'model-1', null, 'Digital Maya', null, true, false, true, true) $$,
  'P0006', null, 'a viewer without a vault cannot connect an avatar'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b701","role":"authenticated"}', true);
select is(
  (public.upsert_creator_ai_profile('DG Maya AI', 'An AI version.', '', '', 'FREE', '[]'::jsonb, true, 'dg-portrait'))->>'enabled',
  'true', 'the creator has a Creator AI to extend'
);
select throws_ok(
  $$ select public.set_creator_digital_version('demo_avatar', 'model-1', null, 'Digital Maya', null, true, false, true, false) $$,
  'P0003', null, 'enabling without confirming rights is refused'
);
select throws_ok(
  $$ select public.set_creator_digital_version('none', null, null, 'Digital Maya', null, true, false, true, true) $$,
  'P0003', null, 'an avatar needs a connected provider'
);
select throws_ok(
  $$ select public.set_creator_digital_version('demo_avatar', null, null, 'Digital Maya', null, false, false, true, true) $$,
  'P0003', null, 'a provider connection needs a model reference'
);
select throws_ok(
  $$ select public.set_creator_digital_version('demo_avatar', 'model-1', null, 'Digital Maya', 'dg-private', true, false, true, true) $$,
  'P0004', null, 'private artwork is refused for the avatar preview'
);
select throws_ok(
  $$ select public.set_creator_digital_version('Demo Avatar!', 'model-1', null, 'Digital Maya', null, true, false, true, true) $$,
  'P0003', null, 'an unknown provider slug shape is refused'
);

select is(
  (public.set_creator_digital_version('demo_avatar', 'model-1', 'voice-1', 'Digital Maya', 'dg-portrait', true, true, true, true)) #> '{digital,connected}'::text[],
  'true'::jsonb, 'the creator connects their own authorized model and voice'
);
select is(
  (public.get_my_creator_ai()) #> '{digital,consentVersion}'::text[],
  '"v1"'::jsonb, 'consent wording is recorded'
);
select ok(
  (public.get_my_creator_ai()) #> '{digital,consentAt}' is not null,
  'consent is timestamped'
);

-- Pointing at a different model demands a fresh confirmation.
select throws_ok(
  $$ select public.set_creator_digital_version('demo_avatar', 'model-2', null, 'Digital Maya', null, true, false, true, false) $$,
  'P0003', null, 'a new model reference requires a new confirmation'
);

-- ── Cross-creator isolation ───────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b702","role":"authenticated"}', true);
select is(
  (public.upsert_creator_ai_profile('DG Other AI', '', '', '', 'FREE', '[]'::jsonb, true, null))->>'enabled',
  'true', 'another creator configures their own AI'
);
select is(
  (public.set_creator_digital_version('other_provider', 'other-model', null, 'Digital Other', null, true, false, true, true))#> '{digital,avatarExternalId}'::text[],
  '"other-model"'::jsonb, 'another creator connects their own model'
);
select is(
  (select avatar_external_id from public.creator_ai_profiles where creator_id = 'dg-maya'),
  'model-1', 'a foreign creator cannot touch this model reference'
);
select is(
  (select avatar_provider from public.creator_ai_profiles where creator_id = 'dg-maya'),
  'demo_avatar', 'a foreign creator cannot touch this provider'
);


-- ── The viewer card carries capability, never provider internals ───────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b703","role":"authenticated"}', true);
select is((public.get_creator_ai('dg-maya') #> '{digital,available}'), 'true'::jsonb, 'the digital version is available to an eligible viewer');
select is((public.get_creator_ai('dg-maya') #> '{digital,preferredMode}'), '"AVATAR"'::jsonb, 'the preferred mode follows the enabled capability');
select is((public.get_creator_ai('dg-maya') #> '{digital,displayName}'), '"Digital Maya"'::jsonb, 'the digital name is disclosed');
select is((public.get_creator_ai('dg-maya') ? 'digital'), true, 'the digital block is present');
select is((public.get_creator_ai('dg-maya')::text like '%demo_avatar%'), false, 'the provider slug never reaches a viewer');
select is((public.get_creator_ai('dg-maya')::text like '%model-1%'), false, 'the external model reference never reaches a viewer');
select is((public.get_creator_ai('dg-maya')::text like '%voice-1%'), false, 'the voice reference never reaches a viewer');

-- ── Sessions: explicit entry, bounded, viewer-safe ─────────────────────────
select (public.start_digital_creator_session('dg-maya', 'AVATAR') ->> 'sessionId') as dg_session \gset
select is(
  (public.digital_creator_session_card(:'dg_session') ->> 'active'),
  'true', 'an avatar session opens for an entitled viewer'
);
select is(
  (public.digital_creator_session_card(:'dg_session')::text like '%demo_avatar%'),
  false, 'a session handle carries no provider reference'
);
select is(
  (public.digital_creator_session_card(:'dg_session') ?| array['apiKey', 'secret', 'token', 'provider']),
  false, 'a session handle carries no credential material'
);
select is(
  (public.start_digital_creator_session('dg-maya', 'AVATAR') ->> 'sessionId') = :'dg_session',
  false, 'a second entry replaces the previous handle'
);
select is(
  (select count(*) from public.digital_creator_sessions
    where creator_id = 'dg-maya' and profile_id = 'dg-fan' and status = 'ACTIVE'),
  1::bigint, 'only one handle stays open per viewer'
);
select (select id from public.digital_creator_sessions
         where creator_id = 'dg-maya' and profile_id = 'dg-fan' and status = 'ACTIVE') as dg_active \gset
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b706","role":"authenticated"}', true);
select is(
  public.digital_creator_session_card(:'dg_active'),
  null, 'another viewer cannot read a session handle'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b703","role":"authenticated"}', true);
select is(public.end_digital_creator_session(:'dg_active'), true, 'the visitor ends their own session');
select is(
  (public.digital_creator_session_card(:'dg_active') ->> 'active'),
  'false', 'an ended session is no longer active'
);

-- The owner cannot hijack their own room as a visitor.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b701","role":"authenticated"}', true);
select throws_ok(
  $$ select public.start_digital_creator_session('dg-maya', 'AVATAR') $$,
  'P0001', null, 'a creator cannot open a fan session on their own digital version'
);

-- ── Text fallback survives every avatar failure ────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b703","role":"authenticated"}', true);
select is(
  (public.start_digital_creator_session('dg-maya', 'TEXT') ->> 'mode'),
  'TEXT', 'text mode always opens'
);
select is(
  (public.start_digital_creator_session('dg-maya', 'TEXT') ->> 'textFallback'),
  'true', 'text fallback is reported as available'
);
select throws_ok(
  $$ select public.start_digital_creator_session('dg-maya', 'ERROR') $$,
  'P0003', null, 'an unknown mode is refused'
);

-- Disabling the avatar stops new avatar sessions but not text.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b701","role":"authenticated"}', true);
select is(
  (public.set_creator_digital_version('demo_avatar', 'model-1', 'voice-1', 'Digital Maya', 'dg-portrait', false, false, true, false))#> '{digital,avatarEnabled}'::text[],
  'false'::jsonb, 'the creator can switch the avatar off independently'
);

-- ── Entitlement is reused, never re-invented ───────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b701","role":"authenticated"}', true);
select is(
  (public.set_creator_digital_version('demo_avatar', 'model-1', 'voice-1', 'Digital Maya', 'dg-portrait', true, true, true, false))#> '{digital,avatarEnabled}'::text[],
  'true'::jsonb, 'the avatar can be re-enabled under the recorded consent'
);
select is(
  (public.upsert_creator_ai_profile('DG Maya AI', '', '', '', 'SUBSCRIBER', '[]'::jsonb, true, 'dg-portrait'))->>'access',
  'SUBSCRIBER', 'the AI becomes member-only'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b703","role":"authenticated"}', true);
select is(public.get_creator_ai('dg-maya') #> '{digital,available}', 'true'::jsonb, 'the digital version still advertises itself');
select throws_ok(
  $$ select public.start_digital_creator_session('dg-maya', 'AVATAR') $$,
  'P0001', null, 'an avatar cannot bypass the subscriber entitlement'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b704","role":"authenticated"}', true);
insert into public.vault_subscriptions (id, subscriber_id, vault_id, status, started_at, current_period_end)
values ('dg-exp-sub', 'dg-expired', 'dg-maya-vault', 'active', now() - interval '40 days', now() - interval '10 days');
select throws_ok(
  $$ select public.start_digital_creator_session('dg-maya', 'AVATAR') $$,
  'P0001', null, 'an expired subscriber cannot open a digital session'
);

select public.vault_grant_test_subscription('dg-maya-vault', 'dg-fan', 30);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b703","role":"authenticated"}', true);
select (public.start_digital_creator_session('dg-maya', 'AVATAR') ->> 'sessionId') as dg_sub_session \gset
select is(
  (public.digital_creator_session_card(:'dg_sub_session')::text like '%knowledge%'),
  false, 'a rendering session carries no knowledge of its own'
);
select is(
  jsonb_path_exists(
    public.creator_ai_begin_turn(
      (public.start_creator_ai_conversation('dg-maya') ->> 'conversationId'),
      'Anything new?'
    ),
    '$.knowledge'
  ),
  true, 'generation still flows through the existing Creator AI pipeline'
);

-- ── Blocks beat a free AI too ─────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b705","role":"authenticated"}', true);
select is(
  (public.upsert_creator_ai_profile('DG Blocked AI', '', '', '', 'FREE', '[]'::jsonb, true, null))->>'enabled',
  'true', 'a blocked creator has their own AI'
);
select is(
  (public.set_creator_digital_version('blocked_provider', 'blocked-model', null, 'Digital Blocked', null, true, false, true, true))#> '{digital,connected}'::text[],
  'true'::jsonb, 'and their own connected digital version'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b703","role":"authenticated"}', true);
select is(public.get_creator_ai('dg-blocked') ->> 'viewerAccess', 'false', 'a block closes the AI room');
select throws_ok(
  $$ select public.start_digital_creator_session('dg-blocked', 'AVATAR') $$,
  'P0001', null, 'a block closes digital sessions'
);

-- ── Disconnect stops future sessions and kills live ones ──────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b701","role":"authenticated"}', true);
select is(
  (public.disconnect_creator_digital_version())#> '{digital,provider}'::text[],
  '"none"'::jsonb, 'disconnecting clears the provider'
);
select is(
  (select count(*) from public.digital_creator_sessions where creator_id = 'dg-maya' and status = 'ACTIVE'),
  0::bigint, 'disconnecting ends live sessions'
);
select is(
  (select likeness_consent_at is null from public.creator_ai_profiles where creator_id = 'dg-maya'),
  true, 'consent is cleared with the connection'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b703","role":"authenticated"}', true);
select throws_ok(
  $$ select public.start_digital_creator_session('dg-maya', 'AVATAR') $$,
  'P0004', null, 'a disconnected digital version cannot open a session'
);
select is(
  (public.start_digital_creator_session('dg-maya', 'TEXT') ->> 'active'),
  'true', 'text AI is untouched by a disconnect'
);
select is(public.get_creator_ai('dg-maya') #> '{digital,available}', 'false'::jsonb, 'a disconnected digital version reports unavailable');

-- ── Rate limits bound session churn ───────────────────────────────────────
select public.vault_grant_test_subscription('dg-maya-vault', 'dg-rate', 30);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b706","role":"authenticated"}', true);
do $$
begin
  for i in 1..30 loop
    perform public.start_digital_creator_session('dg-maya', 'TEXT');
  end loop;
end $$;
select throws_ok(
  $$ select public.start_digital_creator_session('dg-maya', 'TEXT') $$,
  'P0001', null, 'the session rate limit is enforced server-side'
);

select * from finish();
rollback;


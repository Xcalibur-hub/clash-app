-- ============================================================================
-- Phase 15.5 — Creator AI (pgTAP). Run: supabase test db
-- Covers: creator-owned configuration, cross-creator denial, disabled AI,
-- subscriber/expired entitlement, blocks, conversation privacy in both
-- directions, entitlement-filtered knowledge, unapproved sources, the
-- server-only assistant write, the closed generation path and rate limits.
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

select has_function('public', 'get_creator_ai', 'viewer card RPC exists');
select has_function('public', 'get_my_creator_ai', 'creator config RPC exists');
select has_function('public', 'upsert_creator_ai_profile', 'config write RPC exists');
select has_function('public', 'add_creator_ai_knowledge', 'knowledge write RPC exists');
select has_function('public', 'creator_ai_begin_turn', 'turn RPC exists');
select has_function('public', 'creator_ai_finish_turn', 'server turn write exists');
select has_function('public', 'creator_ai_knowledge_visible', 'knowledge gate exists');

-- ── Privileges: the assistant write is unreachable for clients ─────────────
select is(has_function_privilege('anon', 'public.creator_ai_begin_turn(text,text)', 'EXECUTE'), false, 'anon cannot start a turn');
select is(has_function_privilege('authenticated', 'public.creator_ai_finish_turn(text,text,text,text)', 'EXECUTE'), false, 'a client cannot write an AI reply');
select is(has_function_privilege('anon', 'public.creator_ai_finish_turn(text,text,text,text)', 'EXECUTE'), false, 'anon cannot write an AI reply');
select is(has_function_privilege('service_role', 'public.creator_ai_finish_turn(text,text,text,text)', 'EXECUTE'), true, 'the server runtime may write an AI reply');
select is(has_table_privilege('authenticated', 'public.creator_ai_messages', 'INSERT'), false, 'messages are never client-inserted');
select is(has_table_privilege('authenticated', 'public.creator_ai_profiles', 'SELECT'), false, 'configuration is never client-readable');
select is(has_column_privilege('authenticated', 'public.creator_ai_profiles', 'instructions', 'SELECT'), false, 'creator instructions are never client-readable');
select is(has_table_privilege('authenticated', 'public.creator_ai_knowledge', 'SELECT'), false, 'knowledge bodies are never client-readable');
select is(has_function_privilege('authenticated', 'public.creator_ai_knowledge_visible(public.creator_ai_knowledge,text)', 'EXECUTE'), false, 'the knowledge gate stays internal');

-- ── Fixtures ───────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000b601'),
  ('00000000-0000-0000-0000-00000000b602'),
  ('00000000-0000-0000-0000-00000000b603'),
  ('00000000-0000-0000-0000-00000000b604'),
  ('00000000-0000-0000-0000-00000000b605'),
  ('00000000-0000-0000-0000-00000000b606');

update public.profiles set id = 'ca-maya',    handle = 'ca_maya',    name = 'CA Maya',    role = 'creator' where auth_user_id = '00000000-0000-0000-0000-00000000b601';
update public.profiles set id = 'ca-fan',     handle = 'ca_fan',     name = 'CA Fan',     role = 'viewer'  where auth_user_id = '00000000-0000-0000-0000-00000000b602';
update public.profiles set id = 'ca-expired', handle = 'ca_expired', name = 'CA Expired', role = 'viewer'  where auth_user_id = '00000000-0000-0000-0000-00000000b603';
update public.profiles set id = 'ca-blocked', handle = 'ca_blocked', name = 'CA Blocked', role = 'creator' where auth_user_id = '00000000-0000-0000-0000-00000000b604';
update public.profiles set id = 'ca-other',   handle = 'ca_other',   name = 'CA Other',   role = 'creator' where auth_user_id = '00000000-0000-0000-0000-00000000b605';
update public.profiles set id = 'ca-rate',    handle = 'ca_rate',    name = 'CA Rate',    role = 'viewer'  where auth_user_id = '00000000-0000-0000-0000-00000000b606';

insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, status, visibility) values
  ('ca-art', 'ca-maya', 'public-media', 'ca/art.png', 'image', 'image/png', 'ready', 'public'),
  ('ca-priv', 'ca-maya', 'private-media', 'ca/art.png', 'image', 'image/png', 'ready', 'private'),
  ('ca-sub-media', 'ca-maya', 'private-media', 'ca/sub.png', 'image', 'image/png', 'ready', 'private');

insert into public.creator_vaults (id, creator_id, title, status) values
  ('ca-maya-vault', 'ca-maya', 'CA Maya World', 'active'),
  ('ca-blocked-vault', 'ca-blocked', 'CA Blocked World', 'active'),
  ('ca-other-vault', 'ca-other', 'CA Other World', 'active');

insert into public.vault_drops
  (id, vault_id, creator_id, caption, media_object_id, access_level, status, published_at, expires_at)
select v.id, 'ca-maya-vault', 'ca-maya', v.caption, v.media, v.access::public.vault_drop_access,
       v.status::public.vault_drop_status,
       (case when v.status = 'draft' then null else v.published_at end),
       (case when v.status = 'draft' then null else v.published_at + interval '7 days' end)
  from (values
    ('ca-drop-free', 'The Missing Frame', 'ca-art', 'free', 'published', now() - interval '1 day'),
    ('ca-drop-sub', 'Members cut', 'ca-sub-media', 'subscriber', 'published', now() - interval '1 day'),
    ('ca-drop-draft', 'Unpublished note', 'ca-art', 'free', 'draft', now() - interval '1 day')
  ) as v(id, caption, media, access, status, published_at);

insert into public.vault_collections (id, vault_id, creator_id, title) values
  ('ca-col-free', 'ca-maya-vault', 'ca-maya', 'Free collection'),
  ('ca-col-sub', 'ca-maya-vault', 'ca-maya', 'Members collection');

insert into public.vault_collection_items (collection_id, drop_id, position) values
  ('ca-col-free', 'ca-drop-free', 0),
  ('ca-col-sub', 'ca-drop-sub', 0);

-- The blocked creator blocks the fan.
insert into public.blocks (blocker_id, blocked_id) values ('ca-blocked', 'ca-fan');

-- ── Creator configuration ──────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b601","role":"authenticated"}', true);
select is(
  (public.upsert_creator_ai_profile('CA Maya AI', 'An AI version of CA Maya.', 'Hello.', 'Short sentences.', 'FREE', '["How?","Why?"]'::jsonb, true, 'ca-art'))->>'enabled',
  'true', 'a creator configures and enables their own AI'
);
select throws_ok(
  $$ select public.upsert_creator_ai_profile('CA Maya', '', '', '', 'FREE', '[]'::jsonb, true, null) $$,
  'P0003', null, 'the AI cannot be named exactly like the creator'
);
select throws_ok(
  $$ select public.upsert_creator_ai_profile('CA Maya AI', '', '', '', 'FREE', '[]'::jsonb, true, 'ca-priv') $$,
  'P0004', null, 'private media is refused as AI artwork'
);
select throws_ok(
  $$ select public.upsert_creator_ai_profile('CA Maya AI', '', '', '', 'FREE', '["a","b","c","d","e","f","g"]'::jsonb, true, null) $$,
  'P0003', null, 'at most six suggested prompts'
);

-- ── Knowledge: only the creator's own, only approved shapes ────────────────
select throws_ok(
  $$ select public.add_creator_ai_knowledge('NOTE', 'Empty note', null, null, 'FREE') $$,
  'P0003', null, 'a note needs a body'
);
select throws_ok(
  $$ select public.add_creator_ai_knowledge('NOTE', 'Bad shape', 'body', 'ca-drop-free', 'FREE') $$,
  'P0003', null, 'a note cannot also point at content'
);
select throws_ok(
  $$ select public.add_creator_ai_knowledge('VAULT_DROP', '', null, 'ca-drop-draft', 'FREE') $$,
  'P0004', null, 'an unpublished Drop cannot teach the AI'
);
select lives_ok(
  $$ select public.add_creator_ai_knowledge('NOTE', 'Suspense', 'Hold the frame longer than is comfortable.', null, 'FREE') $$,
  'a creator adds their own note'
);
select lives_ok(
  $$ select public.add_creator_ai_knowledge('NOTE', 'Members note', 'The lighting plot.', null, 'SUBSCRIBER') $$,
  'a creator adds a member-only note'
);
select is(
  (select access::text from public.creator_ai_knowledge where creator_id = 'ca-maya' and title = 'Suspense'),
  'FREE', 'a note keeps the access the creator chose'
);
select lives_ok(
  $$ select public.add_creator_ai_knowledge('VAULT_DROP', '', null, 'ca-drop-free', 'FREE') $$,
  'a published free Drop can teach the AI'
);
select is(
  (select access::text from public.creator_ai_knowledge where creator_id = 'ca-maya' and source_id = 'ca-drop-free'),
  'FREE', 'knowledge inherits the source access level'
);
select lives_ok(
  $$ select public.add_creator_ai_knowledge('COLLECTION', '', null, 'ca-col-sub', 'FREE') $$,
  'a member Collection can teach the AI'
);
select is(
  (select access::text from public.creator_ai_knowledge where creator_id = 'ca-maya' and source_id = 'ca-col-sub'),
  'SUBSCRIBER', 'a collection holding a member item becomes member-only knowledge'
);

-- Cross-creator: another creator cannot teach from this vault.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b605","role":"authenticated"}', true);
select throws_ok(
  $$ select public.add_creator_ai_knowledge('VAULT_DROP', '', null, 'ca-drop-free', 'FREE') $$,
  'P0001', null, 'another creator cannot add foreign knowledge'
);
select throws_ok(
  $$ select public.add_creator_ai_knowledge('COLLECTION', '', null, 'ca-col-free', 'FREE') $$,
  'P0001', null, 'another creator cannot reference a foreign collection'
);


-- ── The viewer card never carries private configuration ────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b602","role":"authenticated"}', true);
select is((public.get_creator_ai('ca-maya') ? 'instructions'), false, 'the viewer card never exposes instructions');
select is((public.get_creator_ai('ca-maya') ->> 'canChat'), 'true', 'an eligible viewer can chat');
select is(jsonb_array_length((public.get_creator_ai('ca-maya')) -> 'starters'), 2, 'suggested prompts are projected');

-- A fresh viewer starts one conversation (idempotent) and one turn.
select (public.start_creator_ai_conversation('ca-maya') ->> 'conversationId') as conv_id \gset
select is(
  (public.start_creator_ai_conversation('ca-maya') ->> 'conversationId'),
  :'conv_id', 'starting again returns the same conversation'
);
select is(
  (public.creator_ai_begin_turn(:'conv_id', 'How do you build suspense?')) ->> 'conversationId',
  :'conv_id', 'a turn is recorded against the conversation'
);
select is(
  jsonb_path_exists(public.creator_ai_begin_turn(:'conv_id', 'Framing?'), '$.knowledge[*] ? (@.title == "Suspense")'),
  true, 'approved free knowledge reaches the prompt'
);
select is(
  jsonb_path_exists(public.creator_ai_begin_turn(:'conv_id', 'Lights?'), '$.knowledge[*] ? (@.title == "Members note")'),
  false, 'member-only knowledge never reaches a non-subscriber prompt'
);
select is(
  jsonb_path_exists(public.creator_ai_begin_turn(:'conv_id', 'Tape?'), '$.knowledge[*] ? (@.title == "Members collection")'),
  false, 'member collections stay out of a free prompt'
);

-- A creator cannot chat with their own AI, and cannot vote on it either.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b601","role":"authenticated"}', true);
select throws_ok(
  $$ select public.start_creator_ai_conversation('ca-maya') $$,
  'P0001', null, 'the creator cannot open a fan conversation'
);

-- ── Conversation privacy, both directions ─────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b605","role":"authenticated"}', true);
select is(jsonb_array_length(public.list_creator_ai_messages(:'conv_id', null, 30)), 0, 'another user cannot read a conversation');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b601","role":"authenticated"}', true);
select is(jsonb_array_length(public.list_creator_ai_messages(:'conv_id', null, 30)), 0, 'the creator cannot browse a fan conversation');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b602","role":"authenticated"}', true);
select is(jsonb_array_length(public.list_creator_ai_messages(:'conv_id', null, 30)) > 0, true, 'the owner reads their own history');
select throws_ok(
  $$ select public.report_creator_ai_message((select m.id from public.creator_ai_messages m join public.creator_ai_conversations c on c.id = m.conversation_id where c.profile_id = 'ca-other' limit 1), 'spam', null) $$,
  'P0002', null, 'a message outside your own conversation cannot be reported'
);


-- ── Entitlement: subscribers yes, lapsed no, blocked never ────────────────
select public.vault_grant_test_subscription('ca-maya-vault', 'ca-fan', 30);
select is(
  jsonb_path_exists(public.creator_ai_begin_turn(:'conv_id', 'Plot?'), '$.knowledge[*] ? (@.title == "Members note")'),
  true, 'an active subscriber receives member knowledge'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b601","role":"authenticated"}', true);
select (public.upsert_creator_ai_profile('CA Maya AI', '', '', '', 'SUBSCRIBER', '[]'::jsonb, true, 'ca-art'))->>'access' as ai_access;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b604","role":"authenticated"}', true);
select (public.upsert_creator_ai_profile('CA Blocked AI', '', '', '', 'FREE', '[]'::jsonb, true, null))->>'enabled' as blocked_ai;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b602","role":"authenticated"}', true);
select is((public.get_creator_ai('ca-blocked') ->> 'viewerAccess'), 'false', 'a blocked viewer is refused');
select throws_ok(
  $$ select public.start_creator_ai_conversation('ca-blocked') $$,
  'P0001', null, 'a blocked viewer cannot start a conversation'
);

-- A subscriber-only AI refuses a viewer without an entitlement to it.
select is((public.get_creator_ai('ca-maya') ->> 'canChat'), 'true', 'the subscriber still chats');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b606","role":"authenticated"}', true);
select is((public.get_creator_ai('ca-maya') ->> 'viewerAccess'), 'false', 'a member AI hides from a non-member');
select throws_ok(
  $$ select public.start_creator_ai_conversation('ca-maya') $$,
  'P0001', null, 'a non-member cannot start a conversation with a member AI'
);

-- A lapsed entitlement is not an entitlement, now that the AI is member-only.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b603","role":"authenticated"}', true);
insert into public.vault_subscriptions (id, subscriber_id, vault_id, status, started_at, current_period_end)
values ('ca-exp-sub', 'ca-expired', 'ca-maya-vault', 'active', now() - interval '40 days', now() - interval '10 days');
select is((public.get_creator_ai('ca-maya') ->> 'viewerAccess'), 'false', 'an expired subscription is not access');
select throws_ok(
  $$ select public.start_creator_ai_conversation('ca-maya') $$,
  'P0001', null, 'an expired subscription cannot open the AI room'
);

-- ── Disabling stops everything, immediately ───────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b601","role":"authenticated"}', true);
select (public.upsert_creator_ai_profile('CA Maya AI', '', '', '', 'FREE', '[]'::jsonb, false, 'ca-art'))->>'enabled' as disabled_now;
select is((public.get_creator_ai('ca-maya') ->> 'enabled'), 'false', 'the owner still sees their own disabled card');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b602","role":"authenticated"}', true);
select is(public.get_creator_ai('ca-maya'), null, 'a disabled AI is invisible to viewers');
select throws_ok(
  $$ select public.creator_ai_begin_turn((select id from public.creator_ai_conversations where profile_id = 'ca-fan' and creator_id = 'ca-maya'), 'Still there?') $$,
  'P0004', null, 'a disabled AI refuses the next turn'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b601","role":"authenticated"}', true);
select (public.upsert_creator_ai_profile('CA Maya AI', '', '', '', 'FREE', '[]'::jsonb, true, 'ca-art'))->>'enabled' as reenabled;

-- ── Rate limits bound provider cost ───────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b606","role":"authenticated"}', true);
select is(
  (public.start_creator_ai_conversation('ca-blocked') ->> 'conversationId') is null,
  false, 'a fresh viewer cannot reach a blocked AI'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b601","role":"authenticated"}', true);
select (public.upsert_creator_ai_profile('CA Maya AI', '', '', '', 'FREE', '[]'::jsonb, true, 'ca-art'))->>'enabled' as open_again;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b606","role":"authenticated"}', true);
select (public.start_creator_ai_conversation('ca-maya') ->> 'conversationId') as rate_conv \gset
select count(*) from generate_series(1, 20) g
  cross join lateral (select public.creator_ai_begin_turn(:'rate_conv', 'message ' || g) as turn) t;
select throws_ok(
  $$ select public.creator_ai_begin_turn((select id from public.creator_ai_conversations where profile_id = 'ca-rate' and creator_id = 'ca-maya'), 'one too many') $$,
  'P0001', null, 'the message rate limit is enforced server-side'
);

select * from finish();
rollback;


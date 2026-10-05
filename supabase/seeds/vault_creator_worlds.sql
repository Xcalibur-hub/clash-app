-- ============================================================================
-- CLASH · Vault Creator World fixtures (LOCAL ONLY)
-- ----------------------------------------------------------------------------
-- Synthetic Creator Worlds so Vault Following / Discover are testable locally.
-- Maya / Leo / Aria / Noah — clearly fake identities (devfx_vw_*).
--
-- SAFETY
--   · Not a migration — never applied by `supabase db push` / hosted deploy.
--   · Wired only into local `[db.seed]` and `npm run supabase:seed:clash-dev`.
--   · Idempotent: wipes the `devfx_vw_*` namespace, then re-inserts.
--   · Does not subscribe the local dev account to anything.
--   · Follows Maya + Leo from local_dev only (Following cold-start demo).
-- ============================================================================

begin;

do $$
declare
  v_addr inet := inet_server_addr();
begin
  if v_addr is not null
     and host(v_addr) not in ('127.0.0.1', '::1')
     and host(v_addr) not like '172.%'
     and host(v_addr) not like '10.%'
  then
    raise exception
      'vault_creator_worlds: refused — server address % is not a local/dev network',
      v_addr;
  end if;
end $$;

-- ── Wipe previous vault-world fixture namespace ──────────────────────────────
delete from public.vault_community_replies
 where community_id like 'devfx_vw_%' or id like 'devfx_vw_%';
-- Phase 15.3 — Creator World Drop fixtures + their claims
delete from public.world_drop_claims
 where drop_id like 'wd_devfx_%' or profile_id like 'devfx_vw_%';
delete from public.world_drops
 where id like 'wd_devfx_%' or creator_id like 'devfx_vw_%';
-- Phase 15.4 — Interactive Live fixtures
delete from public.creator_live_events where session_id like 'cls_devfx_%';
delete from public.creator_live_votes where interaction_id like 'cli_devfx_%';
delete from public.creator_live_interactions
 where id like 'cli_devfx_%' or session_id like 'cls_devfx_%' or creator_id like 'devfx_vw_%';
delete from public.creator_live_viewers
 where session_id like 'cls_devfx_%' or profile_id like 'devfx_vw_%';
delete from public.creator_live_sessions
 where id like 'cls_devfx_%' or creator_id like 'devfx_vw_%';

-- Phase 15.5 — Creator AI fixtures
delete from public.creator_ai_messages
 where conversation_id in (select id from public.creator_ai_conversations where creator_id like 'devfx_vw_%');
delete from public.creator_ai_conversations where creator_id like 'devfx_vw_%' or profile_id like 'devfx_vw_%';
delete from public.creator_ai_knowledge where creator_id like 'devfx_vw_%';
delete from public.creator_ai_profiles where creator_id like 'devfx_vw_%';
delete from public.vault_community_posts
 where community_id like 'devfx_vw_%' or id like 'devfx_vw_%';
delete from public.vault_community_memberships
 where community_id like 'devfx_vw_%' or profile_id like 'devfx_vw_%';
delete from public.vault_communities
 where id like 'devfx_vw_%' or creator_id like 'devfx_vw_%';
delete from public.course_progress
 where course_id like 'devfx_vw_%' or lesson_id like 'devfx_vw_%' or profile_id like 'devfx_vw_%';
delete from public.course_lessons where id like 'devfx_vw_%' or course_id like 'devfx_vw_%';
delete from public.creator_courses where id like 'devfx_vw_%' or creator_id like 'devfx_vw_%';
delete from public.vault_service_requests
 where id like 'devfx_vw_%' or service_id like 'devfx_vw_%' or creator_id like 'devfx_vw_%';
delete from public.creator_services where id like 'devfx_vw_%' or creator_id like 'devfx_vw_%';
delete from public.creator_products where id like 'devfx_vw_%' or creator_id like 'devfx_vw_%';
delete from public.vault_collection_items
 where collection_id like 'devfx_vw_%' or drop_id like 'devfx_vw_%';
delete from public.vault_collections where id like 'devfx_vw_%' or creator_id like 'devfx_vw_%';
delete from public.vault_subscriptions where id like 'devfx_vw_%' or vault_id like 'devfx_vw_%';
delete from public.vault_drops where id like 'devfx_vw_%' or creator_id like 'devfx_vw_%';
delete from public.creator_vaults where id like 'devfx_vw_%' or creator_id like 'devfx_vw_%';
delete from public.media_objects where id like 'devfx_vw_%' or owner_id like 'devfx_vw_%';
delete from public.follows
 where follower_id like 'devfx_vw_%'
    or following_id like 'devfx_vw_%'
    or (following_id in ('devfx_vw_maya', 'devfx_vw_leo', 'devfx_vw_aria', 'devfx_vw_noah')
        and follower_id in (
          select id from public.profiles
           where auth_user_id = '00000000-0000-4000-a000-0000000000de'
        ));
delete from public.profiles where id like 'devfx_vw_%';

-- ── Creator profiles ────────────────────────────────────────────────────────
insert into public.profiles
  (id, handle, name, avatar_tint, bio, home_hood, role, moderated_hoods,
   reputation, coins, streak, rank, public_country_code)
values
  ('devfx_vw_maya', 'maya_vault', 'Maya', '#C45C26',
   'Horror filmmaker and visual storyteller.',
   'movies', 'creator', '{}', 5200, 400, 5, 'Hot Take', 'US'),
  ('devfx_vw_leo', 'leo_vault', 'Leo', '#2F6FED',
   'Street photographer / travel creator.',
   'goatalk', 'creator', '{}', 3100, 220, 3, 'Instigator', 'JP'),
  ('devfx_vw_aria', 'aria_vault', 'Aria', '#B45AD4',
   'Music producer crafting late-night demos.',
   'gaming', 'creator', '{}', 2800, 180, 2, 'Instigator', 'GB'),
  ('devfx_vw_noah', 'noah_vault', 'Noah', '#1FA37A',
   'Designer / creative technologist.',
   'techtakes', 'creator', '{}', 4500, 260, 4, 'Hot Take', 'DE');

-- ── Media (paths filled by seed media upload; objects must exist for RPCs) ──
insert into public.media_objects
  (id, owner_id, bucket, storage_path, media_kind, mime_type, visibility, status, ready_at, size_bytes)
values
  -- Maya
  ('devfx_vw_maya_free', 'devfx_vw_maya', 'public-media',
   'devfx_vw_maya/devfx_vw_maya_free/devfx_vw_maya_free.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_maya_sub', 'devfx_vw_maya', 'private-media',
   'devfx_vw_maya/devfx_vw_maya_sub/devfx_vw_maya_sub.png', 'image', 'image/png', 'private', 'ready', now(), 1),
  ('devfx_vw_maya_teaser', 'devfx_vw_maya', 'public-media',
   'devfx_vw_maya/devfx_vw_maya_teaser/devfx_vw_maya_teaser.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_maya_ep1', 'devfx_vw_maya', 'public-media',
   'devfx_vw_maya/devfx_vw_maya_ep1/devfx_vw_maya_ep1.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_maya_ep2', 'devfx_vw_maya', 'public-media',
   'devfx_vw_maya/devfx_vw_maya_ep2/devfx_vw_maya_ep2.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_maya_ep3', 'devfx_vw_maya', 'public-media',
   'devfx_vw_maya/devfx_vw_maya_ep3/devfx_vw_maya_ep3.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_maya_svc', 'devfx_vw_maya', 'public-media',
   'devfx_vw_maya/devfx_vw_maya_svc/devfx_vw_maya_svc.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_maya_course', 'devfx_vw_maya', 'public-media',
   'devfx_vw_maya/devfx_vw_maya_course/devfx_vw_maya_course.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_maya_prod', 'devfx_vw_maya', 'public-media',
   'devfx_vw_maya/devfx_vw_maya_prod/devfx_vw_maya_prod.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_maya_lesson_priv', 'devfx_vw_maya', 'private-media',
   'devfx_vw_maya/devfx_vw_maya_lesson_priv/devfx_vw_maya_lesson_priv.mp4', 'video', 'video/mp4', 'private', 'ready', now(), 1),
  -- Leo
  ('devfx_vw_leo_free', 'devfx_vw_leo', 'public-media',
   'devfx_vw_leo/devfx_vw_leo_free/devfx_vw_leo_free.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_leo_course', 'devfx_vw_leo', 'public-media',
   'devfx_vw_leo/devfx_vw_leo_course/devfx_vw_leo_course.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_leo_svc', 'devfx_vw_leo', 'public-media',
   'devfx_vw_leo/devfx_vw_leo_svc/devfx_vw_leo_svc.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  -- Aria
  ('devfx_vw_aria_free', 'devfx_vw_aria', 'public-media',
   'devfx_vw_aria/devfx_vw_aria_free/devfx_vw_aria_free.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_aria_col', 'devfx_vw_aria', 'public-media',
   'devfx_vw_aria/devfx_vw_aria_col/devfx_vw_aria_col.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_aria_svc', 'devfx_vw_aria', 'public-media',
   'devfx_vw_aria/devfx_vw_aria_svc/devfx_vw_aria_svc.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_aria_prod', 'devfx_vw_aria', 'public-media',
   'devfx_vw_aria/devfx_vw_aria_prod/devfx_vw_aria_prod.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  -- Noah
  ('devfx_vw_noah_free', 'devfx_vw_noah', 'public-media',
   'devfx_vw_noah/devfx_vw_noah_free/devfx_vw_noah_free.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_noah_course', 'devfx_vw_noah', 'public-media',
   'devfx_vw_noah/devfx_vw_noah_course/devfx_vw_noah_course.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_noah_prod', 'devfx_vw_noah', 'public-media',
   'devfx_vw_noah/devfx_vw_noah_prod/devfx_vw_noah_prod.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  -- Phase 15.3 — richer demo media + Creator World Drop artifacts
  ('devfx_vw_maya_comm', 'devfx_vw_maya', 'public-media',
   'devfx_vw_maya/devfx_vw_maya_comm/devfx_vw_maya_comm.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_maya_bts', 'devfx_vw_maya', 'public-media',
   'devfx_vw_maya/devfx_vw_maya_bts/devfx_vw_maya_bts.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_maya_still1', 'devfx_vw_maya', 'public-media',
   'devfx_vw_maya/devfx_vw_maya_still1/devfx_vw_maya_still1.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_maya_still2', 'devfx_vw_maya', 'public-media',
   'devfx_vw_maya/devfx_vw_maya_still2/devfx_vw_maya_still2.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_maya_artifact', 'devfx_vw_maya', 'public-media',
   'devfx_vw_maya/devfx_vw_maya_artifact/devfx_vw_maya_artifact.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_leo_sheet', 'devfx_vw_leo', 'public-media',
   'devfx_vw_leo/devfx_vw_leo_sheet/devfx_vw_leo_sheet.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_leo_portrait', 'devfx_vw_leo', 'public-media',
   'devfx_vw_leo/devfx_vw_leo_portrait/devfx_vw_leo_portrait.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_leo_detail', 'devfx_vw_leo', 'public-media',
   'devfx_vw_leo/devfx_vw_leo_detail/devfx_vw_leo_detail.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_leo_hunt', 'devfx_vw_leo', 'public-media',
   'devfx_vw_leo/devfx_vw_leo_hunt/devfx_vw_leo_hunt.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_aria_album', 'devfx_vw_aria', 'public-media',
   'devfx_vw_aria/devfx_vw_aria_album/devfx_vw_aria_album.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_aria_track', 'devfx_vw_aria', 'public-media',
   'devfx_vw_aria/devfx_vw_aria_track/devfx_vw_aria_track.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_noah_interior', 'devfx_vw_noah', 'public-media',
   'devfx_vw_noah/devfx_vw_noah_interior/devfx_vw_noah_interior.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_noah_material', 'devfx_vw_noah', 'public-media',
   'devfx_vw_noah/devfx_vw_noah_material/devfx_vw_noah_material.png', 'image', 'image/png', 'public', 'ready', now(), 1),
  ('devfx_vw_noah_blueprint', 'devfx_vw_noah', 'public-media',
   'devfx_vw_noah/devfx_vw_noah_blueprint/devfx_vw_noah_blueprint.png', 'image', 'image/png', 'public', 'ready', now(), 1);

-- ── Vaults ──────────────────────────────────────────────────────────────────
insert into public.creator_vaults (id, creator_id, title, description, status)
values
  ('devfx_vw_maya_vault', 'devfx_vw_maya', 'Midnight Files', 'Horror filmmaker world.', 'active'),
  ('devfx_vw_leo_vault', 'devfx_vw_leo', 'After Hours Streets', 'Travel & street photography.', 'active'),
  ('devfx_vw_aria_vault', 'devfx_vw_aria', 'After Hours', 'Late-night music world.', 'active'),
  ('devfx_vw_noah_vault', 'devfx_vw_noah', 'Motion Lab', 'Interface motion & design.', 'active');

-- ── Drops ───────────────────────────────────────────────────────────────────
insert into public.vault_drops
  (id, vault_id, creator_id, caption, media_object_id, access_level, status,
   published_at, expires_at, public_preview_media_object_id)
values
  -- Maya free + subscriber preview + collection episodes
  ('devfx_vw_maya_drop_free', 'devfx_vw_maya_vault', 'devfx_vw_maya',
   'I found this tape behind the wall.', 'devfx_vw_maya_free', 'free', 'published',
   now() - interval '2 hours', now() - interval '2 hours' + interval '7 days', null),
  ('devfx_vw_maya_drop_sub', 'devfx_vw_maya_vault', 'devfx_vw_maya',
   'The cut they never aired.', 'devfx_vw_maya_sub', 'subscriber', 'published',
   now() - interval '1 hour', now() - interval '1 hour' + interval '7 days', 'devfx_vw_maya_teaser'),
  ('devfx_vw_maya_ep1', 'devfx_vw_maya_vault', 'devfx_vw_maya',
   'Episode 01 — The House', 'devfx_vw_maya_ep1', 'free', 'published',
   now() - interval '3 days', now() - interval '3 days' + interval '7 days', null),
  ('devfx_vw_maya_ep2', 'devfx_vw_maya_vault', 'devfx_vw_maya',
   'Episode 02 — The Tape', 'devfx_vw_maya_ep2', 'free', 'published',
   now() - interval '2 days', now() - interval '2 days' + interval '7 days', null),
  ('devfx_vw_maya_ep3', 'devfx_vw_maya_vault', 'devfx_vw_maya',
   'Episode 03 — The Basement', 'devfx_vw_maya_ep3', 'free', 'published',
   now() - interval '1 day', now() - interval '1 day' + interval '7 days', null),
  -- Leo / Aria / Noah
  ('devfx_vw_leo_drop', 'devfx_vw_leo_vault', 'devfx_vw_leo',
   'Tokyo after midnight.', 'devfx_vw_leo_free', 'free', 'published',
   now() - interval '4 hours', now() - interval '4 hours' + interval '7 days', null),
  ('devfx_vw_aria_drop', 'devfx_vw_aria_vault', 'devfx_vw_aria',
   'Unreleased demo — keep the hiss.', 'devfx_vw_aria_free', 'free', 'published',
   now() - interval '5 hours', now() - interval '5 hours' + interval '7 days', null),
  ('devfx_vw_aria_col_drop', 'devfx_vw_aria_vault', 'devfx_vw_aria',
   'After Hours — Side A', 'devfx_vw_aria_col', 'free', 'published',
   now() - interval '6 hours', now() - interval '6 hours' + interval '7 days', null),
  ('devfx_vw_noah_drop', 'devfx_vw_noah_vault', 'devfx_vw_noah',
   'How I built this.', 'devfx_vw_noah_free', 'free', 'published',
   now() - interval '3 hours', now() - interval '3 hours' + interval '7 days', null);

-- Draft drop (must never appear in Discover)
insert into public.vault_drops
  (id, vault_id, creator_id, caption, media_object_id, access_level, status)
values
  ('devfx_vw_maya_draft', 'devfx_vw_maya_vault', 'devfx_vw_maya',
   'Draft — never publish', 'devfx_vw_maya_free', 'free', 'draft');

-- Expired free drop (must never appear as live Discover drop)
insert into public.vault_drops
  (id, vault_id, creator_id, caption, media_object_id, access_level, status,
   published_at, expires_at)
values
  ('devfx_vw_maya_expired', 'devfx_vw_maya_vault', 'devfx_vw_maya',
   'Expired hallway cut', 'devfx_vw_maya_ep1', 'free', 'published',
   now() - interval '10 days', now() - interval '3 days');

-- ── Collections ─────────────────────────────────────────────────────────────
insert into public.vault_collections (id, vault_id, creator_id, title, description)
values
  ('devfx_vw_maya_col', 'devfx_vw_maya_vault', 'devfx_vw_maya',
   'Midnight Files', 'Three episodes from the house.'),
  ('devfx_vw_aria_col', 'devfx_vw_aria_vault', 'devfx_vw_aria',
   'After Hours', 'Night sessions.');

insert into public.vault_collection_items (collection_id, drop_id, position)
values
  ('devfx_vw_maya_col', 'devfx_vw_maya_ep1', 0),
  ('devfx_vw_maya_col', 'devfx_vw_maya_ep2', 1),
  ('devfx_vw_maya_col', 'devfx_vw_maya_ep3', 2),
  ('devfx_vw_aria_col', 'devfx_vw_aria_col_drop', 0);

-- ── Services ────────────────────────────────────────────────────────────────
insert into public.creator_services
  (id, creator_id, title, description, category, cover_media_object_id,
   access_type, price_amount_minor, currency, delivery_type, status)
values
  ('devfx_vw_maya_svc', 'devfx_vw_maya', '1-on-1 Horror Film Review',
   'A private review of your short or scene.', 'consultation', 'devfx_vw_maya_svc',
   'contact', null, null, 'online', 'published'),
  ('devfx_vw_leo_svc', 'devfx_vw_leo', 'Portfolio Review',
   'Street portfolio feedback in one session.', 'consultation', 'devfx_vw_leo_svc',
   'paid', 450000, 'INR', 'online', 'published'),
  ('devfx_vw_aria_svc', 'devfx_vw_aria', 'Mix Feedback',
   'Notes on your mix — arrangement and space.', 'creative_service', 'devfx_vw_aria_svc',
   'contact', null, null, 'online', 'published'),
  -- Draft must stay invisible
  ('devfx_vw_maya_svc_draft', 'devfx_vw_maya', 'Hidden Draft Service',
   'Should never appear.', 'other', null, 'contact', null, null, 'online', 'draft');

-- ── Courses ─────────────────────────────────────────────────────────────────
insert into public.creator_courses
  (id, creator_id, title, description, cover_media_object_id, access_type, status)
values
  ('devfx_vw_maya_course', 'devfx_vw_maya', 'Filmmaking at Night',
   'Lighting, movement, and sound after dark.', 'devfx_vw_maya_course', 'free', 'published'),
  ('devfx_vw_leo_course', 'devfx_vw_leo', 'Street Photography',
   'Reading light in the city.', 'devfx_vw_leo_course', 'free', 'published'),
  ('devfx_vw_noah_course', 'devfx_vw_noah', 'Interface Motion',
   'Motion systems for product UI.', 'devfx_vw_noah_course', 'free', 'published'),
  ('devfx_vw_maya_course_draft', 'devfx_vw_maya', 'Draft Course',
   'Invisible draft.', null, 'free', 'draft');

insert into public.course_lessons
  (id, course_id, title, description, position, content_type, body_text,
   preview_allowed, access_type, status, media_object_id)
values
  ('devfx_vw_maya_l1', 'devfx_vw_maya_course', '01 — Introduction',
   'Why night changes everything.', 1, 'text',
   'Night removes the easy light. Start by deciding what you refuse to show.',
   false, 'free', 'published', null),
  ('devfx_vw_maya_l2', 'devfx_vw_maya_course', '02 — Lighting the dark',
   'Practical sources and silhouettes.', 2, 'text',
   'Use one practical. Let the rest fall away. Protect the blacks.',
   false, 'free', 'published', null),
  ('devfx_vw_maya_l3', 'devfx_vw_maya_course', '03 — Camera movement',
   'Slow push and withheld reveal.', 3, 'text',
   'Move only when the frame earns it. Hold longer than feels comfortable.',
   false, 'free', 'published', null),
  ('devfx_vw_maya_l4', 'devfx_vw_maya_course', '04 — Sound design',
   'Rooms that breathe.', 4, 'text',
   'Record the room empty first. The hush is half the scare.',
   false, 'free', 'published', null),
  -- Subscriber private lesson — media must never leak via Discover
  ('devfx_vw_maya_l_sub', 'devfx_vw_maya_course', 'Members cut',
   'Subscriber-only video notes.', 5, 'video', '',
   false, 'subscriber', 'published', 'devfx_vw_maya_lesson_priv'),
  ('devfx_vw_leo_l1', 'devfx_vw_leo_course', '01 — Night streets',
   'Exposure without killing the mood.', 1, 'text',
   'Expose for the neon you care about. Let the rest fail.',
   false, 'free', 'published', null),
  ('devfx_vw_noah_l1', 'devfx_vw_noah_course', '01 — Timing curves',
   'Easing that feels physical.', 1, 'text',
   'Prefer ease-out for entrances. Never bounce by default.',
   false, 'free', 'published', null);

-- ── Products ────────────────────────────────────────────────────────────────
insert into public.creator_products
  (id, creator_id, title, description, product_type, cover_media_object_id,
   price_amount_minor, currency, access_type, inventory_mode, status)
values
  ('devfx_vw_maya_prod', 'devfx_vw_maya', 'Night LUT Pack',
   'Warm-to-cold night grades for horror shorts.', 'digital', 'devfx_vw_maya_prod',
   199900, 'INR', 'paid', 'unlimited', 'published'),
  ('devfx_vw_aria_prod', 'devfx_vw_aria', 'Drum Pack',
   'Tight kits for late-night demos.', 'digital', 'devfx_vw_aria_prod',
   99900, 'INR', 'paid', 'unlimited', 'published'),
  ('devfx_vw_noah_prod', 'devfx_vw_noah', 'UI Motion Pack',
   'Previewable motion presets for product UI.', 'digital', 'devfx_vw_noah_prod',
   149900, 'INR', 'paid', 'unlimited', 'published'),
  ('devfx_vw_maya_prod_draft', 'devfx_vw_maya', 'Draft Pack',
   'Invisible draft product.', 'digital', null, 100, 'INR', 'paid', 'unlimited', 'draft');

-- ── Communities ─────────────────────────────────────────────────────────────
insert into public.vault_communities
  (id, creator_id, vault_id, name, description, access_type, status,
   pseudonymous_enabled, rules)
values
  ('devfx_vw_maya_cmt', 'devfx_vw_maya', 'devfx_vw_maya_vault',
   'The Night Shift', 'Where the Midnight Files audience gathers.',
   'subscribers', 'active', true, 'Be kind. No spoilers.'),
  ('devfx_vw_leo_cmt', 'devfx_vw_leo', 'devfx_vw_leo_vault',
   'Street Frames', 'Public street photography talk.', 'public', 'active', false, ''),
  ('devfx_vw_aria_cmt', 'devfx_vw_aria', 'devfx_vw_aria_vault',
   'After Hours Room', 'Followers-only late-night room.', 'followers', 'active', false, '');

insert into public.vault_community_posts
  (id, community_id, author_profile_id, post_type, body, pseudonymous, created_at)
values
  ('devfx_vw_maya_cmt_ann', 'devfx_vw_maya_cmt', 'devfx_vw_maya', 'announcement',
   'Episode 04 premieres Friday night.', false, now() - interval '6 hours'),
  ('devfx_vw_maya_cmt_p1', 'devfx_vw_maya_cmt', 'devfx_vw_maya', 'discussion',
   'Which Midnight Files episode actually got you?', false, now() - interval '5 hours'),
  ('devfx_vw_maya_cmt_p2', 'devfx_vw_maya_cmt', 'devfx_vw_maya', 'discussion',
   'Anyone else notice the frame at 08:14?', true, now() - interval '4 hours'),
  ('devfx_vw_leo_cmt_p1', 'devfx_vw_leo_cmt', 'devfx_vw_leo', 'discussion',
   'What is your favourite focal length after midnight?', false, now() - interval '3 hours'),
  ('devfx_vw_aria_cmt_p1', 'devfx_vw_aria_cmt', 'devfx_vw_aria', 'discussion',
   'Drop your favourite 2am synth sound.', false, now() - interval '2 hours');

insert into public.vault_community_replies
  (id, post_id, community_id, author_profile_id, body, pseudonymous, created_at)
values
  ('devfx_vw_maya_cmt_r1', 'devfx_vw_maya_cmt_p1', 'devfx_vw_maya_cmt', 'devfx_vw_aria',
   'Episode 03 — I did not sleep.', false, now() - interval '4 hours'),
  ('devfx_vw_maya_cmt_r2', 'devfx_vw_maya_cmt_p1', 'devfx_vw_maya_cmt', 'devfx_vw_leo',
   'The opening shot of Episode 01.', true, now() - interval '3 hours');

insert into public.vault_community_memberships (community_id, profile_id, last_seen_at)
values
  ('devfx_vw_maya_cmt', 'devfx_vw_maya', now() - interval '1 hour'),
  ('devfx_vw_maya_cmt', 'devfx_vw_leo', now() - interval '2 hours'),
  ('devfx_vw_maya_cmt', 'devfx_vw_aria', now() - interval '3 days'),
  ('devfx_vw_leo_cmt', 'devfx_vw_leo', now() - interval '30 minutes')
on conflict do nothing;

-- The local dev account joins the public community only (no fake entitlement).
insert into public.vault_community_memberships (community_id, profile_id, last_seen_at)
select 'devfx_vw_leo_cmt', p.id, now()
  from public.profiles p
 where p.auth_user_id = '00000000-0000-4000-a000-0000000000de'
on conflict do nothing;

-- ── Local dev follows Maya + Leo (Following populated, Discover still wider) ─
insert into public.follows (follower_id, following_id)
select p.id, f.following_id
  from public.profiles p
  cross join (values ('devfx_vw_maya'), ('devfx_vw_leo')) as f(following_id)
 where p.auth_user_id = '00000000-0000-4000-a000-0000000000de'
on conflict do nothing;

-- Phase 15.3 — attach demo media to community posts so the feed is visual.
update public.vault_community_posts
   set media_object_id = 'devfx_vw_maya_comm'
 where id = 'devfx_vw_maya_cmt_ann';
update public.vault_community_posts
   set media_object_id = 'devfx_vw_leo_sheet'
 where id = 'devfx_vw_leo_cmt_p1';
update public.vault_community_posts
   set media_object_id = 'devfx_vw_aria_album'
 where id = 'devfx_vw_aria_cmt_p1';

-- ── Creator World Drops (Phase 15.3) ────────────────────────────────────────
-- Coarse destinations only: the raw coordinates below are public city centres
-- and `world_fuzz_location` snaps them to a cell before persistence.
insert into public.world_drops
  (id, mission_id, author_id, creator_id, media_object_id, caption, clue,
   drop_type, reward_type, reward_ref, reward_payload,
   approx_location, location_cell, location_label,
   status, published_at, expires_at)
values
  ('wd_devfx_maya_missing_frame', null, 'devfx_vw_maya', 'devfx_vw_maya', 'devfx_vw_maya_artifact',
   'The Missing Frame', 'The frame that was cut from Midnight Files lives somewhere in the house.',
   'SECRET_DROP', 'COLLECTIBLE', 'The Missing Frame',
   '{"artifact":"missing_frame","index":"02"}'::jsonb,
   public.world_fuzz_location(19.08, 72.88),
   extensions.ST_GeoHash(public.world_fuzz_location(19.08, 72.88)::extensions.geometry, 6),
   'Mumbai', 'PUBLISHED', now() - interval '2 days', now() + interval '28 days'),

  ('wd_devfx_leo_midnight_hunt', null, 'devfx_vw_leo', 'devfx_vw_leo', 'devfx_vw_leo_hunt',
   'Midnight Photo Hunt', 'Find the frame nobody else noticed. One street, one hour after dark.',
   'CHALLENGE', 'CHALLENGE_STATUS', 'Midnight Photo Hunt', null,
   public.world_fuzz_location(51.51, -0.13),
   extensions.ST_GeoHash(public.world_fuzz_location(51.51, -0.13)::extensions.geometry, 6),
   'London', 'PUBLISHED', now() - interval '1 day', now() + interval '20 days'),

  ('wd_devfx_aria_hidden_track', null, 'devfx_vw_aria', 'devfx_vw_aria', 'devfx_vw_aria_track',
   'Hidden Track', 'A track that never made the album — the last mix is still inside the After Hours vault.',
   'COLLECTIBLE', 'CONTENT_UNLOCK', 'devfx_vw_aria_col_drop', null,
   public.world_fuzz_location(35.68, 139.69),
   extensions.ST_GeoHash(public.world_fuzz_location(35.68, 139.69)::extensions.geometry, 6),
   'Tokyo', 'PUBLISHED', now() - interval '12 hours', now() + interval '14 days'),

  ('wd_devfx_noah_blueprint_07', null, 'devfx_vw_noah', 'devfx_vw_noah', 'devfx_vw_noah_blueprint',
   'Blueprint 07', 'Sheet 07 of the motion system — the revision that fixed the easing.',
   'COLLECTIBLE', 'COLLECTIBLE', 'Blueprint 07',
   '{"artifact":"blueprint_07","sheet":"07"}'::jsonb,
   public.world_fuzz_location(52.52, 13.4),
   extensions.ST_GeoHash(public.world_fuzz_location(52.52, 13.4)::extensions.geometry, 6),
   'Berlin', 'PUBLISHED', now() - interval '3 days', now() + interval '30 days')
on conflict (id) do nothing;

-- One already-discovered artifact so the collection is visible locally
-- (Aria found Maya's secret). Server-side claim rows only — nothing faked.
insert into public.world_drop_claims
  (drop_id, profile_id, reward_type, reward_ref, reward_payload, claimed_at)
values
  ('wd_devfx_maya_missing_frame', 'devfx_vw_aria', 'COLLECTIBLE', 'The Missing Frame',
   '{"artifact":"missing_frame","index":"02"}'::jsonb, now() - interval '1 day')
on conflict do nothing;

-- ── Interactive Live fixtures (Phase 15.4) ─────────────────────────────────
-- Maya is live now with a poll and a crowd action; Aria is live with a choice;
-- Leo has one scheduled for tomorrow night. Covers reuse the 15.3 artwork.
insert into public.creator_live_sessions
  (id, creator_id, vault_id, title, description, cover_media_object_id,
   stream_url, provider, access, status,
   allow_polls, allow_choices, allow_crowd_actions, allow_game_actions,
   scheduled_at, started_at)
values
  ('cls_devfx_maya', 'devfx_vw_maya', 'devfx_vw_maya_vault',
   'We are filming Episode 05', 'Basement or attic? You decide.',
   'devfx_vw_maya_comm', null, 'standby', 'FREE', 'LIVE',
   true, true, true, true, null, now() - interval '12 minutes'),
  ('cls_devfx_aria', 'devfx_vw_aria', 'devfx_vw_aria_vault',
   'Finish this track with me', 'Two ways the drums can go.',
   'devfx_vw_aria_album', null, 'standby', 'FREE', 'LIVE',
   true, true, false, false, null, now() - interval '5 minutes'),
  ('cls_devfx_leo', 'devfx_vw_leo', 'devfx_vw_leo_vault',
   'Night photography walk', 'Lights down, camera up.',
   'devfx_vw_leo_sheet', null, 'standby', 'FREE', 'SCHEDULED',
   true, true, false, false, now() + interval '1 day', null);

insert into public.creator_live_interactions
  (id, session_id, creator_id, type, prompt, options, action_kind, threshold,
   status, tallies, total_votes, closes_at)
values
  ('cli_devfx_maya_poll', 'cls_devfx_maya', 'devfx_vw_maya', 'POLL',
   'Where should we film next?',
   '[{"id":"basement","label":"Basement"},{"id":"attic","label":"Attic"}]'::jsonb,
   null, null, 'OPEN', '{"basement":1,"attic":1}'::jsonb, 2, null),
  ('cli_devfx_maya_lights', 'cls_devfx_maya', 'devfx_vw_maya', 'CROWD_ACTION',
   'Turn the lights off', null, 'LIGHTS_OFF', 5,
   'OPEN', '{"support":1}'::jsonb, 1, null),
  ('cli_devfx_aria_drums', 'cls_devfx_aria', 'devfx_vw_aria', 'CHOICE',
   'Heavy or minimal?',
   '[{"id":"heavy","label":"Heavy drums"},{"id":"minimal","label":"Minimal drums"}]'::jsonb,
   null, null, 'OPEN', '{}'::jsonb, 0, null);

-- Server-side seed votes so the tallies are not empty on first load.
insert into public.creator_live_votes (interaction_id, profile_id, option_id)
values
  ('cli_devfx_maya_poll', 'devfx_vw_aria', 'basement'),
  ('cli_devfx_maya_poll', 'devfx_vw_leo', 'attic'),
  ('cli_devfx_maya_lights', 'devfx_vw_noah', null);

-- A small watch count (aggregate only — the roster is never exposed).
insert into public.creator_live_viewers (session_id, profile_id, last_seen_at)
values
  ('cls_devfx_maya', 'devfx_vw_aria', now()),
  ('cls_devfx_maya', 'devfx_vw_leo', now()),
  ('cls_devfx_maya', 'devfx_vw_noah', now()),
  ('cls_devfx_aria', 'devfx_vw_maya', now());

-- ── Creator AI fixtures (Phase 15.5) ───────────────────────────────────────
-- Maya and Aria have an AI version; Leo and Noah deliberately do not, so the
-- chapter's "only when enabled" rule is visible locally. Every entry is creator
-- approved; the member-only note exists to exercise the entitlement filter.
insert into public.creator_ai_profiles
  (creator_id, enabled, display_name, description, welcome_message, instructions,
   access, starters, artwork_media_object_id)
values
  ('devfx_vw_maya', true, 'Maya AI',
   'An AI version of Maya built from her filmmaking notes and published Vault material.',
   'Ask me about the Midnight Files, or how a scene gets built.',
   'Speak in short, filmic sentences. Never more than a few lines. Talk about craft, not gossip.',
   'FREE',
   '["How do you build suspense?","How did you approach The Missing Frame?","What makes a horror scene uncomfortable?"]'::jsonb,
   'devfx_vw_maya_comm'),
  ('devfx_vw_aria', true, 'Aria AI',
   'An AI version of Aria built from her production notes and published material.',
   'Tell me what you are working on.',
   'Warm, technical, brief. Talk about sound and arrangement, never about people.',
   'FREE',
   '["How do you start a track?","How do you choose drum textures?","How do you know when a song is finished?"]'::jsonb,
   'devfx_vw_aria_album');

insert into public.creator_ai_knowledge (id, creator_id, kind, title, body, source_id, access)
values
  ('cak_devfx_maya_suspense', 'devfx_vw_maya', 'NOTE', 'Building suspense',
   'Suspense is a promise you keep delaying. Hold the frame longer than is comfortable, then cut before the release arrives.', null, 'FREE'),
  ('cak_devfx_maya_frame', 'devfx_vw_maya', 'NOTE', 'The Missing Frame',
   'The Missing Frame started as a single shot of an open door. Everything else was written to earn that door.', null, 'FREE'),
  ('cak_devfx_maya_discomfort', 'devfx_vw_maya', 'NOTE', 'Discomfort',
   'Discomfort comes from the wrong duration, not the wrong image. Sound does the rest.', null, 'FREE'),
  ('cak_devfx_maya_members', 'devfx_vw_maya', 'NOTE', 'Members: basement breakdown',
   'The basement sequence was lit with one practical and no fill. Members get the full lighting plot with the episode notes.', null, 'SUBSCRIBER'),
  ('cak_devfx_maya_drop', 'devfx_vw_maya', 'VAULT_DROP', 'I found this tape behind the wall.', null, 'devfx_vw_maya_drop_free', 'FREE'),
  ('cak_devfx_maya_col', 'devfx_vw_maya', 'COLLECTION', 'Midnight Files', null, 'devfx_vw_maya_col', 'SUBSCRIBER'),
  ('cak_devfx_aria_start', 'devfx_vw_aria', 'NOTE', 'Starting a track',
   'Start with the drum texture, never the melody. The texture decides the tempo you actually hear.', null, 'FREE'),
  ('cak_devfx_aria_drums', 'devfx_vw_aria', 'NOTE', 'Drum textures',
   'I layer a close mic with a room mic and pull the close mic back until the room wins.', null, 'FREE'),
  ('cak_devfx_aria_finished', 'devfx_vw_aria', 'NOTE', 'Knowing when it is finished',
   'A track is finished when removing anything makes it worse. Then I stop.', null, 'FREE'),
  ('cak_devfx_aria_drop', 'devfx_vw_aria', 'VAULT_DROP', 'Unreleased demo — keep the hiss.', null, 'devfx_vw_aria_drop', 'FREE');

commit;

do $$
begin
  raise notice 'vault_creator_worlds: ready — Maya/Leo/Aria/Noah Creator Worlds seeded';
end $$;

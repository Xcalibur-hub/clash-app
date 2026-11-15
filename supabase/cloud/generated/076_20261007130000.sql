-- ============================================================================
-- CLASH cloud wrapper — step 76 of 111
-- version           : 20261007130000
-- ledger name       : arena_challenge_notifications
-- mode              : direct
-- executed source   : supabase/migrations/20261007130000_arena_challenge_notifications.sql
-- executed sha256   : be4b09ff6d259a66bac8bd87ae15d535c2cb0b4cacef47e9f67ee4d4eb427a42
-- normalisation     : none
-- normalized sha256 : be4b09ff6d259a66bac8bd87ae15d535c2cb0b4cacef47e9f67ee4d4eb427a42
--
-- ATOMICITY: the migration SQL and its ledger row are committed together.
-- If this file fails, neither the schema change nor the ledger row survives.
-- ============================================================================
begin;

-- Enum additions must commit before the lifecycle migration uses them.
alter type public.notification_kind add value if not exists 'challenge_received';
alter type public.notification_kind add value if not exists 'challenge_accepted';


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20261007130000',
  'arena_challenge_notifications',
  array['sha256:be4b09ff6d259a66bac8bd87ae15d535c2cb0b4cacef47e9f67ee4d4eb427a42'],
  'clash-cloud-wrapper-v1'
)
on conflict (version) do nothing;

commit;

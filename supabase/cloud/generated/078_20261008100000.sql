-- ============================================================================
-- CLASH cloud wrapper — step 78 of 111
-- version           : 20261008100000
-- ledger name       : arena_crowd_report_target
-- mode              : direct
-- executed source   : supabase/migrations/20261008100000_arena_crowd_report_target.sql
-- executed sha256   : fc332a2eaa850da801956d64ddd4a80538bdb6163d6cee5c5ca1395202e7faa7
-- normalisation     : none
-- normalized sha256 : fc332a2eaa850da801956d64ddd4a80538bdb6163d6cee5c5ca1395202e7faa7
--
-- ATOMICITY: the migration SQL and its ledger row are committed together.
-- If this file fails, neither the schema change nor the ledger row survives.
-- ============================================================================
begin;

-- Commit the enum value before the following migration uses it.
alter type public.report_target add value if not exists 'arena_crowd_message';


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20261008100000',
  'arena_crowd_report_target',
  array['sha256:fc332a2eaa850da801956d64ddd4a80538bdb6163d6cee5c5ca1395202e7faa7'],
  'clash-cloud-wrapper-v1'
)
on conflict (version) do nothing;

commit;

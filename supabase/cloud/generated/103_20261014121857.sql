-- ============================================================================
-- CLASH cloud wrapper — step 103 of 111
-- version           : 20261014121857
-- ledger name       : canonical_arena_private_assists
-- mode              : direct
-- executed source   : supabase/migrations/20261014121857_canonical_arena_private_assists.sql
-- executed sha256   : b283d003997c9cf74f71f8dd1b0b2859df647a06453a8e2ff1b4d2617ad537c5
-- normalisation     : none
-- normalized sha256 : b283d003997c9cf74f71f8dd1b0b2859df647a06453a8e2ff1b4d2617ad537c5
--
-- ATOMICITY: the migration SQL and its ledger row are committed together.
-- If this file fails, neither the schema change nor the ledger row survives.
-- ============================================================================
begin;

-- Commit the moderation target label before the following migration uses it.
alter type public.report_target add value if not exists 'arena_private_assist';


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20261014121857',
  'canonical_arena_private_assists',
  array['sha256:b283d003997c9cf74f71f8dd1b0b2859df647a06453a8e2ff1b4d2617ad537c5'],
  'clash-cloud-wrapper-v1'
)
on conflict (version) do nothing;

commit;

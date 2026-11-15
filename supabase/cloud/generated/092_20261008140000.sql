-- ============================================================================
-- CLASH cloud wrapper — step 92 of 111
-- version           : 20261008140000
-- ledger name       : arena_interest_feed_index
-- mode              : direct
-- executed source   : supabase/migrations/20261008140000_arena_interest_feed_index.sql
-- executed sha256   : 0521cdec6a25c0d6dcf9370c1441ad49753c9a8a22e767c136ea0dacf3fc0c5b
-- normalisation     : none
-- normalized sha256 : 0521cdec6a25c0d6dcf9370c1441ad49753c9a8a22e767c136ea0dacf3fc0c5b
--
-- ATOMICITY: the migration SQL and its ledger row are committed together.
-- If this file fails, neither the schema change nor the ledger row survives.
-- ============================================================================
begin;

-- Supports the bounded recent candidate pool without sorting all active Takes.
create index arena_interest_feed_candidates_idx on public.takes(created_at desc,id desc)
 where status='active' and not is_runtime_fixture;


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20261008140000',
  'arena_interest_feed_index',
  array['sha256:0521cdec6a25c0d6dcf9370c1441ad49753c9a8a22e767c136ea0dacf3fc0c5b'],
  'clash-cloud-wrapper-v1'
)
on conflict (version) do nothing;

commit;

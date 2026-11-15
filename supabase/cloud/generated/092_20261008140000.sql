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
-- A server-side error before COMMIT aborts the transaction, so neither the
-- schema change nor its ledger row survives. A connection lost around COMMIT
-- can leave the outcome unknown, which is why the runner classifies it from
-- the ledger instead of claiming a rollback.
--
-- CONCURRENCY (Round 8): the ledger insert has NO conflict clause. If a row for
-- this version already exists, the insert raises unique_violation, the whole
-- transaction aborts and no statement of the migration survives. An
-- 'on conflict do nothing' would have skipped the row while re-executing the
-- migration body - the one case the read-back could not detect.
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
);

commit;

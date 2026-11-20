-- ============================================================================
-- CLASH cloud wrapper — step 30 of 119
-- version           : 20261002140000
-- ledger name       : comment_gifs_enum
-- mode              : direct
-- executed source   : supabase/migrations/20261002140000_comment_gifs_enum.sql
-- executed sha256   : 90e4d9ce7a82a1d6016a17a47f73e2d7a880dfd73048aed70e34b871bc2b31e0
-- normalisation     : none
-- normalized sha256 : 90e4d9ce7a82a1d6016a17a47f73e2d7a880dfd73048aed70e34b871bc2b31e0
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

-- ============================================================================
-- CLASH 2.0 · media_kind += gif (enum only)
-- Must commit before any statement uses the new label (Postgres rule).
-- ============================================================================

alter type public.media_kind add value if not exists 'gif';


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20261002140000',
  'comment_gifs_enum',
  array['sha256:90e4d9ce7a82a1d6016a17a47f73e2d7a880dfd73048aed70e34b871bc2b31e0'],
  'clash-cloud-wrapper-v1'
);

commit;

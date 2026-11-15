-- ============================================================================
-- CLASH cloud wrapper — step 102 of 111
-- version           : 20261014100000
-- ledger name       : arena_discussion_paging_indexes
-- mode              : direct
-- executed source   : supabase/migrations/20261014100000_arena_discussion_paging_indexes.sql
-- executed sha256   : 65bbdba70726deea0dace5f348961c6d68f927a31a73b99a55af4bc34f29d3d6
-- normalisation     : none
-- normalized sha256 : 65bbdba70726deea0dace5f348961c6d68f927a31a73b99a55af4bc34f29d3d6
--
-- ATOMICITY: the migration SQL and its ledger row are committed together.
-- A server-side error before COMMIT aborts the transaction, so neither the
-- schema change nor its ledger row survives. A connection lost around COMMIT
-- can leave the outcome unknown, which is why the runner classifies it from
-- the ledger instead of claiming a rollback.
-- ============================================================================
begin;

-- Local migration only. Optimizes paged root threads and direct replies.
-- RLS / moderation policy is unchanged; do not deploy to quarantined hosted staging.
create index if not exists comments_discussion_roots_new_idx
  on public.comments (take_id, created_at desc, id desc)
  where is_removed = false and parent_comment_id is null;

create index if not exists comments_discussion_roots_best_idx
  on public.comments (take_id, upvotes_count desc, created_at desc, id desc)
  where is_removed = false and parent_comment_id is null;

create index if not exists comments_discussion_replies_new_idx
  on public.comments (take_id, parent_comment_id, created_at desc, id desc)
  where is_removed = false and parent_comment_id is not null;

create index if not exists comments_discussion_replies_best_idx
  on public.comments (take_id, parent_comment_id, upvotes_count desc, created_at desc, id desc)
  where is_removed = false and parent_comment_id is not null;


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20261014100000',
  'arena_discussion_paging_indexes',
  array['sha256:65bbdba70726deea0dace5f348961c6d68f927a31a73b99a55af4bc34f29d3d6'],
  'clash-cloud-wrapper-v1'
)
on conflict (version) do nothing;

commit;

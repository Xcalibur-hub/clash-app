-- ============================================================================
-- CLASH cloud wrapper — step 70 of 111
-- version           : 20261006120000
-- ledger name       : arena_crews_enums
-- mode              : direct
-- executed source   : supabase/migrations/20261006120000_arena_crews_enums.sql
-- executed sha256   : 6d1f29632aa63daea354105371d82876c654152327a66f1f5ea354225fcf3b18
-- normalisation     : none
-- normalized sha256 : 6d1f29632aa63daea354105371d82876c654152327a66f1f5ea354225fcf3b18
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
-- Arena Crews · Phase A enums
-- Separate transaction: Postgres cannot use newly added enum labels in the
-- same transaction that adds them.
-- ============================================================================

do $$ begin
  create type public.arena_crew_join_mode as enum ('OPEN', 'REQUEST', 'INVITE_ONLY');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.arena_crew_member_role as enum ('OWNER', 'MODERATOR', 'MEMBER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.arena_crew_invite_status as enum
    ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.arena_crew_request_status as enum
    ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED');
exception when duplicate_object then null; end $$;

alter type public.notification_kind add value if not exists 'arena_crew_invite';
alter type public.notification_kind add value if not exists 'arena_crew_join_request';
alter type public.notification_kind add value if not exists 'arena_crew_join_accepted';
alter type public.notification_kind add value if not exists 'arena_crew_join_declined';

alter type public.report_target add value if not exists 'arena_crew';
alter type public.report_target add value if not exists 'arena_crew_invite';
alter type public.report_target add value if not exists 'arena_crew_join_request';


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20261006120000',
  'arena_crews_enums',
  array['sha256:6d1f29632aa63daea354105371d82876c654152327a66f1f5ea354225fcf3b18'],
  'clash-cloud-wrapper-v1'
);

commit;

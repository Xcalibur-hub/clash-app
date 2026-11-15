-- ============================================================================
-- CLASH cloud wrapper — step 13 of 111
-- version           : 20260927030000
-- ledger name       : clash_scheduler__cloud_nocron
-- mode              : diverged  (see DIVERGENCES.md D-1)
-- executed source   : supabase/cloud/migrations/20260927030000_clash_scheduler__cloud_nocron.sql
-- executed sha256   : 557e77a6148763f7442ff7e8f1892b287f76a923e5e754a254374a35d4261355
-- normalisation     : none
-- normalized sha256 : 557e77a6148763f7442ff7e8f1892b287f76a923e5e754a254374a35d4261355
--
-- ATOMICITY: the migration SQL and its ledger row are committed together.
-- A server-side error before COMMIT aborts the transaction, so neither the
-- schema change nor its ledger row survives. A connection lost around COMMIT
-- can leave the outcome unknown, which is why the runner classifies it from
-- the ledger instead of claiming a rollback.
-- ============================================================================
begin;

-- ============================================================================
-- CLASH 2.0 · CLOUD VARIANT of 0013 — production maintenance scheduler
-- ----------------------------------------------------------------------------
-- BASE FILE  : supabase/migrations/20260927030000_clash_scheduler.sql
--              (3415 bytes, 67 lines — LEFT UNCHANGED, see DIVERGENCES.md)
-- TARGET     : hosted project kgaqejgubjemdecifzew (PostgreSQL 17.11)
-- STATUS     : SUPERSEDES the base file for this environment only.
--
-- WHY THIS VARIANT EXISTS
--   The base file's §1 runs `execute 'create extension if not exists pg_cron'`
--   inside an `exception when others` block, expecting the platform to refuse.
--   On this project the platform does NOT refuse: pg_cron is on
--   `supautils.privileged_extensions`, so the extension installs successfully.
--   The exception handler therefore never fires, §3's guard passes, and
--   `clash-maintenance` gets scheduled at '* * * * *' — executing
--   `public.run_maintenance(500)` every 60 seconds against a database under
--   acceptance test.
--
--   A post-migration cron check would be too late: the first sweep can fire
--   before an operator looks. This variant removes the hazard by construction
--   instead of detecting it afterwards.
--
-- WHAT IS REMOVED (and nothing else)
--   base §1  lines 30-36  `create extension pg_cron` block        REMOVED
--   base §3  lines 45-67  `cron.schedule` block                   REMOVED
--
-- WHAT IS PRESERVED VERBATIM
--   base §2  lines 42-43  the two REVOKE statements               PRESERVED
--   Both targets exist before this position: run_maintenance and
--   settle_due_clashes are created in 20260926170000_production_hardening.sql
--   (file 6). Security posture is additionally re-asserted by eight later
--   migrations, so it does not depend on this file either way.
--
-- FAIL-CLOSED: if pg_cron is ever present, this variant ABORTS instead of
--   silently skipping. A no-op here would hide the fact that maintenance is
--   live, which is exactly the failure mode this file exists to prevent.
-- ============================================================================

-- ── GUARD: refuse to run in any environment where pg_cron already exists ────
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'cloud variant refused: pg_cron is already installed',
      hint    = 'STOP. clash-maintenance would be schedulable here. Investigate before proceeding.';
  end if;

  if exists (select 1 from pg_namespace where nspname = 'cron') then
    raise exception using
      errcode = 'P0001',
      message = 'cloud variant refused: schema "cron" already exists';
  end if;
end $$;

-- ── §2 of base file, preserved verbatim (lines 42-43) ───────────────────────
revoke execute on function public.run_maintenance(integer) from public, anon, authenticated;
revoke execute on function public.settle_due_clashes(integer) from public, anon, authenticated;

-- ── POST-CONDITION: pg_cron must still be absent ─────────────────────────────
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    raise exception 'pg_cron became available during this migration — aborting';
  end if;

  raise notice 'cloud variant OK: pg_cron absent, clash-maintenance NOT scheduled (by design)';
end $$;


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20260927030000',
  'clash_scheduler__cloud_nocron',
  array['sha256:557e77a6148763f7442ff7e8f1892b287f76a923e5e754a254374a35d4261355'],
  'clash-cloud-wrapper-v1'
)
on conflict (version) do nothing;

commit;

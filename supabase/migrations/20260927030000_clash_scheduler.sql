-- ============================================================================
-- CLASH 2.0 · 0013 — production maintenance scheduler (pg_cron)
-- ----------------------------------------------------------------------------
-- Due Clashes now settle on a server-side schedule instead of waiting for a
-- client to open the Clash screen. pg_cron calls the EXISTING authoritative
-- maintenance entry point `run_maintenance`, which already:
--   · settles due Clashes (bounded, failure-tolerant, idempotent)
--   · expires stale Takes
--   · prunes rate-limit history
--   · drives the (still-deferred) media cleanup seam
-- No settlement, economy or cleanup logic is duplicated here.
--
-- WHY pg_cron (not a scheduled Edge Function): the maintenance path is pure
-- SQL, so a database-native scheduler needs no HTTP hop, no extra deploy target
-- and no service-role secret anywhere. Every privileged call stays in Postgres.
--
-- SECURITY: the job runs as `postgres` (the migration role). `run_maintenance`
-- stays un-callable by anon, PUBLIC and authenticated — only the owner and
-- service_role may execute it. The batch `settle_due_clashes` is tightened the
-- same way, because with the scheduler deployed no client needs to sweep the
-- whole queue; the Clash screen keeps its single-Clash `settle_clash` fallback.
--
-- IDEMPOTENT: the extension is created only if absent, any pre-existing job of
-- the same name is unscheduled, then exactly one job is scheduled — so repeated
-- migration runs or redeploys can never leave two jobs behind.
--
-- Hosted deployment + verification: see `supabase/SCHEDULER.md`.
-- ============================================================================

-- ── 1. Enable pg_cron where the platform allows it ──────────────────────────
do $$
begin
  execute 'create extension if not exists pg_cron';
exception when others then
  raise notice 'pg_cron could not be enabled here: %', sqlerrm;
end $$;

-- ── 2. Keep the maintenance surface server-only ─────────────────────────────
-- run_maintenance: the scheduler entry point (owner + service_role only).
-- settle_due_clashes: the batch sweep — the app only needs single-Clash
-- settle_clash, so the whole-queue sweep no longer needs to be client-callable.
revoke execute on function public.run_maintenance(integer) from public, anon, authenticated;
revoke execute on function public.settle_due_clashes(integer) from public, anon, authenticated;

-- ── 3. Schedule (or reschedule) exactly one maintenance job ─────────────────
do $$
declare
  v_jobid bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron unavailable — clash-maintenance not scheduled; see supabase/SCHEDULER.md';
    return;
  end if;

  -- Idempotent: clear any previous job of this name, so repeated runs can never
  -- leave two jobs behind (independent of pg_cron's own upsert behaviour).
  for v_jobid in execute format('select jobid from cron.job where jobname = %L', 'clash-maintenance') loop
    execute format('select cron.unschedule(%s)', v_jobid);
  end loop;

  execute format(
    'select cron.schedule(%L, %L, %L)',
    'clash-maintenance',
    '* * * * *',
    'select public.run_maintenance(500)'
  );
end $$;

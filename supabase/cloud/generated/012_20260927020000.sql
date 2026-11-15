-- ============================================================================
-- CLASH cloud wrapper — step 12 of 111
-- version           : 20260927020000
-- ledger name       : take_insert_lockdown
-- mode              : direct
-- executed source   : supabase/migrations/20260927020000_take_insert_lockdown.sql
-- executed sha256   : bdba99027d183953de0c363532ffa082c372b682a6d09d32bd64686ab8653612
-- normalisation     : none
-- normalized sha256 : bdba99027d183953de0c363532ffa082c372b682a6d09d32bd64686ab8653612
--
-- ATOMICITY: the migration SQL and its ledger row are committed together.
-- A server-side error before COMMIT aborts the transaction, so neither the
-- schema change nor its ledger row survives. A connection lost around COMMIT
-- can leave the outcome unknown, which is why the runner classifies it from
-- the ledger instead of claiming a rollback.
-- ============================================================================
begin;

-- ============================================================================
-- CLASH 2.0 · 0012 — close the direct Take INSERT path
-- ----------------------------------------------------------------------------
-- `create_take` is the only authenticated production path for creating a Take:
-- it derives the author from the session, validates the 1–180 character text and
-- the Hood, validates media ownership/readiness/public visibility
-- (`media_object_id`), and stamps the server-owned expiry, status and counters.
--
-- The legacy column-scoped INSERT grant on `public.takes` let an authenticated
-- client bypass all of that straight through PostgREST. This revokes direct
-- INSERT from every API role.
--
-- `create_take` is SECURITY DEFINER (owner = postgres), so it keeps working
-- without the caller holding raw table INSERT. The seed and server maintenance
-- use service_role, which is untouched. SELECT, the permitted UPDATE columns and
-- DELETE are deliberately left exactly as they were.
-- ============================================================================

-- ── 1. The real fix: the column-scoped INSERT granted in migration 0001 ──────
revoke insert (id, author_id, hood, text, media_url, media_kind, media_caption,
               media_colors, media_duration)
  on public.takes from authenticated;

-- ── 2. Defensive: no table-level INSERT for any API role or PUBLIC ───────────
-- (No-ops today — the grants were column-scoped — but they state the intent and
-- catch a future table-level grant.)
revoke insert on public.takes from authenticated;
revoke insert on public.takes from anon;
revoke insert on public.takes from public;


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20260927020000',
  'take_insert_lockdown',
  array['sha256:bdba99027d183953de0c363532ffa082c372b682a6d09d32bd64686ab8653612'],
  'clash-cloud-wrapper-v1'
)
on conflict (version) do nothing;

commit;

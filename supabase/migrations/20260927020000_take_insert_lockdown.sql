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

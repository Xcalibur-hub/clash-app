-- ============================================================================
-- CLASH 2.0 · media_kind += gif (enum only)
-- Must commit before any statement uses the new label (Postgres rule).
-- ============================================================================

alter type public.media_kind add value if not exists 'gif';

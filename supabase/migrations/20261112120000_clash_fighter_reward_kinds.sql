-- ============================================================================
-- CLASH 2.0 · CANDIDATE — Fighter reward vocabulary (enum only)
-- ----------------------------------------------------------------------------
-- Enum-only migration, on purpose. Postgres forbids *using* a label added by
-- `alter type ... add value` in the same transaction that added it, and each
-- Supabase migration file is one transaction (same constraint documented in
-- 20261002150000_live_arena_enums.sql). The settlement body that writes these
-- labels therefore lives in the following file, after this one has committed.
--
-- PRODUCT POLICY (owner-approved 2026-11-12, text-debate beta):
--   Winning debater    +40 reputation, 0 coins
--   Losing debater     +15 reputation, 0 coins
--   Both on DRAW       +15 reputation each, 0 coins
--   CANCELLED          no reward
-- The existing juror economy is NOT changed by this migration.
--
-- WHY DISTINCT KINDS: fighters and jurors previously shared one vocabulary, so
-- a ledger row could not be attributed to an actor. `clash_fighter_win` and
-- `clash_fighter_participation` make every fighter credit auditable by kind
-- alone and leave all three historical juror kinds untouched.
-- ============================================================================

alter type public.reputation_kind add value if not exists 'clash_fighter_win';
alter type public.reputation_kind add value if not exists 'clash_fighter_participation';

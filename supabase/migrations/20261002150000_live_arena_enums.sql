-- ============================================================================
-- CLASH 2.0 · Phase 13 — Live Daily Arena (enums only)
-- ----------------------------------------------------------------------------
-- Enum-only migration, on purpose. Postgres forbids *using* a label added by
-- `alter type ... add value` in the same transaction that added it, and each
-- Supabase migration file is one transaction. The tables, constraints and RPCs
-- that reference `reputation_kind.arena_*` / `report_target.arena_*` therefore
-- live in 20261002150100_live_arena_schema.sql, which runs after this file has
-- committed.
--
-- Vocabulary notes:
--   · Stance REUSES public.take_stance ('AGREE', 'UNSURE', 'DISAGREE') — the
--     Mindshift type from 20260928100000. There is deliberately no second
--     stance enum: a room stance and a Take stance are the same concept.
--   · Room status is SCREAMING_CASE (matches clash / vault / world rooms);
--     topic status is lowercase (matches take_status, which it mirrors).
-- ============================================================================

-- ── 1. Topic + room lifecycle ───────────────────────────────────────────────
do $$ begin
  create type public.arena_topic_status as enum ('scheduled', 'live', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.arena_room_status as enum
    ('OPEN', 'FINAL_ARGUMENTS', 'JUDGING', 'SETTLED', 'CANCELLED');
exception when duplicate_object then null; end $$;

-- ── 2. Membership + content vocabulary ──────────────────────────────────────
do $$ begin
  create type public.arena_participant_role as enum ('debater', 'spectator');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.arena_message_kind as enum ('text', 'media', 'gif', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.arena_evidence_kind as enum ('image', 'video', 'link');
exception when duplicate_object then null; end $$;

-- ── 3. Verdict ──────────────────────────────────────────────────────────────
-- DRAW is a real outcome (tie, or nobody voted), not an error state — the same
-- modelling the Clash engine settled on in 20260927010000_clash_draw.sql.
do $$ begin
  create type public.arena_winning_side as enum ('AGREE', 'DISAGREE', 'DRAW');
exception when duplicate_object then null; end $$;

-- ── 4. Reward ledger vocabulary ─────────────────────────────────────────────
-- Four award kinds, all written by settle_arena_room() only:
--   arena_participation   every debater who showed up
--   arena_winning_side    voted with the winning side
--   arena_best_argument   authored the most-voted argument
--   arena_useful_evidence authored evidence the room found useful
alter type public.reputation_kind add value if not exists 'arena_participation';
alter type public.reputation_kind add value if not exists 'arena_winning_side';
alter type public.reputation_kind add value if not exists 'arena_best_argument';
alter type public.reputation_kind add value if not exists 'arena_useful_evidence';

-- ── 5. Moderation vocabulary ────────────────────────────────────────────────
-- Room messages and room evidence are reportable content, so they have to be
-- nameable as report / notification targets. Widening an enum is backward
-- compatible; nothing in this file depends on the new labels.
alter type public.report_target add value if not exists 'arena_room_message';
alter type public.report_target add value if not exists 'arena_room_evidence';

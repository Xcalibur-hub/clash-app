-- ============================================================================
-- CLASH 2.0 · Phase 14 — Arena game layer (enums only)
-- ----------------------------------------------------------------------------
-- Enum-only migration, on purpose: Postgres forbids *using* a label added by
-- `alter type ... add value` in the transaction that added it, and each
-- Supabase migration file is one transaction. The tables, triggers, RPCs and
-- policies that reference these labels live in the two files after this one.
--
-- Vocabulary notes
--   · `reputation_facet` is the ANTI-KARMA model. `profiles.reputation` stays
--     exactly what it is (one Clash-engine number, unchanged), while this enum
--     names the five things Arena must never confuse:
--       DEBATE       useful arguments, successful judgement outcomes
--       MIND_IMPACT  a mind genuinely changed in a way the data can prove
--       EVIDENCE     proof the room found useful
--       TRUST        healthy participation, showing up when called
--       ENTERTAINMENT  fun — which NEVER grants authority over arguments.
--   · `arena_standing` is Arena *participation standing*, deliberately distinct
--     from `rank_name` (the global reputation ladder). It unlocks POWER
--     (who may summon, who may be summoned), never basic access.
--   · `arena_room_event_kind` is a small, stable battle-event vocabulary. The
--     database stores truth; the client decides presentation.
-- ============================================================================

-- ── 1. Reputation facets ────────────────────────────────────────────────────
do $$ begin
  create type public.reputation_facet as enum
    ('DEBATE', 'MIND_IMPACT', 'EVIDENCE', 'TRUST', 'ENTERTAINMENT');
exception when duplicate_object then null; end $$;

-- ── 2. Arena standing + Call Backup vocabulary ──────────────────────────────
do $$ begin
  create type public.arena_standing as enum
    ('NEWCOMER', 'CONTRIBUTOR', 'DEBATER', 'VETERAN');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.arena_backup_policy as enum ('EVERYONE', 'FOLLOWING', 'NOBODY');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.arena_backup_status as enum
    ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');
exception when duplicate_object then null; end $$;

-- ── 3. Battle events ────────────────────────────────────────────────────────
-- Every value here is written by exactly one authoritative place:
--   BACKUP_CALLED / BACKUP_ARRIVED / BACKUP_DECLINED / BACKUP_EXPIRED
--       the Call Backup RPCs and their expiry sweep
--   EVIDENCE_SURGED          the evidence trigger (a real burst, not a tap)
--   PHASE_CHANGED / JUDGING_STARTED / RESULT_SETTLED
--       the arena_rooms status trigger — so both the scheduler and
--       settle_arena_room() produce them without being rewritten
--   FAST_RISING_CHANGED      reserved. Fast Rising is derived on read by
--       get_arena_room_pulse and the client already renders the change; we do
--       NOT write a row per reaction (that would be a hot-row write per tap).
-- Reactions are never events: arena_room_message_reactions already holds them.
do $$ begin
  create type public.arena_room_event_kind as enum
    ('BACKUP_CALLED', 'BACKUP_ARRIVED', 'BACKUP_DECLINED', 'BACKUP_EXPIRED',
     'EVIDENCE_SURGED', 'FAST_RISING_CHANGED', 'PHASE_CHANGED',
     'JUDGING_STARTED', 'RESULT_SETTLED');
exception when duplicate_object then null; end $$;

-- ── 4. Reward ledger vocabulary (facets are derived from these kinds) ────────
-- arena_participation / arena_winning_side / arena_best_argument → DEBATE
-- arena_useful_evidence                                        → EVIDENCE
-- arena_backup_arrival    showing up when the room called you    → TRUST
-- arena_crowd_favorite    the room's funniest moment             → ENTERTAINMENT
-- arena_mind_impact       only when attribution is provable      → MIND_IMPACT
alter type public.reputation_kind add value if not exists 'arena_backup_arrival';
alter type public.reputation_kind add value if not exists 'arena_crowd_favorite';
alter type public.reputation_kind add value if not exists 'arena_mind_impact';

-- ── 5. Notification + moderation vocabulary ─────────────────────────────────
alter type public.notification_kind add value if not exists 'arena_backup_request';
alter type public.notification_kind add value if not exists 'arena_backup_arrival';

-- `notifications.entity_type` reuses `report_target`, so an invite has to be
-- nameable there — and an invite is a legitimate moderation target.
alter type public.report_target add value if not exists 'arena_backup_invite';

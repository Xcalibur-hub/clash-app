-- ============================================================================
-- CLASH 2.0 · Phase 15.3 — Creator World Drops (extends the World model)
-- ----------------------------------------------------------------------------
-- Reuses `world_drops` (fuzzed coarse location, block-aware cards, mission
-- support) instead of inventing a parallel hunt system. This migration only
-- ADDS: drop types, a clue, a server-side reward, creator linkage and claims.
--
-- PRIVACY: locations keep the existing fuzz rules. `clue`, `reward_ref` and
-- `reward_payload` are never granted to clients — they leave the database only
-- through SECURITY DEFINER RPCs that decide what a given viewer may see.
-- ============================================================================

do $$ begin
  create type public.world_drop_type as enum ('SECRET_DROP', 'CHALLENGE', 'COLLECTIBLE', 'CREATOR_UNLOCK');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.world_drop_reward as enum ('BADGE', 'COLLECTIBLE', 'CONTENT_UNLOCK', 'WORLD_ACCESS', 'CHALLENGE_STATUS');
exception when duplicate_object then null; end $$;

-- ── Extend the existing Drop model ──────────────────────────────────────────
alter table public.world_drops add column if not exists creator_id text references public.profiles (id) on delete cascade;
alter table public.world_drops add column if not exists drop_type public.world_drop_type not null default 'SECRET_DROP';
alter table public.world_drops add column if not exists clue text;
alter table public.world_drops add column if not exists reward_type public.world_drop_reward not null default 'COLLECTIBLE';
alter table public.world_drops add column if not exists reward_ref text;
alter table public.world_drops add column if not exists reward_payload jsonb;

-- Creator drops may be text-only; mission drops still require media.
alter table public.world_drops alter column media_object_id drop not null;

do $$ begin
  alter table public.world_drops
    add constraint world_drops_clue_len check (clue is null or char_length(clue) between 1 and 280);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.world_drops
    add constraint world_drops_content_unlock_needs_ref check (reward_type <> 'CONTENT_UNLOCK' or reward_ref is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.world_drops
    add constraint world_drops_creator_lock_needs_creator check (drop_type <> 'CREATOR_UNLOCK' or creator_id is not null);
exception when duplicate_object then null; end $$;

create index if not exists world_drops_creator_idx
  on public.world_drops (creator_id, status, published_at desc)
  where creator_id is not null;
-- ── Claims: the discovery record + the entitlement ─────────────────────────
create table if not exists public.world_drop_claims (
  drop_id        text not null references public.world_drops (id) on delete cascade,
  profile_id     text not null references public.profiles (id) on delete cascade,
  reward_type    public.world_drop_reward not null,
  reward_ref     text,
  reward_payload jsonb,
  claimed_at     timestamptz not null default now(),
  primary key (drop_id, profile_id)
);
create index if not exists world_drop_claims_profile_idx
  on public.world_drop_claims (profile_id, claimed_at desc);

alter table public.world_drop_claims enable row level security;

drop policy if exists "a claim is visible to its owner or staff" on public.world_drop_claims;
create policy "a claim is visible to its owner or staff"
  on public.world_drop_claims for select to authenticated
  using (public.owns_profile(profile_id) or public.is_staff());

revoke all on public.world_drop_claims from anon, authenticated, public;
grant select on public.world_drop_claims to authenticated;
grant all on public.world_drop_claims to service_role;

-- ── Column-level protection on world_drops ──────────────────────────────────
-- No client reads this table directly (every read goes through a definer RPC),
-- so hiding the clue/answers/reward here means a crafted public query can never
-- reveal them. Rows are still filtered by the existing RLS policy.
revoke select on public.world_drops from anon, authenticated;
grant select (
  id, mission_id, author_id, media_object_id, caption,
  approx_location, location_cell, location_label, status,
  created_at, published_at, expires_at, deleted_at,
  drop_type, creator_id, reward_type
) on public.world_drops to anon, authenticated;
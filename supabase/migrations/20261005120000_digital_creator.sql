-- ============================================================================
-- CLASH 2.0 · Phase 15.5B — Digital Creator / AI avatar layer
-- ----------------------------------------------------------------------------
-- EXTENDS Phase 15.5. Nothing here replaces Creator AI:
--   · `creator_ai_profiles` keeps its intelligence, knowledge, access and
--     instructions columns and gains only the digital-version configuration.
--   · Generation stays exactly where it was (`creator_ai_begin_turn` /
--     `creator_ai_finish_turn`). An avatar only RENDERS an already-generated,
--     already-authorized reply, so it can never widen knowledge or access.
--
-- PRODUCT MODEL: CLASH never trains a likeness model. A creator authorizes a
-- model with an external provider and stores only a safe provider reference
-- plus an explicit rights confirmation. There is deliberately NO column for a
-- provider key or token anywhere in this schema — those live in the Edge
-- Function runtime environment.
-- ============================================================================

alter table public.creator_ai_profiles
  -- Provider slug, not a vendor list: the server maps a slug to an adapter, so
  -- swapping providers never needs a migration. 'none' means nothing connected.
  add column if not exists avatar_provider text not null default 'none',
  add column if not exists avatar_external_id text,
  add column if not exists voice_external_id text,
  add column if not exists avatar_display_name text,
  add column if not exists avatar_media_object_id text references public.media_objects (id) on delete set null,
  add column if not exists avatar_enabled boolean not null default false,
  add column if not exists voice_enabled boolean not null default false,
  add column if not exists text_fallback_enabled boolean not null default true,
  -- Rights, not assumptions: the creator must confirm they own or may use the
  -- likeness and voice they are connecting, and we record when and under which
  -- wording they did.
  add column if not exists likeness_consent_at timestamptz,
  add column if not exists likeness_consent_version text;

do $$ begin
  alter table public.creator_ai_profiles
    add constraint creator_ai_avatar_provider_slug
    check (avatar_provider ~ '^[a-z0-9_]{1,40}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.creator_ai_profiles
    add constraint creator_ai_external_reference_shape
    check (
      (avatar_external_id is null or avatar_external_id ~ '^[A-Za-z0-9_.:-]{1,120}$')
      and (voice_external_id is null or voice_external_id ~ '^[A-Za-z0-9_.:-]{1,120}$')
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.creator_ai_profiles
    add constraint creator_ai_avatar_needs_consent
    check (
      not avatar_enabled
      or (likeness_consent_at is not null
          and avatar_provider <> 'none'
          and avatar_external_id is not null)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.creator_ai_profiles
    add constraint creator_ai_voice_needs_consent
    check (
      not voice_enabled
      or (likeness_consent_at is not null and avatar_provider <> 'none')
    );
exception when duplicate_object then null; end $$;

-- ── Digital creator sessions ───────────────────────────────────────────────
-- One row per explicit TALK entry so "terminate when leaving" is provable, a
-- disconnect can kill live sessions, and the client gets a short-lived,
-- viewer-safe handle instead of raw provider credentials.
create table if not exists public.digital_creator_sessions (
  id              text primary key,
  creator_id      text not null references public.profiles (id) on delete cascade,
  profile_id      text not null references public.profiles (id) on delete cascade,
  provider        text not null,
  mode            text not null check (mode in ('VOICE', 'AVATAR')),
  status          text not null default 'ACTIVE' check (status in ('ACTIVE', 'ENDED', 'EXPIRED')),
  -- Ephemeral provider-side handle used only to close a rendering session
  -- properly. It is never returned by any RPC and never leaves the server.
  provider_session_ref text,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  expires_at      timestamptz not null
);

create index if not exists digital_creator_sessions_owner_idx
  on public.digital_creator_sessions (profile_id, started_at desc);
create index if not exists digital_creator_sessions_creator_idx
  on public.digital_creator_sessions (creator_id, started_at desc);

alter table public.digital_creator_sessions enable row level security;

-- Only the viewer who opened it may read their own session handle.
drop policy if exists "a digital session is its visitor's business" on public.digital_creator_sessions;
create policy "a digital session is its visitor's business"
  on public.digital_creator_sessions for select to authenticated
  using (public.owns_profile(profile_id));

revoke all on public.digital_creator_sessions from public, anon, authenticated;
grant select on public.digital_creator_sessions to authenticated;
grant all on public.digital_creator_sessions to service_role;

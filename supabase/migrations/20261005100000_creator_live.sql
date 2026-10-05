-- ============================================================================
-- CLASH 2.0 · Phase 15.4 — Interactive Creator Live
-- ----------------------------------------------------------------------------
-- AUDITED FIRST. This phase reuses existing architecture instead of inventing
-- parallel systems:
--   · SECURITY DEFINER RPCs + server-authoritative lifecycle  → Arena Live
--   · Realtime `postgres_changes` over an RLS-scoped publication
--     (`supabase_realtime`, arena_room_messages)               → same transport
--   · `vault_profiles_blocked` + subscription entitlement gates → those predicates
--   · `assert_rate_limit`, `play_notify`, `submit_report`       → shared helpers
--
-- VIDEO: the media layer is replaceable and deliberately thin. The database
-- stores an optional creator-supplied https stream URL plus a poster; when no
-- provider URL exists the client renders an honest standby poster (never a
-- still masquerading as video). Interaction state never depends on the provider.
--
-- SERVER AUTHORITY: viewers submit intent only. Totals, results and triggered
-- actions are computed here. A trigger can only ever emit one of the
-- pre-approved `creator_live_action_kind` identifiers — never URLs, IPs,
-- commands, scripts, device ids or free-form payloads.
-- ============================================================================

do $$ begin
  create type public.creator_live_status as enum ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.creator_live_access as enum ('FREE', 'SUBSCRIBER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.creator_live_interaction_type as enum ('POLL', 'CHOICE', 'CROWD_ACTION', 'GAME_ACTION');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.creator_live_interaction_status as enum ('OPEN', 'CLOSED', 'TRIGGERED', 'CANCELLED');
exception when duplicate_object then null; end $$;

-- The complete, closed set of identifiers a crowd/game action may ever emit.
-- A future approved hardware adapter switches on these labels only.
do $$ begin
  create type public.creator_live_action_kind as enum
    ('LIGHTS_OFF', 'LIGHTS_ON', 'OPEN_LEFT_DOOR', 'OPEN_RIGHT_DOOR',
     'FOG_BURST', 'MUSIC_STING', 'CAMERA_CUT', 'HOLD_FRAME');
exception when duplicate_object then null; end $$;

alter type public.notification_kind add value if not exists 'creator_live';
alter type public.report_target add value if not exists 'creator_live_session';

-- ── Sessions ────────────────────────────────────────────────────────────────
create table if not exists public.creator_live_sessions (
  id                    text primary key,
  creator_id            text not null references public.profiles (id) on delete cascade,
  vault_id              text not null references public.creator_vaults (id) on delete cascade,
  title                 text not null check (char_length(title) between 1 and 120),
  description           text not null default '' check (char_length(description) <= 400),
  cover_media_object_id text references public.media_objects (id) on delete set null,
  -- Replaceable media layer. 'standby' means: no provider attached yet.
  stream_url            text check (stream_url is null or (char_length(stream_url) <= 500 and stream_url ~ '^https://')),
  provider              text not null default 'standby' check (provider in ('standby', 'hls', 'file', 'embed')),
  access                public.creator_live_access not null default 'FREE',
  status                public.creator_live_status not null default 'SCHEDULED',
  -- What this creator explicitly allows its crowd to do. Nothing is implicit.
  allow_polls           boolean not null default true,
  allow_choices         boolean not null default true,
  allow_crowd_actions   boolean not null default false,
  allow_game_actions    boolean not null default false,
  scheduled_at          timestamptz,
  started_at            timestamptz,
  ended_at              timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint creator_live_started check (status <> 'LIVE' or started_at is not null),
  constraint creator_live_ended check (ended_at is null or started_at is null or ended_at >= started_at),
  constraint creator_live_provider_url check (provider = 'standby' or stream_url is not null)
);

create index if not exists creator_live_sessions_creator_idx
  on public.creator_live_sessions (creator_id, created_at desc);
create index if not exists creator_live_sessions_live_idx
  on public.creator_live_sessions (status, scheduled_at)
  where status in ('SCHEDULED', 'LIVE');

-- ── Interactions ────────────────────────────────────────────────────────────
-- POLL / CHOICE / GAME_ACTION are option-based; CROWD_ACTION is threshold-based
-- and emits exactly one whitelisted action identifier when the crowd fills it.
create table if not exists public.creator_live_interactions (
  id               text primary key,
  session_id       text not null references public.creator_live_sessions (id) on delete cascade,
  creator_id       text not null references public.profiles (id) on delete cascade,
  type             public.creator_live_interaction_type not null,
  prompt           text not null check (char_length(prompt) between 1 and 160),
  options          jsonb,
  action_kind      public.creator_live_action_kind,
  threshold        integer check (threshold is null or threshold between 2 and 1000000),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 5 and 3600),
  status           public.creator_live_interaction_status not null default 'OPEN',
  opened_at        timestamptz not null default now(),
  closes_at        timestamptz,
  closed_at        timestamptz,
  -- Server-computed only. Never accepted from a client.
  tallies          jsonb not null default '{}'::jsonb,
  total_votes      integer not null default 0 check (total_votes >= 0),
  result           jsonb,
  trigger_count    integer not null default 0 check (trigger_count between 0 and 1),
  triggered_at     timestamptz,
  created_at       timestamptz not null default now(),
  constraint creator_live_options_shape check (
    (type = 'CROWD_ACTION' and options is null and action_kind is not null and threshold is not null)
    or (type <> 'CROWD_ACTION' and options is not null and action_kind is null)
  )
);

create index if not exists creator_live_interactions_session_idx
  on public.creator_live_interactions (session_id, opened_at desc);
create index if not exists creator_live_interactions_open_idx
  on public.creator_live_interactions (session_id) where status = 'OPEN';

-- ── Votes / supports ───────────────────────────────────────────────────────
-- One row per viewer per interaction: duplicate submissions are idempotent and
-- a viewer can never inflate a tally. Never exposed for other viewers.
create table if not exists public.creator_live_votes (
  interaction_id text not null references public.creator_live_interactions (id) on delete cascade,
  profile_id     text not null references public.profiles (id) on delete cascade,
  option_id      text,
  created_at     timestamptz not null default now(),
  primary key (interaction_id, profile_id)
);
create index if not exists creator_live_votes_profile_idx
  on public.creator_live_votes (profile_id, created_at desc);

-- ── Viewer-safe event log (Realtime transport) ─────────────────────────────
-- Append-only, authored exclusively by definer RPCs. Payload is aggregate and
-- viewer-safe by construction; it is the resync source after a reconnect.
create table if not exists public.creator_live_events (
  id             text primary key,
  session_id     text not null references public.creator_live_sessions (id) on delete cascade,
  interaction_id text references public.creator_live_interactions (id) on delete cascade,
  kind           text not null check (kind in
                   ('SESSION_STARTED', 'SESSION_ENDED', 'INTERACTION_OPENED', 'INTERACTION_CLOSED',
                    'ACTION_TRIGGERED', 'TALLY')),
  action_kind    public.creator_live_action_kind,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists creator_live_events_session_idx
  on public.creator_live_events (session_id, created_at desc);

-- ── Watch presence (counts only) ───────────────────────────────────────────
-- A heartbeat row per viewer. The only thing ever read out is a COUNT of rows
-- seen in the last window: no identities are exposed to anyone but staff.
create table if not exists public.creator_live_viewers (
  session_id   text not null references public.creator_live_sessions (id) on delete cascade,
  profile_id   text not null references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (session_id, profile_id)
);
create index if not exists creator_live_viewers_seen_idx
  on public.creator_live_viewers (session_id, last_seen_at desc);


-- ── Access predicate (mirrors the community predicate) ─────────────────────
-- Honest about *whose* access it answers: it takes the viewer explicitly and is
-- reused by RLS, by the read RPCs and by the vote path.
create or replace function public.creator_live_viewer_can_access(
  p_session_id text,
  p_viewer     text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.creator_live_sessions%rowtype;
begin
  select * into v from public.creator_live_sessions where id = p_session_id;
  if not found then
    return false;
  end if;
  if p_viewer is not null and p_viewer = v.creator_id then
    return true;
  end if;
  if public.is_staff() then
    return true;
  end if;
  if v.status = 'CANCELLED' then
    return false;
  end if;
  -- A guest only ever sees a free session; subscriber sessions need a session,
  -- exactly like a guest seeing only free Vault content.
  if p_viewer is null then
    return v.access = 'FREE';
  end if;
  if public.vault_profiles_blocked(p_viewer, v.creator_id) then
    return false;
  end if;
  if v.access = 'FREE' then
    return true;
  end if;
  return exists (
    select 1
      from public.creator_vaults cv
      join public.vault_subscriptions s on s.vault_id = cv.id
     where cv.creator_id = v.creator_id
       and cv.status = 'active'
       and s.subscriber_id = p_viewer
       and s.status in ('active', 'trial')
       and s.current_period_end > now()
  );
end;
$$;

-- ── Row Level Security ─────────────────────────────────────────────────────
-- Every write goes through a SECURITY DEFINER RPC: there is no client INSERT or
-- UPDATE policy anywhere below.
alter table public.creator_live_sessions     enable row level security;
alter table public.creator_live_interactions enable row level security;
alter table public.creator_live_votes        enable row level security;
alter table public.creator_live_events       enable row level security;
alter table public.creator_live_viewers      enable row level security;

drop policy if exists "live sessions are readable when permitted" on public.creator_live_sessions;
create policy "live sessions are readable when permitted"
  on public.creator_live_sessions for select to authenticated
  using (public.creator_live_viewer_can_access(id, public.my_profile_id()));

drop policy if exists "live interactions follow their session" on public.creator_live_interactions;
create policy "live interactions follow their session"
  on public.creator_live_interactions for select to authenticated
  using (public.creator_live_viewer_can_access(session_id, public.my_profile_id()));

drop policy if exists "live events follow their session" on public.creator_live_events;
create policy "live events follow their session"
  on public.creator_live_events for select to authenticated
  using (public.creator_live_viewer_can_access(session_id, public.my_profile_id()));

drop policy if exists "a live vote is its own business" on public.creator_live_votes;
create policy "a live vote is its own business"
  on public.creator_live_votes for select to authenticated
  using (public.owns_profile(profile_id) or public.is_staff());

-- ── Privileges ─────────────────────────────────────────────────────────────
revoke all on public.creator_live_sessions     from public, anon, authenticated;
revoke all on public.creator_live_interactions from public, anon, authenticated;
revoke all on public.creator_live_votes        from public, anon, authenticated;
revoke all on public.creator_live_events       from public, anon, authenticated;
revoke all on public.creator_live_viewers      from public, anon, authenticated;

grant select on public.creator_live_sessions     to authenticated;
grant select on public.creator_live_interactions to authenticated;
grant select on public.creator_live_events       to authenticated;
grant select on public.creator_live_votes        to authenticated;
grant all on public.creator_live_sessions     to service_role;
grant all on public.creator_live_interactions to service_role;
grant all on public.creator_live_votes        to service_role;
grant all on public.creator_live_events       to service_role;
grant all on public.creator_live_viewers      to service_role;

-- The predicate itself is internal. `authenticated` keeps EXECUTE because RLS
-- policy expressions are evaluated as the querying role.
revoke execute on function public.creator_live_viewer_can_access(text, text) from public, anon;

-- ── Realtime publication (transport only) ──────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table public.creator_live_sessions;
exception when duplicate_object then null; when undefined_object then null; when others then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.creator_live_interactions;
exception when duplicate_object then null; when undefined_object then null; when others then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.creator_live_events;
exception when duplicate_object then null; when undefined_object then null; when others then null;
end $$;

-- Watch presence is aggregate-only: it never rides the realtime bus.
do $$ begin
  alter publication supabase_realtime drop table public.creator_live_viewers;
exception when undefined_object then null; when undefined_table then null; when others then null;
end $$;


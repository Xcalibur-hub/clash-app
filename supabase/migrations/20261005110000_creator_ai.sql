-- ============================================================================
-- CLASH 2.0 · Phase 15.5 — Creator AI
-- ----------------------------------------------------------------------------
-- AUDITED FIRST. This phase adds the first AI surface in CLASH, so it reuses
-- what already exists instead of inventing parallel systems:
--   · entitlement shape        → the community/drop predicates
--   · `vault_profiles_blocked` → blocks
--   · `assert_rate_limit`      → provider cost control
--   · `submit_report`          → moderation
--   · Edge Function + Deno     → the only place a provider key may live
--
-- CORE RULES ENFORCED HERE:
--   1. The AI is a DISCLOSED AI version of a creator. `display_name` is the AI
--      name; no field may claim to be the creator.
--   2. Knowledge is creator-approved only, and every retrieval validates BOTH
--      that the creator allowed the material AND that the viewer is entitled to
--      it. Unapproved or unauthorized content never enters a prompt.
--   3. `instructions` (creator-authored personality notes) are private
--      configuration: never returned by any viewer-facing RPC.
--   4. Assistant messages can only be written by the server (service role after
--      a provider call) — there is no client insert path at all.
-- ============================================================================

do $$ begin
  create type public.creator_ai_access as enum ('FREE', 'SUBSCRIBER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.creator_ai_knowledge_kind as enum ('NOTE', 'VAULT_DROP', 'COLLECTION', 'COURSE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.creator_ai_role as enum ('user', 'assistant');
exception when duplicate_object then null; end $$;

alter type public.report_target add value if not exists 'creator_ai_message';

-- ── One configuration per creator ──────────────────────────────────────────
create table if not exists public.creator_ai_profiles (
  creator_id            text primary key references public.profiles (id) on delete cascade,
  enabled               boolean not null default false,
  display_name          text not null check (char_length(display_name) between 1 and 40),
  description           text not null default '' check (char_length(description) <= 300),
  welcome_message       text not null default '' check (char_length(welcome_message) <= 500),
  -- Creator-authored personality notes. Private configuration; never projected
  -- to a viewer and never returned by a public RPC.
  instructions          text not null default '' check (char_length(instructions) <= 4000),
  access                public.creator_ai_access not null default 'FREE',
  starters              jsonb not null default '[]'::jsonb,
  artwork_media_object_id text references public.media_objects (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── Creator-approved knowledge ─────────────────────────────────────────────
-- A NOTE carries creator-written text. The other kinds POINT at existing CLASH
-- content and inherit its access level, so retrieval can require entitlement.
create table if not exists public.creator_ai_knowledge (
  id         text primary key,
  creator_id text not null references public.profiles (id) on delete cascade,
  kind       public.creator_ai_knowledge_kind not null,
  title      text not null check (char_length(title) between 1 and 120),
  body       text check (body is null or char_length(body) between 1 and 4000),
  source_id  text,
  access     public.creator_ai_access not null default 'FREE',
  created_at timestamptz not null default now(),
  constraint creator_ai_knowledge_shape check (
    (kind = 'NOTE' and body is not null and source_id is null)
    or (kind <> 'NOTE' and source_id is not null)
  )
);
create index if not exists creator_ai_knowledge_creator_idx
  on public.creator_ai_knowledge (creator_id, created_at desc);

-- ── Conversations (one per fan per creator) ────────────────────────────────
-- Private by construction: only the fan who owns it can read it, and the
-- creator has no read path at all in this phase.
create table if not exists public.creator_ai_conversations (
  id              text primary key,
  creator_id      text not null references public.profiles (id) on delete cascade,
  profile_id      text not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (creator_id, profile_id)
);
create index if not exists creator_ai_conversations_profile_idx
  on public.creator_ai_conversations (profile_id, last_message_at desc);

create table if not exists public.creator_ai_messages (
  id              text primary key,
  conversation_id text not null references public.creator_ai_conversations (id) on delete cascade,
  role            public.creator_ai_role not null,
  body            text not null check (char_length(body) between 1 and 4000),
  -- Provenance for assistant rows: which adapter answered. Always visible in the
  -- UI so an answer is never mistaken for the human creator or for a person.
  provider        text,
  model           text,
  created_at      timestamptz not null default now()
);
create index if not exists creator_ai_messages_conversation_idx
  on public.creator_ai_messages (conversation_id, created_at desc);

-- ── Entitlement predicate ──────────────────────────────────────────────────
-- Answers "may this viewer talk to this creator's AI?" for RLS and RPCs alike.
-- Disabling AI removes access immediately, and a block closes it permanently.
create or replace function public.creator_ai_viewer_can_access(
  p_creator_id text,
  p_viewer     text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.creator_ai_profiles%rowtype;
begin
  select * into v from public.creator_ai_profiles where creator_id = p_creator_id;
  if not found or not v.enabled then
    return false;
  end if;
  if p_viewer is not null and p_viewer = p_creator_id then
    return true;
  end if;
  if public.is_staff() then
    return true;
  end if;
  -- Talking to an AI is an authenticated action; there is no guest chat.
  if p_viewer is null then
    return false;
  end if;
  if public.vault_profiles_blocked(p_viewer, p_creator_id) then
    return false;
  end if;
  if v.access = 'FREE' then
    return true;
  end if;
  return exists (
    select 1
      from public.creator_vaults cv
      join public.vault_subscriptions s on s.vault_id = cv.id
     where cv.creator_id = p_creator_id
       and cv.status = 'active'
       and s.subscriber_id = p_viewer
       and s.status in ('active', 'trial')
       and s.current_period_end > now()
  );
end;
$$;

-- ── Row Level Security ─────────────────────────────────────────────────────
alter table public.creator_ai_profiles      enable row level security;
alter table public.creator_ai_knowledge     enable row level security;
alter table public.creator_ai_conversations enable row level security;
alter table public.creator_ai_messages      enable row level security;

-- Configuration and knowledge are never read directly by a client: every read
-- goes through a definer RPC that projects only viewer-safe fields, which is
-- what keeps `instructions` and knowledge bodies out of client reach.
-- Conversations and messages are readable by their owner only.
drop policy if exists "a conversation is its owner's business" on public.creator_ai_conversations;
create policy "a conversation is its owner's business"
  on public.creator_ai_conversations for select to authenticated
  using (public.owns_profile(profile_id));

drop policy if exists "messages follow their conversation" on public.creator_ai_messages;
create policy "messages follow their conversation"
  on public.creator_ai_messages for select to authenticated
  using (exists (
    select 1 from public.creator_ai_conversations c
     where c.id = conversation_id and public.owns_profile(c.profile_id)
  ));

-- ── Privileges: reads only, writes exclusively through definer RPCs ────────
revoke all on public.creator_ai_profiles      from public, anon, authenticated;
revoke all on public.creator_ai_knowledge     from public, anon, authenticated;
revoke all on public.creator_ai_conversations from public, anon, authenticated;
revoke all on public.creator_ai_messages      from public, anon, authenticated;

grant select on public.creator_ai_conversations to authenticated;
grant select on public.creator_ai_messages      to authenticated;

grant all on public.creator_ai_profiles      to service_role;
grant all on public.creator_ai_knowledge     to service_role;
grant all on public.creator_ai_conversations to service_role;
grant all on public.creator_ai_messages      to service_role;

revoke execute on function public.creator_ai_viewer_can_access(text, text) from public, anon;


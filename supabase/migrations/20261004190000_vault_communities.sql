-- ============================================================================
-- CLASH 2.0 · Phase 15.2 — Creator Communities (inside Creator Worlds)
-- ----------------------------------------------------------------------------
-- One primary community per creator. It lives INSIDE the Creator World and is
-- gated by public / followers / subscribers. Access is enforced server-side on
-- every read and write — the client UI is presentation only.
--
-- Reuses the existing foundations unchanged:
--   · blocks / reports / moderation_actions / staff roles
--   · notifications (server-written) + `vault_notify`
--   · the media lifecycle (`media_objects`, public bucket only here)
--   · `assert_rate_limit` for throttling
-- No second media or safety architecture is introduced.
--
-- PSEUDONYMOUS PARTICIPATION. A community may allow it. Public payloads then
-- carry a stable, community-scoped alias instead of the real identity, but the
-- backend ALWAYS keeps `author_profile_id`, so moderation still works. There is
-- no true, untraceable anonymity here.
-- ============================================================================

-- ── 1. Domain types ─────────────────────────────────────────────────────────
do $$ begin
  create type public.vault_community_access as enum ('public', 'followers', 'subscribers');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vault_community_status as enum ('active', 'disabled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vault_community_post_type as enum ('discussion', 'announcement');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vault_community_content_status as enum ('visible', 'hidden', 'deleted');
exception when duplicate_object then null; end $$;

-- Notification vocabulary. Added here, referenced only at runtime from the RPC
-- migration (a later transaction), so no DDL below depends on the new labels.
alter type public.notification_kind add value if not exists 'community_announcement';
alter type public.notification_kind add value if not exists 'community_reply';

-- Reports reuse the existing intake; both community surfaces are reportable.
alter type public.report_target add value if not exists 'community_post';
alter type public.report_target add value if not exists 'community_reply';


-- ── 2. Tables ───────────────────────────────────────────────────────────────
-- One community per creator (`creator_id` UNIQUE): the product rule, enforced by
-- the database rather than by remembering to check it in the app.
create table if not exists public.vault_communities (
  id                   text primary key,
  creator_id           text not null unique references public.profiles (id) on delete cascade,
  vault_id             text not null references public.creator_vaults (id) on delete cascade,
  name                 text not null check (char_length(name) between 1 and 60),
  description          text not null default '' check (char_length(description) <= 280),
  access_type          public.vault_community_access not null default 'public',
  status               public.vault_community_status not null default 'active',
  pseudonymous_enabled boolean not null default false,
  rules                text not null default '' check (char_length(rules) <= 1000),
  icon_media_object_id text references public.media_objects (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists vault_communities_creator_idx
  on public.vault_communities (creator_id);

-- The smallest membership needed: join state, scoped alias, last-seen. Access
-- itself is still DERIVED from auth + follows + entitlement every time.
create table if not exists public.vault_community_memberships (
  community_id text not null references public.vault_communities (id) on delete cascade,
  profile_id   text not null references public.profiles (id) on delete cascade,
  alias        text,
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (community_id, profile_id)
);
create index if not exists vault_community_memberships_recent_idx
  on public.vault_community_memberships (community_id, last_seen_at desc);

create table if not exists public.vault_community_posts (
  id                text primary key,
  community_id      text not null references public.vault_communities (id) on delete cascade,
  author_profile_id text not null references public.profiles (id) on delete cascade,
  post_type         public.vault_community_post_type not null default 'discussion',
  body              text not null check (char_length(body) between 1 and 2000),
  media_object_id   text references public.media_objects (id) on delete set null,
  pseudonymous      boolean not null default false,
  status            public.vault_community_content_status not null default 'visible',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index if not exists vault_community_posts_feed_idx
  on public.vault_community_posts (community_id, created_at desc, id desc);
create index if not exists vault_community_posts_author_idx
  on public.vault_community_posts (author_profile_id, created_at desc);

create table if not exists public.vault_community_replies (
  id                text primary key,
  post_id           text not null references public.vault_community_posts (id) on delete cascade,
  community_id      text not null references public.vault_communities (id) on delete cascade,
  author_profile_id text not null references public.profiles (id) on delete cascade,
  parent_reply_id   text references public.vault_community_replies (id) on delete cascade,
  body              text not null check (char_length(body) between 1 and 1000),
  pseudonymous      boolean not null default false,
  status            public.vault_community_content_status not null default 'visible',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index if not exists vault_community_replies_post_idx
  on public.vault_community_replies (post_id, created_at asc, id asc);


-- ── 3. Pseudonym derivation (server-authoritative, stable per community) ─────
/**
 * Deterministic 32-bit FNV-1a hash of `<community>:<profile>`. Immutable and
 * mirrored exactly in `utils/vaultCommunityPseudonym.ts`, so a client can show
 * the same alias while the server stays the only authority that stores it.
 */
create or replace function public.vault_community_seed(p_community_id text, p_profile_id text)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_input text := coalesce(p_community_id, '') || ':' || coalesce(p_profile_id, '');
  v_hash  bigint := 2166136261;
  v_len   integer := char_length(v_input);
  i       integer;
begin
  for i in 1..v_len loop
    v_hash := v_hash # ascii(substr(v_input, i, 1))::bigint;
    v_hash := (v_hash * 16777619) % 4294967296;
  end loop;
  return v_hash;
end;
$$;

/**
 * Stable, community-scoped alias ("Night Owl 27"). Same user + same community
 * always derives the same alias; different communities derive independently.
 * Deterministic by design — never randomized per render.
 */
create or replace function public.vault_community_alias(p_community_id text, p_profile_id text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_adjectives text[] := array[
    'Night', 'Quiet', 'Silver', 'Amber', 'Velvet', 'Copper', 'Indigo', 'Hollow', 'Ember', 'Pale'
  ];
  v_nouns text[] := array[
    'Owl', 'Pixel', 'Fox', 'Wren', 'Harbor', 'Lantern', 'Sparrow', 'Kite', 'Cinder', 'Marlow'
  ];
  v_hash bigint;
  v_a    integer;
  v_n    integer;
  v_num  integer;
begin
  if p_community_id is null or p_profile_id is null then
    return null;
  end if;
  v_hash := public.vault_community_seed(p_community_id, p_profile_id);
  v_a := (v_hash % array_length(v_adjectives, 1))::integer + 1;
  v_n := ((v_hash / array_length(v_adjectives, 1)) % array_length(v_nouns, 1))::integer + 1;
  v_num := ((v_hash / (array_length(v_adjectives, 1) * array_length(v_nouns, 1))) % 90)::integer + 10;
  return v_adjectives[v_a] || ' ' || v_nouns[v_n] || ' ' || v_num::text;
end;
$$;


-- ── 4. Access predicate (the single place access is decided) ─────────────────
/**
 * The one authoritative answer for "may this viewer enter this community?".
 * Mirrors the CLASH block semantics exactly through `vault_profiles_blocked`:
 * a blocked pair is never permitted. Public requires a signed-in account;
 * followers requires a live follow; subscribers requires a live entitlement.
 * The creator (and staff) always reach their own room.
 */
create or replace function public.vault_community_viewer_can_access(
  p_viewer text,
  p_community_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.vault_communities%rowtype;
begin
  select * into v from public.vault_communities where id = p_community_id;
  if not found then
    return false;
  end if;
  if p_viewer is not null and p_viewer = v.creator_id then
    return true;
  end if;
  if public.is_staff() then
    return true;
  end if;
  -- Communities require a signed-in account; there is no guest read.
  if p_viewer is null then
    return false;
  end if;
  if v.status <> 'active' then
    return false;
  end if;
  if public.vault_profiles_blocked(p_viewer, v.creator_id) then
    return false;
  end if;

  if v.access_type = 'public' then
    return true;
  elsif v.access_type = 'followers' then
    return exists (
      select 1 from public.follows f
       where f.follower_id = p_viewer and f.following_id = v.creator_id
    );
  end if;

  -- Subscribers: an explicit viewer-scoped check (never the session's own
  -- entitlement), so the predicate is honest about *whose* access it answers.
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


-- ── 5. Row Level Security ───────────────────────────────────────────────────
alter table public.vault_communities           enable row level security;
alter table public.vault_community_memberships enable row level security;
alter table public.vault_community_posts       enable row level security;
alter table public.vault_community_replies     enable row level security;

-- A community's identity (name / description / access / counts) is listable so a
-- viewer can be shown a join card before they qualify. Posts stay gated below.
drop policy if exists "a community is listable while active" on public.vault_communities;
create policy "a community is listable while active"
  on public.vault_communities for select to authenticated
  using (
    public.owns_profile(creator_id)
    or public.is_staff()
    or (status = 'active' and not public.vault_profiles_blocked(public.my_profile_id(), creator_id))
  );

drop policy if exists "a membership is visible to its member or creator" on public.vault_community_memberships;
create policy "a membership is visible to its member or creator"
  on public.vault_community_memberships for select to authenticated
  using (
    public.owns_profile(profile_id)
    or public.is_staff()
    or exists (
      select 1 from public.vault_communities c
       where c.id = community_id and public.owns_profile(c.creator_id)
    )
  );

drop policy if exists "a community post is visible to the community" on public.vault_community_posts;
create policy "a community post is visible to the community"
  on public.vault_community_posts for select to authenticated
  using (
    (status = 'visible' and public.vault_community_viewer_can_access(public.my_profile_id(), community_id))
    or public.owns_profile(author_profile_id)
    or public.is_staff()
    or exists (
      select 1 from public.vault_communities c
       where c.id = community_id and public.owns_profile(c.creator_id)
    )
  );

drop policy if exists "a community reply is visible to the community" on public.vault_community_replies;
create policy "a community reply is visible to the community"
  on public.vault_community_replies for select to authenticated
  using (
    (status = 'visible' and public.vault_community_viewer_can_access(public.my_profile_id(), community_id))
    or public.owns_profile(author_profile_id)
    or public.is_staff()
    or exists (
      select 1 from public.vault_communities c
       where c.id = community_id and public.owns_profile(c.creator_id)
    )
  );


-- ── 6. Data API privileges ──────────────────────────────────────────────────
-- State least privilege explicitly: revoke everything first, then grant reads
-- only. There are NO client write grants anywhere in Communities — every
-- mutation is a SECURITY DEFINER RPC in the next migration.
revoke all on public.vault_communities, public.vault_community_memberships,
              public.vault_community_posts, public.vault_community_replies
  from anon, authenticated, public;

grant select on public.vault_communities, public.vault_community_memberships,
                public.vault_community_posts, public.vault_community_replies
  to authenticated;

grant all on public.vault_communities, public.vault_community_memberships,
             public.vault_community_posts, public.vault_community_replies
  to service_role;

-- The access predicate is a read-only boolean that exposes no content, so a
-- signed-in client may call it too. Guests may not.
grant execute on function public.vault_community_viewer_can_access(text, text) to authenticated;
revoke execute on function public.vault_community_viewer_can_access(text, text) from public, anon;

-- Alias derivation is presentation-safe (it reveals nothing about the source
-- profile) and lets the composer mirror the server's alias before posting.
grant execute on function public.vault_community_alias(text, text) to authenticated;
revoke execute on function public.vault_community_alias(text, text) from public, anon;

-- Internal hashing primitive: no client needs it.
revoke execute on function public.vault_community_seed(text, text) from public, anon, authenticated;


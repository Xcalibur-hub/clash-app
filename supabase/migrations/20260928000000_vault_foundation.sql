-- ============================================================================
-- CLASH 2.0 · 0014 — Vault foundation (creator spaces, drops, collections)
-- ----------------------------------------------------------------------------
-- The production data + security architecture behind creator Vaults. Nothing
-- here changes Arena behaviour: the Vault reads its own tables and reuses the
-- existing media, safety and notification foundations unchanged.
--
-- OWNERSHIP. A creator is a normal `public.profiles` row — there is no second
-- identity system. Every write resolves the caller through `my_profile_id()`
-- (migration 0003); no function accepts a creator id as authority.
-- `creator_vaults.creator_id` is UNIQUE, so one creator cannot accidentally
-- own two Vaults.
--
-- COLLECTION PERMANENCE — the deliberate model:
--   · Expiry is a STATUS TRANSITION, never a delete. When a Drop's 7-day window
--     closes, `expire_vault_drops()` only flips status `published` → `expired`;
--     the row, its media reference and every collection item survive.
--   · `vault_collection_items` therefore points at the Drop row itself, not at
--     a transient feed instance, so a curated Collection keeps its content.
--   · The `vault_drops` SELECT policy admits a Drop when it is live in the feed
--     (published, unexpired) OR when it is collected (published/expired but
--     referenced by a Collection). That one policy is what makes "expired from
--     the feed, permanent in the Collection" true at the database level.
--   · Removal (`delete_vault_drop`) is a tombstone — `status = 'removed'` plus
--     `deleted_at` — so a creator can retract content while the Collection's
--     structure survives.
--
-- LAYERS (same three as migration 0001): RLS decides which rows, GRANTs decide
-- which columns, SECURITY DEFINER functions own every write.
-- ============================================================================

-- ── 1. Domain types ─────────────────────────────────────────────────────────
do $$ begin
  create type public.vault_status as enum ('draft', 'active', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vault_drop_access as enum ('free', 'subscriber');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vault_drop_status as enum ('draft', 'published', 'expired', 'removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vault_subscription_status as enum ('active', 'trial', 'cancelled', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vault_subscription_source as enum ('test', 'admin', 'promo', 'payment');
exception when duplicate_object then null; end $$;

-- Notification vocabulary for Vault events. Added here and only ever referenced
-- at runtime, so no DDL below depends on the new label.
alter type public.notification_kind add value if not exists 'vault_drop';


-- ── 2. Creator Vaults ───────────────────────────────────────────────────────
-- One row per creator (UNIQUE creator_id): the product rule, enforced by the
-- database rather than by remembering to check it in the app.
create table if not exists public.creator_vaults (
  id          text primary key,
  creator_id  text not null unique references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 60),
  description text not null default '' check (char_length(description) <= 280),
  status      public.vault_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists creator_vaults_creator_idx on public.creator_vaults (creator_id);
create index if not exists creator_vaults_status_idx on public.creator_vaults (status);

-- ── 3. Vault Drops ──────────────────────────────────────────────────────────
-- `media_object_id` is the authority reference (the pattern migration 0009 gave
-- `takes`): `media_objects` owns bucket, path and visibility, and its CHECK
-- already pins private media to the `private-media` bucket.
--
-- The 7-day window is a database rule: `vault_drops_window` forces
-- `expires_at = published_at + 7 days`, so no client can extend it, shorten it
-- or backdate it. A `draft` carries neither stamp.
create table if not exists public.vault_drops (
  id              text primary key,
  vault_id        text not null references public.creator_vaults (id) on delete cascade,
  creator_id      text not null references public.profiles (id) on delete cascade,
  caption         text not null check (char_length(caption) between 1 and 280),
  media_object_id text references public.media_objects (id),
  access_level    public.vault_drop_access not null default 'free',
  status          public.vault_drop_status not null default 'draft',
  created_at      timestamptz not null default now(),
  published_at    timestamptz,
  expires_at      timestamptz,
  -- Tombstone for `delete_vault_drop`. Never a hard delete: a Collection may be
  -- holding this Drop, and the media it points at is a separate row.
  deleted_at      timestamptz,
  constraint vault_drops_window check (
    (published_at is null and expires_at is null)
    or (published_at is not null and expires_at = published_at + interval '7 days')
  ),
  constraint vault_drops_draft_unpublished check (
    status <> 'draft' or published_at is null
  )
);
create index if not exists vault_drops_vault_idx
  on public.vault_drops (vault_id, status, published_at desc);
create index if not exists vault_drops_creator_idx on public.vault_drops (creator_id);
-- Partial index: the expiry sweep only ever looks at published, due rows.
create index if not exists vault_drops_due_idx
  on public.vault_drops (expires_at) where status = 'published';

-- ── 4. Collections (permanent) ──────────────────────────────────────────────
create table if not exists public.vault_collections (
  id          text primary key,
  vault_id    text not null references public.creator_vaults (id) on delete cascade,
  creator_id  text not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 280),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists vault_collections_vault_idx on public.vault_collections (vault_id);

-- The permanence join. `drop_id` is the Drop ROW, which outlives its feed window
-- (see the header). `on delete cascade` exists only so a profile deletion can
-- clean up; no client-reachable path hard-deletes a Drop or a Collection.
create table if not exists public.vault_collection_items (
  collection_id text not null references public.vault_collections (id) on delete cascade,
  drop_id       text not null references public.vault_drops (id) on delete cascade,
  position      integer not null default 0 check (position >= 0),
  added_at      timestamptz not null default now(),
  primary key (collection_id, drop_id)
);
create index if not exists vault_collection_items_drop_idx
  on public.vault_collection_items (drop_id);

-- ── 5. Subscriptions (the entitlement payments will eventually control) ─────
-- One row per (subscriber, vault); status transitions happen on that row, so a
-- cancellation, a lapse and a renewal can never race into two entitlements.
-- There is deliberately NO client write path: see migration 0015 for the
-- service_role-only test/admin grant.
create table if not exists public.vault_subscriptions (
  id                 text primary key,
  subscriber_id      text not null references public.profiles (id) on delete cascade,
  vault_id           text not null references public.creator_vaults (id) on delete cascade,
  status             public.vault_subscription_status not null default 'active',
  started_at         timestamptz not null default now(),
  current_period_end timestamptz not null,
  cancelled_at       timestamptz,
  source             public.vault_subscription_source not null default 'test',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (subscriber_id, vault_id),
  check (current_period_end > started_at)
);
create index if not exists vault_subscriptions_vault_idx on public.vault_subscriptions (vault_id);
create index if not exists vault_subscriptions_subscriber_idx
  on public.vault_subscriptions (subscriber_id);
create index if not exists vault_subscriptions_due_idx
  on public.vault_subscriptions (current_period_end) where status in ('active', 'trial');

-- ── 6. Media rules: free → public bucket, subscriber → private bucket ───────
-- A BEFORE INSERT OR UPDATE trigger, so the rule holds for EVERY write path —
-- the definer RPCs, a future Edge Function, or a service_role script. A creator
-- cannot accidentally publish a subscriber-only Drop backed by public media (or
-- a free Drop backed by private media), and cannot point a Drop at media they do
-- not own, at an upload still in flight, or at a tombstoned object.
create or replace function public.enforce_vault_drop_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.media_objects%rowtype;
begin
  -- A Drop may only live in a Vault its creator actually owns.
  if not exists (
    select 1 from public.creator_vaults v
     where v.id = new.vault_id and v.creator_id = new.creator_id
  ) then
    raise exception 'vault does not belong to this creator' using errcode = 'P0001';
  end if;

  if new.media_object_id is null then
    if new.status = 'published' then
      raise exception 'a published drop needs media' using errcode = 'P0008';
    end if;
    return new;
  end if;

  select * into v_media from public.media_objects where id = new.media_object_id;
  if not found then
    raise exception 'media not found' using errcode = 'P0002';
  end if;
  if v_media.owner_id <> new.creator_id then
    raise exception 'not your media' using errcode = 'P0001';
  end if;
  if v_media.status = 'deleted' or v_media.deleted_at is not null then
    raise exception 'media has been deleted' using errcode = 'P0009';
  end if;

  -- The access level decides the bucket: this is the rule that stops a
  -- subscriber-only Drop from being backed by public, guessable media.
  if new.access_level = 'subscriber' and v_media.visibility <> 'private' then
    raise exception 'a subscriber drop requires private media' using errcode = 'P0005';
  end if;
  if new.access_level = 'free' and v_media.visibility <> 'public' then
    raise exception 'a free drop requires public media' using errcode = 'P0006';
  end if;

  -- Media must be a finalised object. A Drop never references an in-flight
  -- upload — the app completes the upload before it creates the Drop — so this
  -- holds for drafts as well as publishes.
  if v_media.status <> 'ready' then
    raise exception 'media is not ready' using errcode = 'P0004';
  end if;

  return new;
end;
$$;

drop trigger if exists vault_drops_media_rules on public.vault_drops;
create trigger vault_drops_media_rules
  before insert or update on public.vault_drops
  for each row execute function public.enforce_vault_drop_media();

-- ── 7. The one entitlement helper ───────────────────────────────────────────
-- Every consumer asks this one function: the RLS policies, the private-media
-- Edge Function, and the app's service layer. Duplicating the rules in a screen
-- or a second policy is exactly how entitlements drift, so there is one
-- implementation and everyone calls it.
--
-- SECURITY DEFINER + `search_path = ''`: it reads drops, blocks and
-- subscriptions directly, so the answer is authoritative regardless of the
-- caller's own row visibility. STABLE, so Postgres may evaluate it once per
-- statement instead of once per row.
--
-- `p_viewer_profile_id` is explicit because RLS must ask the question *for the
-- caller* (policies pass `my_profile_id()`) while the Edge Function passes the id
-- it resolved from the verified JWT. NULL means a signed-out guest.
create or replace function public.can_access_vault_drop(
  p_viewer_profile_id text,
  p_drop_id           text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case
        -- 1. The creator always reaches their own content, drafts included.
        when d.creator_id = p_viewer_profile_id then d.deleted_at is null
        -- 2. A retracted Drop is nobody else's business.
        when d.deleted_at is not null or d.status = 'removed' then false
        -- 3. Readable at all? Live in the feed, or held by a Collection —
        --    which is what keeps an expired Drop permanently visible.
        when not (
          (d.status = 'published' and d.expires_at > now())
          or (
            d.status in ('published', 'expired')
            and exists (select 1 from public.vault_collection_items i where i.drop_id = d.id)
          )
        ) then false
        -- 4. A guest only ever sees free content; subscriber media needs a session.
        when p_viewer_profile_id is null then d.access_level = 'free'
        -- 5. A block in either direction closes that creator's Vault to the viewer.
        when exists (
          select 1 from public.blocks b
           where (b.blocker_id = d.creator_id and b.blocked_id = p_viewer_profile_id)
              or (b.blocker_id = p_viewer_profile_id and b.blocked_id = d.creator_id)
        ) then false
        -- 6. Free content is public; subscriber content needs a live entitlement.
        when d.access_level = 'free' then true
        else exists (
          select 1 from public.vault_subscriptions s
           where s.vault_id = d.vault_id
             and s.subscriber_id = p_viewer_profile_id
             and s.status in ('active', 'trial')
             and s.current_period_end > now()
        )
      end
      from public.vault_drops d
      where d.id = p_drop_id
    ),
    false
  );
$$;

/**
 * The same question, asked only about the *caller*. Anything that is not RLS
 * policy evaluation uses this overload, so a client can never ask "could someone
 * else read this?" or influence its own access by passing another profile id.
 */
create or replace function public.viewer_can_access_drop(p_drop_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_vault_drop(public.my_profile_id(), p_drop_id);
$$;

/**
 * Where the bytes for a Drop actually live — bucket and storage path — but ONLY
 * when the caller may read it. This is the single value the private-media Edge
 * Function is allowed to sign, so a guessed storage path buys nothing: the
 * function returns no row at all unless the entitlement check passes, and a
 * tombstoned or not-ready object is refused even for its owner's subscribers.
 *
 * Signed URLs are never stored; the Edge Function mints one per request.
 */
create or replace function public.vault_drop_media_target(p_drop_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'bucket', m.bucket,
           'path', m.storage_path,
           'mediaKind', m.media_kind
         )
    from public.vault_drops d
    join public.media_objects m on m.id = d.media_object_id
   where d.id = p_drop_id
     and m.status = 'ready'
     and m.deleted_at is null
     and public.viewer_can_access_drop(d.id);
$$;

-- ── 8. Row Level Security ───────────────────────────────────────────────────
alter table public.creator_vaults         enable row level security;
alter table public.vault_drops            enable row level security;
alter table public.vault_collections      enable row level security;
alter table public.vault_collection_items enable row level security;
alter table public.vault_subscriptions    enable row level security;

-- Vaults: an active Vault is a public storefront; the owner (and staff) see the
-- rest, so a draft or suspended Vault stays manageable.
drop policy if exists "an active vault is public, its creator sees all" on public.creator_vaults;
create policy "an active vault is public, its creator sees all"
  on public.creator_vaults for select to anon, authenticated
  using (status = 'active' or public.owns_profile(creator_id) or public.is_staff());

-- Drops: the entitlement helper decides, row by row. `owns_profile` short-circuits
-- for the creator so their drafts and tombstones stay manageable. Staff get row
-- visibility for moderation — metadata only, because the bytes are gated by
-- `vault_drop_media_target`, which has no staff bypass.
drop policy if exists "a vault drop is visible by access rules" on public.vault_drops;
create policy "a vault drop is visible by access rules"
  on public.vault_drops for select to anon, authenticated
  using (
    public.owns_profile(creator_id)
    or public.is_staff()
    or public.can_access_vault_drop(public.my_profile_id(), id)
  );

-- Collections: visible when their Vault is. Items additionally require the Drop
-- itself to be visible; because that sub-query is subject to `vault_drops` RLS,
-- collection visibility inherits the content access rules for free — one rule,
-- no second copy to drift.
drop policy if exists "a collection is visible with its vault" on public.vault_collections;
create policy "a collection is visible with its vault"
  on public.vault_collections for select to anon, authenticated
  using (
    public.owns_profile(creator_id)
    or public.is_staff()
    or exists (
      select 1 from public.creator_vaults v
       where v.id = vault_collections.vault_id and v.status = 'active'
    )
  );

drop policy if exists "a collection item is visible with its drop" on public.vault_collection_items;
create policy "a collection item is visible with its drop"
  on public.vault_collection_items for select to anon, authenticated
  using (exists (select 1 from public.vault_drops d where d.id = drop_id));

-- Subscriptions: the subscriber reads their own row, staff read rows for
-- support. The creator deliberately gets no read — §16 permits aggregated
-- subscriber info only when the product needs it, and it does not yet.
drop policy if exists "a subscription is visible to its subscriber or staff" on public.vault_subscriptions;
create policy "a subscription is visible to its subscriber or staff"
  on public.vault_subscriptions for select to authenticated
  using (public.owns_profile(subscriber_id) or public.is_staff());

-- ── 9. Data API privileges ──────────────────────────────────────────────────
-- State least privilege explicitly rather than inheriting it: revoke everything
-- first, then grant back reads only. There are NO client write grants anywhere
-- in the Vault — every mutation is a SECURITY DEFINER RPC in migration 0015.
revoke all on public.creator_vaults, public.vault_drops, public.vault_collections,
              public.vault_collection_items, public.vault_subscriptions
  from anon, authenticated;
revoke all on public.creator_vaults, public.vault_drops, public.vault_collections,
              public.vault_collection_items, public.vault_subscriptions
  from public;

grant select on public.creator_vaults, public.vault_drops, public.vault_collections,
                public.vault_collection_items
  to anon, authenticated;
-- A subscription is never guest-readable; only its own subscriber may read it.
grant select on public.vault_subscriptions to authenticated;

grant all on public.creator_vaults, public.vault_drops, public.vault_collections,
             public.vault_collection_items, public.vault_subscriptions
  to service_role;

-- `can_access_vault_drop` is a read-only predicate over a (viewer, drop) pair: it
-- returns a boolean and exposes no content, so anon may call it too. That is what
-- lets a guest's RLS evaluation and the "sign in to watch" path share exactly one
-- implementation.
grant execute on function public.can_access_vault_drop(text, text) to anon, authenticated;
grant execute on function public.viewer_can_access_drop(text) to authenticated;
grant execute on function public.vault_drop_media_target(text) to authenticated;
revoke execute on function public.can_access_vault_drop(text, text) from public;
revoke execute on function public.viewer_can_access_drop(text) from public, anon;
revoke execute on function public.vault_drop_media_target(text) from public, anon;

-- Internal to the trigger above; no client has any business calling it.
revoke execute on function public.enforce_vault_drop_media() from public, anon, authenticated;




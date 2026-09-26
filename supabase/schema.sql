-- ============================================================================
-- CLASH 2.0 · Supabase schema (CLASH_SPEC.md §29 — the Arena slice)
-- ----------------------------------------------------------------------------
-- Apply:  1) this file   2) supabase/seed.sql
--          Dashboard  → SQL Editor → paste → Run            (quickest)
--          Local      → supabase init && supabase start, then
--                       supabase db reset                     (Docker required)
--          Linked CLI → this file is a script, not a migration: copy it to
--                       supabase/migrations/<timestamp>_arena.sql, then
--                       supabase db push
--
-- Ships:   profiles, takes, comments, comment_upvotes
--          + public.toggle_comment_upvote(comment_id, user_id) — one atomic flip
--
-- How writes are locked down (three layers, each with one job):
--   1. RLS      → *which rows* a role may touch (own profile, own take, own vote;
--                 hood moderators inside their hood).
--   2. GRANTs   → *which columns* an API role may write (text and media yes;
--                 reputation, coins, rank, role, counters, the 24h window no).
--                 A SECURITY DEFINER function or the service key still writes
--                 everything, so server-side economy/moderation code stays free.
--   3. Triggers → derived state: comments.upvotes_count tracks comment_upvotes,
--                 profiles.updated_at tracks real edits.
--
-- Columns beyond the brief, needed so a row round-trips into `store/types.ts`:
--   profiles.bio / home_hood, takes.media_caption / media_colors /
--   media_duration, takes.clashes_count / reactions_count (+ generated `heat`),
--   created_at / updated_at stamps.
--
-- Deliberately NOT here (later phases per §29): clashes, judgements,
--   jury_assignments, reputation_events, hall_of_fame, hoods, creators,
--   exclusive_drops, purchases, sponsors, campaigns, notifications, reports.
-- ============================================================================

-- ── 1. Domain types ─────────────────────────────────────────────────────────
-- Enums, not free text: a typo cannot reach the feed, and PostgREST renders them
-- as plain JSON strings, so the client keeps the unions it already has.
do $$ begin
  create type public.hood_id as enum
    ('techtakes', 'campushustle', 'goatalk', 'movies', 'gaming', 'startups', 'football');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.media_kind as enum ('image', 'video');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.take_status as enum ('active', 'expired', 'removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.profile_role as enum ('viewer', 'creator', 'moderator', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.rank_name as enum
    ('Rookie', 'Instigator', 'Hot Take', 'Firestarter', 'Provocateur', 'Clash King', 'Legend');
exception when duplicate_object then null; end $$;

-- ── 2. Tables ───────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id              text primary key,
  -- Ties a product profile to a Supabase Auth user. Null on seeded demo people;
  -- set when a real account is created. This is what lets RLS answer
  -- "is this row mine?" without the client ever sending its own id.
  auth_user_id    uuid unique references auth.users (id) on delete set null,
  handle          text not null unique check (handle ~ '^[a-z0-9._]{3,20}$'),
  name            text not null check (char_length(name) between 1 and 60),
  avatar_tint     text not null default '#FF6A3D' check (avatar_tint ~ '^#[0-9A-Fa-f]{6}$'),
  bio             text check (bio is null or char_length(bio) <= 160),
  home_hood       public.hood_id,
  role            public.profile_role not null default 'viewer',
  -- Hoods this profile may moderate (spec §30). Empty for everyone else.
  moderated_hoods public.hood_id[] not null default '{}',
  reputation      integer not null default 0 check (reputation >= 0),
  coins           integer not null default 0 check (coins >= 0),
  streak          integer not null default 0 check (streak >= 0),
  rank            public.rank_name not null default 'Rookie',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.takes (
  id              text primary key,
  author_id       text not null references public.profiles (id) on delete cascade,
  hood            public.hood_id not null,
  text            text not null check (char_length(text) between 1 and 180),
  media_url       text,
  media_kind      public.media_kind,
  media_caption   text,
  -- Gradient stops for the mocked media plate, e.g. '{#B794FF,#6C63FF}'.
  media_colors    text[],
  media_duration  text,
  created_at      timestamptz not null default now(),
  -- Spec §7: a take lives exactly 24 hours. The database owns the window, so no
  -- client can publish a take that outlives the cycle.
  expires_at      timestamptz not null default now() + interval '24 hours',
  status          public.take_status not null default 'active',
  clashes_count   integer not null default 0 check (clashes_count >= 0),
  reactions_count integer not null default 0 check (reactions_count >= 0),
  -- Mirrors `selectFeed`'s heat rank: a clash outweighs a reaction.
  heat            integer generated always as (clashes_count * 3 + reactions_count) stored,
  constraint takes_window check (
    expires_at > created_at and expires_at <= created_at + interval '24 hours'
  ),
  constraint takes_media_complete check (media_kind is null or media_url is not null)
);

create table if not exists public.comments (
  id            text primary key,
  take_id       text not null references public.takes (id) on delete cascade,
  author_id     text not null references public.profiles (id) on delete cascade,
  text          text not null check (char_length(text) between 1 and 180),
  -- Denormalised tally: the trigger in §5 owns it, never the client.
  upvotes_count integer not null default 0 check (upvotes_count >= 0),
  is_removed    boolean not null default false,
  is_pinned     boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.comment_upvotes (
  comment_id text not null references public.comments (id) on delete cascade,
  user_id    text not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- One vote per person per rebuttal, enforced by the key itself.
  primary key (comment_id, user_id)
);

-- ── 3. Indexes ──────────────────────────────────────────────────────────────
-- Each one matches a query shape in services/apiService.ts.
create index if not exists takes_live_heat_idx
  on public.takes (hood, heat desc) where status = 'active';
create index if not exists takes_expiry_idx on public.takes (expires_at desc);
create index if not exists comments_take_votes_idx
  on public.comments (take_id, upvotes_count desc) where not is_removed;
create index if not exists comment_upvotes_user_idx on public.comment_upvotes (user_id);
create index if not exists profiles_auth_user_idx on public.profiles (auth_user_id);

-- ── 4. Ownership helpers ────────────────────────────────────────────────────
-- `security definer` so a policy can read public.profiles without recursing back
-- through its own RLS. `search_path = ''` pins every name the function resolves:
-- a definer function must never be hijackable through the caller's search path.
create or replace function public.owns_profile(p_profile_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = p_profile_id
       and p.auth_user_id is not null
       and p.auth_user_id = auth.uid()
  );
$$;

/** True when the caller moderates `p_hood` — the point of `moderated_hoods`. */
create or replace function public.is_hood_moderator(p_hood public.hood_id)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.auth_user_id = auth.uid()
       and p.role in ('moderator', 'admin')
       and (p.role = 'admin' or p_hood = any (p.moderated_hoods))
  );
$$;

/** The take behind a rebuttal, for policies that need its hood. */
create or replace function public.take_hood(p_take_id text)
returns public.hood_id
language sql
stable
security definer
set search_path = ''
as $$
  select t.hood from public.takes t where t.id = p_take_id;
$$;

-- ── 5. Triggers ─────────────────────────────────────────────────────────────
/**
 * Keeps `comments.upvotes_count` honest with a delta, not a recount: seeded
 * history keeps its totals while one real vote moves the number by exactly one.
 * Definer rights mean a voter never needs UPDATE on the comment row.
 */
create or replace function public.sync_comment_upvotes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.comments
       set upvotes_count = greatest(upvotes_count + 1, 0)
     where id = new.comment_id;
  else
    update public.comments
       set upvotes_count = greatest(upvotes_count - 1, 0)
     where id = old.comment_id;
  end if;
  return null;
end;
$$;

/** `updated_at` is derived, so it can never be sent by a client. */
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists comment_upvotes_count on public.comment_upvotes;
create trigger comment_upvotes_count
  after insert or delete on public.comment_upvotes
  for each row execute function public.sync_comment_upvotes();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ── 6. The atomic upvote toggle ─────────────────────────────────────────────
/**
 * Flips one vote for `p_user_id` in a single transaction and answers with the
 * fresh tally, so a client never has to read-modify-write a counter.
 *
 * Called as `supabase.rpc('toggle_comment_upvote', { p_comment_id, p_user_id })`.
 * Definer rights are needed to touch `comments.upvotes_count`, but the vote is
 * only ever cast for a profile the caller actually owns — and only on a rebuttal
 * that is still open.
 */
create or replace function public.toggle_comment_upvote(p_comment_id text, p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed integer;
  v_upvoted boolean;
  v_count   integer;
begin
  if not public.owns_profile(p_user_id) then
    raise exception 'a vote can only be cast for your own profile'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.comments c
     where c.id = p_comment_id
       and not c.is_removed
  ) then
    raise exception 'rebuttal % is not open for votes', p_comment_id
      using errcode = 'P0002';
  end if;

  delete from public.comment_upvotes
   where comment_id = p_comment_id
     and user_id = p_user_id;
  get diagnostics v_removed = row_count;

  v_upvoted := (v_removed = 0);
  if v_upvoted then
    insert into public.comment_upvotes (comment_id, user_id)
    values (p_comment_id, p_user_id);
  end if;

  select c.upvotes_count into v_count
    from public.comments c
   where c.id = p_comment_id;

  return jsonb_build_object(
    'comment_id', p_comment_id,
    'upvoted', v_upvoted,
    'upvotes_count', v_count
  );
end;
$$;

-- ── 7. Row Level Security ───────────────────────────────────────────────────
-- Public reads: the Arena is a public feed. Writes: an authenticated session
-- acting on rows it owns (or a hood moderator acting inside its hood).
alter table public.profiles        enable row level security;
alter table public.takes           enable row level security;
alter table public.comments        enable row level security;
alter table public.comment_upvotes enable row level security;

-- profiles -------------------------------------------------------------------
drop policy if exists "profiles are readable by everyone" on public.profiles;
create policy "profiles are readable by everyone"
  on public.profiles for select using (true);

drop policy if exists "a profile is created by its owner" on public.profiles;
create policy "a profile is created by its owner"
  on public.profiles for insert to authenticated
  with check (auth.uid() = auth_user_id);

drop policy if exists "a profile is edited by its owner" on public.profiles;
create policy "a profile is edited by its owner"
  on public.profiles for update to authenticated
  using (public.owns_profile(id))
  with check (public.owns_profile(id));

-- takes ----------------------------------------------------------------------
drop policy if exists "takes are readable by everyone" on public.takes;
create policy "takes are readable by everyone"
  on public.takes for select using (true);

drop policy if exists "takes are dropped by their author" on public.takes;
create policy "takes are dropped by their author"
  on public.takes for insert to authenticated
  with check (public.owns_profile(author_id));

drop policy if exists "takes are edited by their author or a hood moderator" on public.takes;
create policy "takes are edited by their author or a hood moderator"
  on public.takes for update to authenticated
  using (public.owns_profile(author_id) or public.is_hood_moderator(hood))
  with check (public.owns_profile(author_id) or public.is_hood_moderator(hood));

drop policy if exists "takes are removed by a hood moderator" on public.takes;
create policy "takes are removed by a hood moderator"
  on public.takes for delete to authenticated
  using (public.is_hood_moderator(hood));

-- comments -------------------------------------------------------------------
drop policy if exists "rebuttals are readable unless removed" on public.comments;
create policy "rebuttals are readable unless removed"
  on public.comments for select
  using (
    not is_removed
    or public.owns_profile(author_id)
    or public.is_hood_moderator(public.take_hood(take_id))
  );

drop policy if exists "rebuttals are posted on a live take" on public.comments;
create policy "rebuttals are posted on a live take"
  on public.comments for insert to authenticated
  with check (
    public.owns_profile(author_id)
    and exists (
      select 1
        from public.takes t
       where t.id = take_id
         and t.status = 'active'
         and t.expires_at > now()
    )
  );

drop policy if exists "rebuttals are edited by their author or a hood moderator" on public.comments;
create policy "rebuttals are edited by their author or a hood moderator"
  on public.comments for update to authenticated
  using (public.owns_profile(author_id) or public.is_hood_moderator(public.take_hood(take_id)))
  with check (public.owns_profile(author_id) or public.is_hood_moderator(public.take_hood(take_id)));

drop policy if exists "rebuttals are deleted by their author or a hood moderator" on public.comments;
create policy "rebuttals are deleted by their author or a hood moderator"
  on public.comments for delete to authenticated
  using (public.owns_profile(author_id) or public.is_hood_moderator(public.take_hood(take_id)));

-- comment_upvotes ------------------------------------------------------------
-- A vote is private to its owner; the public tally lives on comments.upvotes_count.
drop policy if exists "a vote is visible to its owner" on public.comment_upvotes;
create policy "a vote is visible to its owner"
  on public.comment_upvotes for select to authenticated
  using (public.owns_profile(user_id));

drop policy if exists "a vote is cast by its owner" on public.comment_upvotes;
create policy "a vote is cast by its owner"
  on public.comment_upvotes for insert to authenticated
  with check (public.owns_profile(user_id));

drop policy if exists "a vote is withdrawn by its owner" on public.comment_upvotes;
create policy "a vote is withdrawn by its owner"
  on public.comment_upvotes for delete to authenticated
  using (public.owns_profile(user_id));

-- ── 8. Column-level Data API privileges ─────────────────────────────────────
-- RLS decides *which rows*; GRANTs decide *whether* an API role may touch a table
-- or column at all. Newer projects grant nothing by default, so without this every
-- query fails with "permission denied for table takes".
--
-- Note the column lists: an API client can write words and media, but never money,
-- rank, counters or the 24h window. Server-side code (SECURITY DEFINER functions,
-- service_role) is unaffected, which is where the economy will live.
grant usage on schema public to anon, authenticated;

-- reads: the Arena is public
grant select on public.profiles, public.takes, public.comments to anon;
grant select on public.profiles, public.takes, public.comments to authenticated;

-- profiles: sign up as yourself, then edit your own words — nothing earned
grant insert (id, auth_user_id, handle, name, avatar_tint, bio, home_hood)
  on public.profiles to authenticated;
grant update (handle, name, avatar_tint, bio, home_hood)
  on public.profiles to authenticated;

-- takes: publish your take; the database stamps created_at / expires_at / status
grant insert (id, author_id, hood, text, media_url, media_kind, media_caption,
              media_colors, media_duration)
  on public.takes to authenticated;
grant update (hood, text, media_url, media_kind, media_caption, media_colors,
              media_duration, status)
  on public.takes to authenticated;
grant delete on public.takes to authenticated;

-- comments: write your rebuttal, edit the words, retract it
grant insert (id, take_id, author_id, text) on public.comments to authenticated;
grant update (text) on public.comments to authenticated;
grant delete on public.comments to authenticated;

-- votes: the row carries no writable payload, so table-wide is enough
grant select, insert, delete on public.comment_upvotes to authenticated;

grant all on all tables in schema public to service_role;

grant execute on function public.owns_profile(text) to anon, authenticated;
grant execute on function public.is_hood_moderator(public.hood_id) to anon, authenticated;
grant execute on function public.take_hood(text) to anon, authenticated;
grant execute on function public.toggle_comment_upvote(text, text) to authenticated;
-- The toggle is a signed-in action only: no anonymous callers, no PUBLIC default.
revoke execute on function public.toggle_comment_upvote(text, text) from public, anon;

-- Tables added later (clashes, judgements, vault, sponsors…) inherit this shape.
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;





-- ============================================================================
-- CLASH 2.0 · 0003 — social foundation
-- ----------------------------------------------------------------------------
-- Follows, blocks, mutes, reports, moderation audit and notifications — the
-- social graph and safety layer every later feature (Arena, Vault, World,
-- creators) builds on.
--
-- Security model (learned in Step 1):
--   · New tables inherit the narrow defaults set in migration 0001:
--     anon = SELECT, authenticated = SELECT, service_role = ALL. Writes are NOT
--     inherited; each table grants only what it needs, and sensitive writes go
--     through `security definer` RPCs that resolve the caller from `auth.uid()`
--     — never from a caller-supplied id.
--   · `search_path = ''` and fully-qualified `public.*` in every definer function.
--   · Nothing here touches raw_user_meta_data or the email.
--
-- Caller-resolution helpers (`my_profile_id`, `is_staff`) mirror the existing
-- `owns_profile` / `is_hood_moderator` pattern: definer rights so RLS policies
-- can read public.profiles without recursing through their own RLS.
-- ============================================================================

-- ── 1. Domain types ─────────────────────────────────────────────────────────
do $$ begin
  create type public.report_target as enum ('profile', 'take', 'comment', 'clash');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_reason as enum
    ('spam', 'harassment', 'hate', 'sexual', 'violence', 'misinformation',
     'impersonation', 'copyright', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.moderation_action as enum
    ('warn', 'remove_content', 'restore_content', 'suspend_profile', 'unsuspend_profile');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_kind as enum
    ('new_follower', 'comment', 'reply', 'clash_started', 'clash_result',
     'reputation', 'hall_of_fame', 'vault_subscription', 'sponsor_activity');
exception when duplicate_object then null; end $$;

-- ── 2. Caller-resolution helpers ────────────────────────────────────────────
/** The signed-in user's profile id, or null. Never a client-supplied value. */
create or replace function public.my_profile_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p where p.auth_user_id = auth.uid();
$$;

/** True when the caller is a hood moderator or an admin. */
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.auth_user_id = auth.uid()
       and p.role in ('moderator', 'admin')
  );
$$;

-- ── 3. Tables ───────────────────────────────────────────────────────────────
-- follows: the public social graph. Counts are public; writes go through RPCs.
create table if not exists public.follows (
  follower_id  text not null references public.profiles (id) on delete cascade,
  following_id text not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists follows_following_idx on public.follows (following_id);

-- blocks: private between the two parties (both need it to filter feeds).
create table if not exists public.blocks (
  blocker_id text not null references public.profiles (id) on delete cascade,
  blocked_id text not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

-- mutes: private to the muter, one-way, no notification, no follow effect.
create table if not exists public.mutes (
  muter_id  text not null references public.profiles (id) on delete cascade,
  muted_id  text not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);

-- reports: the moderation intake. Status/review fields are server-owned.
create table if not exists public.reports (
  id          text primary key,
  reporter_id text not null references public.profiles (id) on delete cascade,
  target_kind public.report_target not null,
  target_id   text not null,
  reason      public.report_reason not null,
  detail      text check (detail is null or char_length(detail) <= 500),
  status      public.report_status not null default 'open',
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text references public.profiles (id) on delete set null
);
-- One open/reviewing report per reporter per target stops duplicate spam.
create unique index if not exists reports_open_duplicate_idx
  on public.reports (reporter_id, target_kind, target_id)
  where status in ('open', 'reviewing');
create index if not exists reports_status_idx on public.reports (status, created_at);

-- moderation_actions: immutable audit trail. Writes are service_role only.
create table if not exists public.moderation_actions (
  id           text primary key,
  moderator_id text not null references public.profiles (id) on delete cascade,
  target_kind  public.report_target not null,
  target_id    text not null,
  action       public.moderation_action not null,
  reason       text,
  created_at   timestamptz not null default now()
);
create index if not exists moderation_actions_moderator_idx on public.moderation_actions (moderator_id);
create index if not exists moderation_actions_target_idx on public.moderation_actions (target_kind, target_id);

-- notifications: server-written, recipient-owned. `kind` is an extensible enum.
create table if not exists public.notifications (
  id           text primary key,
  recipient_id text not null references public.profiles (id) on delete cascade,
  actor_id     text references public.profiles (id) on delete set null,
  kind         public.notification_kind not null,
  entity_type  public.report_target,
  entity_id    text,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);

-- ── 4. Server-side social RPCs ──────────────────────────────────────────────
-- Every relationship is created for the signed-in caller — never for an id the
-- client supplies. `on conflict do nothing` keeps repeated taps idempotent.

/** Follow `p_target_id` as the signed-in user. */
create or replace function public.follow_profile(p_target_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_follower text := public.my_profile_id();
begin
  if v_follower is null then
    raise exception 'sign in to follow' using errcode = '42501';
  end if;
  if p_target_id is null or p_target_id = v_follower then
    raise exception 'cannot follow yourself' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'profile does not exist' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.blocks
     where (blocker_id = v_follower and blocked_id = p_target_id)
        or (blocker_id = p_target_id and blocked_id = v_follower)
  ) then
    raise exception 'blocked' using errcode = 'P0003';
  end if;

  insert into public.follows (follower_id, following_id)
  values (v_follower, p_target_id)
  on conflict do nothing;
end;
$$;

/** Unfollow `p_target_id`. */
create or replace function public.unfollow_profile(p_target_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_follower text := public.my_profile_id();
begin
  if v_follower is null then
    raise exception 'sign in to unfollow' using errcode = '42501';
  end if;
  delete from public.follows where follower_id = v_follower and following_id = p_target_id;
end;
$$;

/** Block `p_target_id` and dissolve follows in both directions, atomically. */
create or replace function public.block_profile(p_target_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blocker text := public.my_profile_id();
begin
  if v_blocker is null then
    raise exception 'sign in to block' using errcode = '42501';
  end if;
  if p_target_id is null or p_target_id = v_blocker then
    raise exception 'cannot block yourself' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'profile does not exist' using errcode = 'P0002';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (v_blocker, p_target_id)
  on conflict do nothing;

  delete from public.follows
   where (follower_id = v_blocker and following_id = p_target_id)
      or (follower_id = p_target_id and following_id = v_blocker);
end;
$$;

/** Unblock `p_target_id`. Only the blocker can do this. */
create or replace function public.unblock_profile(p_target_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blocker text := public.my_profile_id();
begin
  if v_blocker is null then
    raise exception 'sign in to unblock' using errcode = '42501';
  end if;
  delete from public.blocks where blocker_id = v_blocker and blocked_id = p_target_id;
end;
$$;

/** Mute `p_target_id` — private, one-way, no notification, no follow effect. */
create or replace function public.mute_profile(p_target_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_muter text := public.my_profile_id();
begin
  if v_muter is null then
    raise exception 'sign in to mute' using errcode = '42501';
  end if;
  if p_target_id is null or p_target_id = v_muter then
    raise exception 'cannot mute yourself' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'profile does not exist' using errcode = 'P0002';
  end if;

  insert into public.mutes (muter_id, muted_id)
  values (v_muter, p_target_id)
  on conflict do nothing;
end;
$$;

/** Unmute `p_target_id`. */
create or replace function public.unmute_profile(p_target_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_muter text := public.my_profile_id();
begin
  if v_muter is null then
    raise exception 'sign in to unmute' using errcode = '42501';
  end if;
  delete from public.mutes where muter_id = v_muter and muted_id = p_target_id;
end;
$$;

/** Submit a report as the signed-in user; returns the new report id. */
create or replace function public.submit_report(
  p_target_kind public.report_target,
  p_target_id   text,
  p_reason      public.report_reason,
  p_detail      text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporter text := public.my_profile_id();
  v_id text;
begin
  if v_reporter is null then
    raise exception 'sign in to report' using errcode = '42501';
  end if;
  if p_target_id is null or p_target_id = '' then
    raise exception 'missing target' using errcode = 'P0002';
  end if;

  v_id := 'rpt_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16));
  insert into public.reports (id, reporter_id, target_kind, target_id, reason, detail)
  values (v_id, v_reporter, p_target_kind, p_target_id, p_reason, p_detail);
  return v_id;
exception
  when unique_violation then
    raise exception 'you already have an open report for this' using errcode = 'P0004';
end;
$$;

-- ── 5. Notification trigger: "new follower" ─────────────────────────────────
/** Writes a `new_follower` notification unless the pair is blocked either way. */
create or replace function public.notify_new_follower()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient text := new.following_id;
  v_actor     text := new.follower_id;
begin
  if exists (
    select 1 from public.blocks
     where (blocker_id = v_recipient and blocked_id = v_actor)
        or (blocker_id = v_actor and blocked_id = v_recipient)
  ) then
    return new;
  end if;

  insert into public.notifications (id, recipient_id, actor_id, kind, entity_type, entity_id)
  values (
    'n_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
    v_recipient,
    v_actor,
    'new_follower',
    'profile',
    v_actor
  );
  return new;
end;
$$;

drop trigger if exists follows_notify on public.follows;
create trigger follows_notify
  after insert on public.follows
  for each row execute function public.notify_new_follower();

-- ── 6. Row Level Security ───────────────────────────────────────────────────
alter table public.follows             enable row level security;
alter table public.blocks              enable row level security;
alter table public.mutes               enable row level security;
alter table public.reports             enable row level security;
alter table public.moderation_actions  enable row level security;
alter table public.notifications       enable row level security;

-- follows: the social graph is public; writes go through RPCs only.
drop policy if exists "follows are readable by everyone" on public.follows;
create policy "follows are readable by everyone"
  on public.follows for select using (true);

-- blocks: visible to the two parties involved (feed filtering needs both sides).
drop policy if exists "a block is visible to its parties" on public.blocks;
create policy "a block is visible to its parties"
  on public.blocks for select
  using (public.owns_profile(blocker_id) or public.owns_profile(blocked_id) or public.is_staff());

-- mutes: private to the muter.
drop policy if exists "a mute is private to its owner" on public.mutes;
create policy "a mute is private to its owner"
  on public.mutes for select
  using (public.owns_profile(muter_id) or public.is_staff());

-- reports: the reporter may see their own; staff see everything.
drop policy if exists "a report is visible to its reporter or staff" on public.reports;
create policy "a report is visible to its reporter or staff"
  on public.reports for select
  using (public.owns_profile(reporter_id) or public.is_staff());

-- moderation_actions: staff only; no client writes exist.
drop policy if exists "moderation actions are visible to staff" on public.moderation_actions;
create policy "moderation actions are visible to staff"
  on public.moderation_actions for select using (public.is_staff());

-- notifications: recipient-only read; recipient-only mark-read.
drop policy if exists "a notification is visible to its recipient" on public.notifications;
create policy "a notification is visible to its recipient"
  on public.notifications for select using (public.owns_profile(recipient_id));

drop policy if exists "a notification is read by its recipient" on public.notifications;
create policy "a notification is read by its recipient"
  on public.notifications for update
  using (public.owns_profile(recipient_id))
  with check (public.owns_profile(recipient_id));

-- ── 7. Data API privileges ──────────────────────────────────────────────────
-- New tables inherit migration 0001's narrow defaults (anon=SELECT,
-- authenticated=SELECT, service_role=ALL). Tighten from there:
--
--   · Private tables drop anon read entirely.
--   · Writes stay out of authenticated hands — they all flow through the
--     `security definer` RPCs above, which resolve the caller from auth.
--   · `notifications.read_at` is the only client-writable column anywhere here.

revoke select on public.blocks             from anon;
revoke select on public.mutes              from anon;
revoke select on public.reports            from anon;
revoke select on public.moderation_actions from anon;
revoke select on public.notifications      from anon;

grant update (read_at) on public.notifications to authenticated;

grant execute on function public.is_staff() to authenticated;

grant execute on function public.follow_profile(text) to authenticated;
grant execute on function public.unfollow_profile(text) to authenticated;
grant execute on function public.block_profile(text) to authenticated;
grant execute on function public.unblock_profile(text) to authenticated;
grant execute on function public.mute_profile(text) to authenticated;
grant execute on function public.unmute_profile(text) to authenticated;
grant execute on function public.submit_report(public.report_target, text, public.report_reason, text) to authenticated;

revoke execute on function public.follow_profile(text) from public, anon;
revoke execute on function public.unfollow_profile(text) from public, anon;
revoke execute on function public.block_profile(text) from public, anon;
revoke execute on function public.unblock_profile(text) from public, anon;
revoke execute on function public.mute_profile(text) from public, anon;
revoke execute on function public.unmute_profile(text) from public, anon;
revoke execute on function public.submit_report(public.report_target, text, public.report_reason, text) from public, anon;

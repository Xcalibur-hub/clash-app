-- ============================================================================
-- CLASH 2.0 · 0008 — Hood communities + threaded rebuttals
-- ----------------------------------------------------------------------------
-- Two small, deliberate production additions:
--   1. Threaded comments: `comments.parent_comment_id` with a self-parent check
--      and a BEFORE trigger that enforces same-Take parents, bounded depth and
--      the existing block-safety rule.
--   2. Hood membership: `hood_memberships` (real rows, not mock counts) plus
--      `join_hood` / `leave_hood` RPCs.
--
-- WHY A SCHEMA ADDITION (documented): the Arena's Hoods were an enum + client
-- metadata. Real community membership and member counts cannot be derived from
-- an enum, and threaded replies need a parent pointer. These are the minimal
-- columns/tables required; nothing else is duplicated.
--
-- RATE LIMIT (see 0006): hood_join · 30 / 1 hour.
-- ============================================================================

-- ── 1. Threaded comments ─────────────────────────────────────────────────────
alter table public.comments
  add column parent_comment_id text references public.comments (id) on delete set null;

do $$ begin
  alter table public.comments add constraint comments_no_self_parent
    check (parent_comment_id is null or parent_comment_id <> id);
exception when duplicate_object then null; end $$;

create index if not exists comments_parent_idx on public.comments (parent_comment_id);

/**
 * Enforces reply relationships and the block-safety rule. Seed / server-side
 * writes (no auth context) skip the interaction checks. The bounded parent walk
 * rejects both cycles and pathologically deep chains.
 */
create or replace function public.enforce_comment_relationships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := public.my_profile_id();
  v_take_author text;
  v_cursor text := new.parent_comment_id;
  v_depth integer := 0;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.parent_comment_id is not null then
    -- A parent on a different Take is rejected here; a non-existent parent is
    -- left to the FK (23503). The bounded walk then rejects cycles and deep chains.
    if exists (
      select 1 from public.comments c
       where c.id = new.parent_comment_id and c.take_id <> new.take_id
    ) then
      raise exception 'parent comment is not on this take' using errcode = 'P0007';
    end if;

    while v_cursor is not null loop
      v_depth := v_depth + 1;
      if v_depth > 32 then
        raise exception 'reply chain is too deep' using errcode = 'P0008';
      end if;
      select c.parent_comment_id into v_cursor from public.comments c where c.id = v_cursor;
    end loop;
  end if;

  -- Preserves the safety model used by take_reactions / follow: a block in
  -- either direction between the caller and the Take's author refuses the reply.
  select t.author_id into v_take_author from public.takes t where t.id = new.take_id;
  if v_take_author is not null and exists (
    select 1 from public.blocks b
     where (b.blocker_id = v_actor and b.blocked_id = v_take_author)
        or (b.blocker_id = v_take_author and b.blocked_id = v_actor)
  ) then
    raise exception 'blocked' using errcode = 'P0005';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_comment_relationships on public.comments;
create trigger trg_comment_relationships
  before insert or update of parent_comment_id on public.comments
  for each row execute function public.enforce_comment_relationships();

-- ── 2. Hood membership ──────────────────────────────────────────────────────
create table if not exists public.hood_memberships (
  hood       public.hood_id not null,
  profile_id text not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (hood, profile_id)
);
create index if not exists hood_memberships_profile_idx on public.hood_memberships (profile_id);

/** Join a Hood as the signed-in user. Idempotent. */
create or replace function public.join_hood(p_hood public.hood_id)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
begin
  if v_user is null then
    raise exception 'sign in to join a hood' using errcode = '42501';
  end if;
  insert into public.hood_memberships (hood, profile_id) values (p_hood, v_user)
  on conflict do nothing;
end;
$$;

/** Leave a Hood as the signed-in user. */
create or replace function public.leave_hood(p_hood public.hood_id)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
begin
  if v_user is null then
    raise exception 'sign in to leave a hood' using errcode = '42501';
  end if;
  delete from public.hood_memberships where hood = p_hood and profile_id = v_user;
end;
$$;

-- ── 3. Rate limit ───────────────────────────────────────────────────────────
drop trigger if exists trg_hood_join_rate_limit on public.hood_memberships;
create trigger trg_hood_join_rate_limit
  before insert on public.hood_memberships
  for each row execute function public.enforce_action_rate_limit('hood_join', '30', '1 hour');

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
alter table public.hood_memberships enable row level security;

-- Membership is public (like the follow graph): counts and own-status are readable;
-- only the RPCs write.
drop policy if exists "hood membership is readable by everyone" on public.hood_memberships;
create policy "hood membership is readable by everyone"
  on public.hood_memberships for select using (true);

-- ── 5. Privileges ───────────────────────────────────────────────────────────
-- The threaded parent pointer is client-writable but validated server-side by
-- `enforce_comment_relationships` + the FK; author_id stays RLS-gated.
grant insert (parent_comment_id) on public.comments to authenticated;

revoke all on public.hood_memberships from anon, authenticated;
grant select on public.hood_memberships to anon, authenticated;

revoke execute on function public.enforce_comment_relationships() from public, anon, authenticated;

grant execute on function public.join_hood(public.hood_id) to authenticated;
grant execute on function public.leave_hood(public.hood_id) to authenticated;
revoke execute on function public.join_hood(public.hood_id) from public, anon;
revoke execute on function public.leave_hood(public.hood_id) from public, anon;

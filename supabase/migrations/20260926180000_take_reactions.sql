-- ============================================================================
-- CLASH 2.0 · 0007 — server-authoritative Take reactions
-- ----------------------------------------------------------------------------
-- The Arena reaction becomes authoritative in Supabase. One reaction per user
-- per Take, toggled atomically through `toggle_take_reaction`; `takes.
-- reactions_count` — the existing single counter, never a second one — is kept
-- in sync by a trigger.
--
-- RATE LIMIT (added to 0006's central table): take_reaction · 120 / 10 minutes
--   A toggle is insert-or-delete; only the "add reaction" insert is counted, so
--   the limit targets rapid reaction abuse without penalising normal use.
-- ============================================================================

-- ── 1. Reaction rows ────────────────────────────────────────────────────────
create table if not exists public.take_reactions (
  take_id    text not null references public.takes (id) on delete cascade,
  user_id    text not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- One reaction per person per Take, enforced by the key itself.
  primary key (take_id, user_id)
);
create index if not exists take_reactions_user_idx on public.take_reactions (user_id);

-- ── 2. Counter sync ─────────────────────────────────────────────────────────
-- Mirrors `sync_comment_upvotes`: a delta keeps the aggregate exact, and
-- `greatest(..., 0)` means the count can never go negative.
create or replace function public.sync_take_reactions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.takes
       set reactions_count = greatest(reactions_count + 1, 0)
     where id = new.take_id;
  else
    update public.takes
       set reactions_count = greatest(reactions_count - 1, 0)
     where id = old.take_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_take_reactions on public.take_reactions;
create trigger trg_sync_take_reactions
  after insert or delete on public.take_reactions
  for each row execute function public.sync_take_reactions();

-- ── 3. Atomic toggle ────────────────────────────────────────────────────────
/**
 * Toggle the signed-in user's reaction on a live Take. The actor is resolved
 * from `auth.uid()` — never a caller-supplied id — and the whole flip runs in
 * one transaction, so the row and the counter can never disagree.
 */
create or replace function public.toggle_take_reaction(p_take_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_author text;
  v_status public.take_status;
  v_expires timestamptz;
  v_removed integer;
  v_reacted boolean;
  v_count integer;
begin
  if v_user is null then
    raise exception 'sign in to react' using errcode = '42501';
  end if;

  select t.author_id, t.status, t.expires_at
    into v_author, v_status, v_expires
    from public.takes t where t.id = p_take_id;

  if v_author is null then
    raise exception 'take does not exist' using errcode = 'P0002';
  end if;
  if v_status = 'removed' then
    raise exception 'take is not open for reactions' using errcode = 'P0003';
  end if;
  if v_status = 'expired' or v_expires <= now() then
    raise exception 'take has expired' using errcode = 'P0004';
  end if;
  -- Preserves the existing safety model: a block in either direction between
  -- the caller and the Take's author refuses the interaction (as follow does).
  if exists (
    select 1 from public.blocks b
     where (b.blocker_id = v_user and b.blocked_id = v_author)
        or (b.blocker_id = v_author and b.blocked_id = v_user)
  ) then
    raise exception 'blocked' using errcode = 'P0005';
  end if;

  delete from public.take_reactions where take_id = p_take_id and user_id = v_user;
  get diagnostics v_removed = row_count;

  v_reacted := (v_removed = 0);
  if v_reacted then
    insert into public.take_reactions (take_id, user_id) values (p_take_id, v_user);
  end if;

  select t.reactions_count into v_count from public.takes t where t.id = p_take_id;

  return jsonb_build_object('take_id', p_take_id, 'reacted', v_reacted, 'reactions_count', v_count);
end;
$$;

-- ── 4. Rate limit ───────────────────────────────────────────────────────────
-- Reuses 0006's generic throttle; only genuine "add reaction" inserts count.
drop trigger if exists trg_take_reaction_rate_limit on public.take_reactions;
create trigger trg_take_reaction_rate_limit
  before insert on public.take_reactions
  for each row execute function public.enforce_action_rate_limit('take_reaction', '120', '10 minutes');

-- ── 5. RLS ──────────────────────────────────────────────────────────────────
alter table public.take_reactions enable row level security;

-- A user may see their OWN reactions (to render "did I react?"). The public feed
-- reads only the aggregate `takes.reactions_count`, so nobody's full reaction
-- history is exposed.
drop policy if exists "a reaction is visible to its owner" on public.take_reactions;
create policy "a reaction is visible to its owner"
  on public.take_reactions for select to authenticated
  using (public.owns_profile(user_id));

-- ── 6. Privileges ───────────────────────────────────────────────────────────
-- Revoke the inherited defaults first, then grant back the minimum:
-- authenticated may read its own rows; all writes flow through the RPC.
-- (takes.reactions_count is column-granted away from clients in 0001.)
revoke all on public.take_reactions from anon, authenticated;
grant select on public.take_reactions to authenticated;

revoke execute on function public.sync_take_reactions() from public, anon, authenticated;

grant execute on function public.toggle_take_reaction(text) to authenticated;
revoke execute on function public.toggle_take_reaction(text) from public, anon;

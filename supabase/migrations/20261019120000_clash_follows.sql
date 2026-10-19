-- ============================================================================
-- CLASH 2.0 · Step 4A — Persistent Clash following
-- ----------------------------------------------------------------------------
-- Reuses the canonical Clash identity (public.clashes.id), the existing
-- notification architecture (clash_notify + the 'clash_result' kind) and the
-- existing access-checked client resolver (resolveArenaReturn). A follow is on
-- the CLASH, never on an arena_room: arena_rooms.clash_id already links a DUEL
-- room to its canonical Clash.
--
-- One active relationship per (follower, clash): the composite primary key makes
-- follow/unfollow idempotent and duplicates impossible. Rows cascade with the
-- Clash or the profile. A cancelled Clash can never gain a new follower.
--
-- Verdict delivery is an AFTER INSERT trigger on public.verdicts, so the
-- settlement RPC, its row locking, its idempotent early return and its reward
-- ledger stay exactly as they are. Exactly one verdict row exists per Clash
-- (primary key), and the NOT EXISTS guard makes delivery retry-safe.
-- Cancellations (zero ballots) write no verdict and therefore notify nobody:
-- there is no verdict to announce.
-- ============================================================================

create table if not exists public.clash_follows (
  clash_id    text not null references public.clashes (id) on delete cascade,
  follower_id text not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (clash_id, follower_id)
);

create index if not exists clash_follows_follower_idx
  on public.clash_follows (follower_id, created_at desc);

-- Structural dedup for verdict delivery. Verified against the local stack: no
-- existing (recipient, clash) duplicates for clash_result, so this partial index
-- cannot fail on historical data and constrains only follower verdict delivery.
create unique index if not exists notifications_clash_result_unique
  on public.notifications (recipient_id, entity_id)
  where kind = 'clash_result' and entity_type = 'clash';

alter table public.clash_follows enable row level security;

-- A follower may read only their own relationships. Writes go through the RPCs.
drop policy if exists "a follower sees their own clashes" on public.clash_follows;
create policy "a follower sees their own clashes"
  on public.clash_follows for select to authenticated
  using (follower_id = public.my_profile_id());

revoke all on public.clash_follows from anon;
grant select on public.clash_follows to authenticated;

-- 1. Visibility gate (same rules as the takes RLS policy) ---------------------
/** True when the signed-in viewer may see the Take behind a Clash. */
create or replace function public.can_follow_clash(p_clash_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.clashes c
      join public.takes t on t.id = c.take_id
     where c.id = p_clash_id
       and c.status <> 'cancelled'
       and not t.is_runtime_fixture
       and not exists (
         select 1 from public.blocks b
          where (b.blocker_id = t.author_id and b.blocked_id = public.my_profile_id())
             or (b.blocker_id = public.my_profile_id() and b.blocked_id = t.author_id))
       and not exists (
         select 1 from public.mutes m
          where m.muter_id = public.my_profile_id() and m.muted_id = t.author_id)
  );
$$;

-- 2. Follow / unfollow (idempotent, server-identified caller) ----------------
create or replace function public.follow_clash(p_clash_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_follower text := public.my_profile_id();
begin
  if v_follower is null then
    raise exception 'sign in to follow a clash' using errcode = '42501';
  end if;
  -- Unknown, cancelled, fixture or hidden Clashes are indistinguishable here:
  -- the caller learns only that the Clash is unavailable.
  if p_clash_id is null or not public.can_follow_clash(p_clash_id) then
    raise exception 'clash is unavailable' using errcode = '42501';
  end if;
  insert into public.clash_follows (clash_id, follower_id)
  values (p_clash_id, v_follower)
  on conflict (clash_id, follower_id) do nothing;
end;
$$;

create or replace function public.unfollow_clash(p_clash_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_follower text := public.my_profile_id();
begin
  if v_follower is null then
    raise exception 'sign in to unfollow a clash' using errcode = '42501';
  end if;
  delete from public.clash_follows
   where clash_id = p_clash_id and follower_id = v_follower;
end;
$$;

-- 3. Verdict delivery to eligible followers ---------------------------------
create or replace function public.notify_clash_followers_on_verdict()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author text;
  v_challenger text;
  v_fixture boolean;
  f record;
begin
  select t.author_id, c.challenger_id, t.is_runtime_fixture
    into v_author, v_challenger, v_fixture
    from public.clashes c join public.takes t on t.id = c.take_id
   where c.id = new.clash_id;

  -- Fixture Takes never produce recipient-facing notifications.
  if v_fixture then
    return new;
  end if;

  -- Delivery is best-effort: a notification failure must never roll back a
  -- finalized verdict, its rewards or the settlement transaction.
  begin
    for f in
      select cf.follower_id
        from public.clash_follows cf
       where cf.clash_id = new.clash_id
         -- The two debaters already receive their own clash_result.
         and cf.follower_id <> coalesce(v_author, '')
         and cf.follower_id <> coalesce(v_challenger, '')
    loop
      -- Access can be revoked between following and settlement. This is checked
      -- outside the driving query: PL/pgSQL cannot reference the loop record
      -- inside the SELECT that assigns it.
      if exists (
        select 1 from public.blocks b
         where (b.blocker_id = v_author and b.blocked_id = f.follower_id)
            or (b.blocker_id = f.follower_id and b.blocked_id = v_author)
      ) or exists (
        select 1 from public.mutes m
         where m.muter_id = f.follower_id and m.muted_id = v_author
      ) then
        continue;
      end if;

      -- Structural, retry-safe delivery: the partial unique index turns a second
      -- insert for the same verdict into a no-op instead of an error.
      insert into public.notifications (id, recipient_id, actor_id, kind, entity_type, entity_id)
      values (
        'n_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
        f.follower_id, null, 'clash_result', 'clash', new.clash_id
      )
      on conflict (recipient_id, entity_id)
        where kind = 'clash_result' and entity_type = 'clash'
        do nothing;
    end loop;
  exception when others then
    raise warning 'clash follower notification failed for %: %', new.clash_id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists clash_verdict_notifies_followers on public.verdicts;
create trigger clash_verdict_notifies_followers
  after insert on public.verdicts
  for each row execute function public.notify_clash_followers_on_verdict();

-- 4. Data API privileges ----------------------------------------------------
grant execute on function public.can_follow_clash(text) to authenticated;
grant execute on function public.follow_clash(text) to authenticated;
grant execute on function public.unfollow_clash(text) to authenticated;

revoke execute on function public.can_follow_clash(text) from public, anon;
revoke execute on function public.follow_clash(text) from public, anon;
revoke execute on function public.unfollow_clash(text) from public, anon;
revoke execute on function public.notify_clash_followers_on_verdict() from public, anon, authenticated;

-- 5. Bounded reads for the signed-in follower ---------------------------------
/** Whether the signed-in viewer follows this Clash. */
create or replace function public.is_following_clash(p_clash_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clash_follows
     where clash_id = p_clash_id and follower_id = public.my_profile_id()
  );
$$;

/** Up to 30 followed Clashes, newest relationship first. */
create or replace function public.followed_clash_ids()
returns table (clash_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select cf.clash_id
    from public.clash_follows cf
   where cf.follower_id = public.my_profile_id()
   order by cf.created_at desc
   limit 30;
$$;

grant execute on function public.is_following_clash(text) to authenticated;
grant execute on function public.followed_clash_ids() to authenticated;
revoke execute on function public.is_following_clash(text) from public, anon;
revoke execute on function public.followed_clash_ids() from public, anon;


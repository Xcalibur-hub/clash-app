-- ============================================================================
-- CLASH 2.0 · Step 4C — Follow authorization, delivery isolation, privileges
-- ----------------------------------------------------------------------------
-- Forward-only hardening for Step 4A. 4A's migration is deliberately NOT edited:
-- environments that already recorded it still receive these corrections here.
--   * one viewer-scoped visibility rule (source Take author AND challenger:
--     blocks both directions, viewer mutes, cancelled, runtime fixtures) used at
--     follow time and at delivery time; never a caller-bound predicate reused
--     for another recipient
--   * follow cutoff = verdict insertion, enforced with a FOR SHARE lock that
--     serializes against settle_clash's FOR UPDATE
--   * per-recipient error isolation in delivery (one failure cannot roll back
--     earlier recipients or stop later ones)
--   * clash_notify is no longer executable by PUBLIC/anon/authenticated
-- ============================================================================

-- 1. Complete, explicitly viewer-scoped visibility rule ----------------------
create or replace function public.can_view_clash(p_clash_id text, p_viewer text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null and exists (
    select 1
      from public.clashes c
      join public.takes t on t.id = c.take_id
     where c.id = p_clash_id
       and c.status <> 'cancelled'
       and not t.is_runtime_fixture
       and not exists (
         select 1 from public.blocks b
          where (b.blocker_id = t.author_id and b.blocked_id = p_viewer)
             or (b.blocker_id = p_viewer and b.blocked_id = t.author_id)
             or (b.blocker_id = c.challenger_id and b.blocked_id = p_viewer)
             or (b.blocker_id = p_viewer and b.blocked_id = c.challenger_id))
       and not exists (
         select 1 from public.mutes m
          where m.muter_id = p_viewer
            and m.muted_id in (t.author_id, c.challenger_id))
  );
$$;

-- Caller-bound wrapper for the client-facing predicate.
create or replace function public.can_follow_clash(p_clash_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_view_clash(p_clash_id, public.my_profile_id());
$$;

-- 2. Follow: authorize before writing, and take the cutoff lock --------------
create or replace function public.follow_clash(p_clash_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_follower text := public.my_profile_id();
  v_row record;
begin
  if v_follower is null then
    raise exception 'sign in to follow a clash' using errcode = '42501';
  end if;

  -- FOR SHARE serializes with settle_clash's FOR UPDATE: a follow either
  -- commits before the authoritative verdict insert (and is eligible) or waits
  -- and observes 'settled' (and is refused). No deadlock: settlement never
  -- locks clash_follows, and this function never locks notifications.
  select c.status, c.take_id, c.challenger_id
    into v_row
    from public.clashes c
   where c.id = p_clash_id
     for share of c;

  -- Uniform unavailable: unknown, cancelled, settled, fixture and hidden
  -- Clashes are indistinguishable to the caller.
  if v_row is null
     or v_row.status <> 'open'
     or not public.can_view_clash(p_clash_id, v_follower) then
    raise exception 'clash is unavailable' using errcode = '42501';
  end if;

  insert into public.clash_follows (clash_id, follower_id)
  values (p_clash_id, v_follower)
  on conflict (clash_id, follower_id) do nothing;
end;
$$;

-- 3. Delivery: same complete rule, evaluated per recipient -------------------
create or replace function public.notify_clash_followers_on_verdict()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author text;
  v_challenger text;
  f record;
begin
  select t.author_id, c.challenger_id
    into v_author, v_challenger
    from public.clashes c join public.takes t on t.id = c.take_id
   where c.id = new.clash_id;

  for f in
    select cf.follower_id
      from public.clash_follows cf
     where cf.clash_id = new.clash_id
       -- Both debaters already receive their own clash_result.
       and cf.follower_id <> coalesce(v_author, '')
       and cf.follower_id <> coalesce(v_challenger, '')
  loop
    begin
      -- Identical visibility rule to follow time, but scoped to THIS recipient
      -- (never a caller-bound predicate).
      if not public.can_view_clash(new.clash_id, f.follower_id) then
        continue;
      end if;

      insert into public.notifications
        (id, recipient_id, actor_id, kind, entity_type, entity_id)
      values (
        'n_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
        f.follower_id, null, 'clash_result', 'clash', new.clash_id
      )
      on conflict (recipient_id, entity_id)
        where kind = 'clash_result' and entity_type = 'clash'
        do nothing;
    exception when others then
      -- Per-recipient isolation: a failure here rolls back only this
      -- subtransaction. Earlier recipients stay committed and later eligible
      -- recipients are still attempted. Delivery is best-effort, not retryable;
      -- there is no outbox, so exactly-once is not claimed.
      raise warning 'follower % notification failed for %: %',
        f.follower_id, new.clash_id, sqlerrm;
    end;
  end loop;

  return new;
end;
$$;

-- 4. Privileges: notification writers are server-only ------------------------
-- clash_notify previously carried the default PUBLIC grant plus anon and
-- authenticated, so any client could forge notifications for any recipient.
revoke execute on function public.clash_notify(text, text, public.notification_kind, text)
  from public, anon, authenticated;
revoke execute on function public.can_view_clash(text, text)
  from public, anon, authenticated;


-- ============================================================================
-- CLASH 2.0 · Step 4E — close the Step 4D release blockers
-- Forward-only; historical 4A/4C files are untouched.
--   A. compare-and-set account assertion on follow/unfollow (atomic with the
--      JWT the RPC actually executes under)
--   B. visibility parity: removed Takes, viewer-scoped block/mute helper, and
--      scheduled-topic Room membership
--   C. structural uniqueness for every clash_result writer + deployment-time
--      duplicate diagnostic (nothing is deleted automatically)
-- ============================================================================

-- A. Structural dedup for ALL writers (settle_clash, legacy, followers) ------
create or replace function public.dedupe_clash_result_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'clash_result' and new.entity_type = 'clash' and exists (
    select 1 from public.notifications n
     where n.recipient_id = new.recipient_id
       and n.kind = 'clash_result'
       and n.entity_type = 'clash'
       and n.entity_id = new.entity_id
  ) then
    -- Exactly one result notification per recipient per finalized verdict.
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_dedupe_clash_result on public.notifications;
create trigger notifications_dedupe_clash_result
  before insert on public.notifications
  for each row execute function public.dedupe_clash_result_notification();

-- Fail loudly and actionably when historical duplicates exist. Nothing is
-- deleted or rewritten by this migration.
do $$
declare
  v_duplicates integer;
begin
  select count(*) into v_duplicates from (
    select recipient_id, entity_id
      from public.notifications
     where kind = 'clash_result' and entity_type = 'clash'
     group by 1, 2
    having count(*) > 1
  ) duplicates;

  if v_duplicates > 0 then
    raise exception
      'cannot enforce clash_result uniqueness: % duplicate (recipient, clash) pairs exist',
      v_duplicates
      using hint = 'select recipient_id, entity_id, count(*) from public.notifications where kind = ''clash_result'' and entity_type = ''clash'' group by 1,2 having count(*) > 1; resolve them, then re-run.';
  end if;

  create unique index if not exists notifications_clash_result_unique
    on public.notifications (recipient_id, entity_id)
    where kind = 'clash_result' and entity_type = 'clash';
end;
$$;

-- C. Follow/unfollow with an atomic expected-account assertion ---------------
drop function if exists public.follow_clash(text);
create function public.follow_clash(p_clash_id text, p_expected_profile text default null)
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

  -- The RPC executes under whichever JWT Supabase attached to the request. If
  -- the session switched after the client validated, the expected profile no
  -- longer matches and nothing is written.
  if p_expected_profile is not null and v_follower <> p_expected_profile then
    raise exception 'clash is unavailable' using errcode = '42501';
  end if;

  -- FOR SHARE serializes against settle_clash's FOR UPDATE: a follow commits
  -- before the authoritative verdict insert or observes 'settled' and is
  -- refused. Settlement never locks clash_follows, so no lock cycle exists.
  select c.status into v_row
    from public.clashes c
   where c.id = p_clash_id
     for share of c;

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

drop function if exists public.unfollow_clash(text);
create function public.unfollow_clash(p_clash_id text, p_expected_profile text default null)
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
  if p_expected_profile is not null and v_follower <> p_expected_profile then
    raise exception 'clash is unavailable' using errcode = '42501';
  end if;

  -- Deliberately no status gate: settling a Clash must never trap a follower.
  delete from public.clash_follows
   where clash_id = p_clash_id and follower_id = v_follower;
end;
$$;

grant execute on function public.follow_clash(text, text) to authenticated;
grant execute on function public.unfollow_clash(text, text) to authenticated;
revoke execute on function public.follow_clash(text, text) from public, anon;
revoke execute on function public.unfollow_clash(text, text) from public, anon;
revoke execute on function public.dedupe_clash_result_notification() from public, anon, authenticated;

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
      left join public.arena_rooms r on r.clash_id = c.id
      left join public.arena_daily_topics topic on topic.id = r.topic_id
     where c.id = p_clash_id
       and c.status <> 'cancelled'
       -- Parity with the takes RLS policy and arena_take_readable().
       and t.status <> 'removed'
       and not t.is_runtime_fixture
       and not public.arena_actor_hidden_internal(p_viewer, t.author_id)
       and not public.arena_actor_hidden_internal(p_viewer, c.challenger_id)
       -- Parity with arena_room_readable(): a scheduled-topic Room is readable
       -- only by its members (staff bypass is omitted here on purpose: this
       -- helper is evaluated for arbitrary recipients, so a caller-bound staff
       -- check would be wrong).
       and (
         r.id is null
         or topic.status <> 'scheduled'
         or exists (
           select 1 from public.arena_room_participants p
            where p.room_id = r.id and p.profile_id = p_viewer)
       )
  );
$$;

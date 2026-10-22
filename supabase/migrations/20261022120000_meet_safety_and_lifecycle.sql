-- ============================================================================
-- E3.2 — Meet: server-enforced session lease, abuse limits and moderation path
-- ----------------------------------------------------------------------------
-- Closes, at the database layer:
--   · M-01  abandoned sessions stayed `active` forever (no expiry column,
--           no heartbeat, no sweep) and pinned both users through
--           `meet_has_active_session`.
--   · M-05  reports were session-only, reason-poor and unreadable by staff.
--   · M-11  unbounded signal payloads and unlimited read RPCs.
--   · M-21  no read budgets on queue / session / message / signal polling.
--
-- Design rules honoured here:
--   · Server-authoritative: expiry is a column, never client state. A client
--     can only *extend an existing lease*, never choose its length.
--   · Idempotent: every transition is `where status = 'active'`-guarded, so a
--     replayed sweep or a late heartbeat cannot resurrect a session.
--   · Concurrency-safe: heartbeats lock the session row; the sweep uses
--     `for update skip locked` and re-checks its predicate after locking.
--   · No weakening: every existing REVOKE/GRANT is preserved verbatim, the
--     tables stay RPC-only, and nothing new is exposed to `anon`.
--   · No cron change: the sweep rides on `cleanup_meet_signals`, which
--     `run_maintenance` already calls from the `clash-maintenance` job.
--
-- Two consequences of a *lazy* expiry that are handled here explicitly:
--   · A lapsed row still holds the unique seat index until something releases
--     it, so a BEFORE INSERT trigger (§2b) frees stale seats at the only point
--     every matching path passes through.
--   · Heartbeats extend a live session but stop extending at 6 h (§12), so an
--     unattended script cannot hold a stranger's seat open indefinitely.
--
-- Lease semantics (idle, not wall-clock):
--   foreground idle (no typing)      → client heartbeat every ≤15 s → alive
--   app backgrounded / process death → no heartbeat → ended within 90 s + cron
--   temporary disconnection < 90 s   → next tick refreshes, nothing lost
--   explicit Leave / Next / Block    → unchanged: immediate end
-- ============================================================================

-- ── 1. Child-safety is its own report reason ────────────────────────────────
-- Appended, never reordered: existing rows keep their value.
alter type public.report_reason add value if not exists 'child_safety';

-- ── 2. Lease columns ────────────────────────────────────────────────────────
alter table public.meet_sessions
  add column if not exists expires_at timestamptz not null
    default (now() + interval '90 seconds');

-- Setting the default separately keeps a re-run honest: `add column if not
-- exists` never changes an existing default, and a 30-minute first lease would
-- pin the peer of a killed app for half an hour.
alter table public.meet_sessions
  alter column expires_at set default (now() + interval '90 seconds');

alter table public.meet_participants
  add column if not exists last_heartbeat_at timestamptz;

-- Drain pre-existing sessions instead of trusting a 30-minute default that was
-- computed for every historic row at ALTER time. A deploy ends stale sessions
-- within one sweep tick; a live call gets a two-minute courtesy window.
update public.meet_sessions
   set expires_at = least(expires_at, now() + interval '2 minutes')
 where status = 'active';

-- Sweep index: only active rows are ever scanned.
create index if not exists meet_sessions_active_expires_idx
  on public.meet_sessions (expires_at)
  where status = 'active';

-- ── 2b. A lapsed session must never block the next match ────────────────────
-- `meet_participants_active_one_idx` is UNIQUE (profile_id) WHERE left_at IS NULL.
-- Expiry is lazy (read paths stop trusting the lease immediately; the sweeper
-- closes the row later), so between the lapse and the sweep the old participant
-- row is still `left_at is null`. A user rejoining in that window would hit the
-- unique index — a hard failure, not a graceful one.
--
-- Releasing at insert time is the only choke point that covers every path
-- (`join_meet_queue`, `poll_meet_queue`, `next_meet`, and the *peer* being
-- matched in, which no caller-side fix could reach).
create or replace function public.release_stale_meet_participation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meet_participants p
     set left_at = now()
   where p.profile_id = new.profile_id
     and p.left_at is null
     and exists (
       select 1
         from public.meet_sessions s
        where s.id = p.session_id
          and (s.status <> 'active' or s.expires_at <= now())
     );
  return new;
end;
$$;

revoke execute on function public.release_stale_meet_participation() from public, anon, authenticated;

drop trigger if exists meet_participants_release_stale on public.meet_participants;
create trigger meet_participants_release_stale
  before insert on public.meet_participants
  for each row execute function public.release_stale_meet_participation();

-- ── 3. Helpers ──────────────────────────────────────────────────────────────
-- One predicate for "live", used by every read path so a lapsed lease is
-- already dead in the API before the sweeper gets to the row.
create or replace function public.meet_session_is_live(p_session_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.meet_sessions s
     where s.id = p_session_id
       and s.status = 'active'
       and s.expires_at > now()
  );
$$;

revoke execute on function public.meet_session_is_live(text) from public, anon, authenticated;

-- Retention guard: a session referenced by an open/reviewing report (or by an
-- open report on one of its messages) is evidence. Meet content is NOT deleted
-- in this phase, so this predicate is the contract the E3.7 retention sweep
-- must call before removing anything.
create or replace function public.meet_session_under_review(p_session_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.reports r
     where r.status in ('open', 'reviewing')
       and (
         (r.target_kind = 'meet_session' and r.target_id = p_session_id)
         or (
           r.target_kind = 'meet_message'
           and exists (
             select 1 from public.meet_messages m
              where m.id = r.target_id and m.session_id = p_session_id
           )
         )
       )
  );
$$;

revoke execute on function public.meet_session_under_review(text) from public, anon, authenticated;


-- ── 4. Expiry sweep (idempotent, skip-locked) ───────────────────────────────
create or replace function public.expire_stale_meet_sessions(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids text[];
  v_n integer := 0;
begin
  -- `skip locked` keeps two overlapping sweeps from colliding; ordering by the
  -- oldest lease means a backlog drains in expiry order.
  with doomed as (
    select s.id
      from public.meet_sessions s
     where s.status = 'active'
       and s.expires_at <= now()
     order by s.expires_at asc
     for update skip locked
     limit greatest(1, least(coalesce(p_limit, 200), 1000))
  ), ended as (
    update public.meet_sessions s
       set status = 'ended',
           ended_at = now(),
           end_reason = 'expired'
      from doomed d
     where s.id = d.id
       and s.status = 'active'
    returning s.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from ended;

  v_n := coalesce(cardinality(v_ids), 0);
  if v_n > 0 then
    -- Both seats are released so neither user stays pinned by an abandoned row.
    update public.meet_participants
       set left_at = coalesce(left_at, now())
     where session_id = any (v_ids)
       and left_at is null;
  end if;

  return v_n;
end;
$$;

revoke execute on function public.expire_stale_meet_sessions(integer) from public, anon, authenticated;
grant execute on function public.expire_stale_meet_sessions(integer) to service_role;

-- ── 5. Existing Meet maintenance entry point now also sweeps leases ─────────
-- `run_maintenance` calls this function from the `clash-maintenance` pg_cron job
-- every minute. Adding the sweep here (instead of re-defining run_maintenance)
-- keeps the scheduled path, the returned summary keys and the dynamically
-- patched failure-recovery guard in `20261009120000` untouched.
create or replace function public.cleanup_meet_signals(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
  v_sessions integer;
begin
  with doomed as (
    select s.id
      from public.meet_signals s
      join public.meet_sessions ms on ms.id = s.session_id
     where ms.status = 'ended'
        or s.created_at < now() - interval '2 hours'
     order by s.created_at asc
     limit greatest(1, least(coalesce(p_limit, 500), 2000))
  )
  delete from public.meet_signals s
   using doomed d
   where s.id = d.id;
  get diagnostics v_n = row_count;

  update public.meet_queue
     set status = 'cancelled', updated_at = now()
   where status = 'waiting'
     and queued_at < now() - interval '30 minutes';

  -- Bounded so one bad batch can never monopolise the maintenance tick.
  v_sessions := public.expire_stale_meet_sessions(
    greatest(1, least(coalesce(p_limit, 500), 500))
  );
  if v_sessions > 0 then
    raise notice 'expire_stale_meet_sessions ended % session(s)', v_sessions;
  end if;

  return coalesce(v_n, 0);
end;
$$;

revoke execute on function public.cleanup_meet_signals(integer) from public, anon, authenticated;
grant execute on function public.cleanup_meet_signals(integer) to service_role;

-- ── 6. Active-session gate is lease-aware ───────────────────────────────────
create or replace function public.meet_has_active_session(p_profile text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.meet_participants p
      join public.meet_sessions s on s.id = p.session_id
     where p.profile_id = p_profile
       and p.left_at is null
       and s.status = 'active'
       and s.expires_at > now()
  );
$$;

revoke execute on function public.meet_has_active_session(text) from public, anon, authenticated;

-- ── 7. Session read model: a lapsed lease is reported as ended ──────────────
create or replace function public.meet_session_payload(p_session_id text, p_viewer text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.meet_sessions%rowtype;
  v_me public.meet_participants%rowtype;
  v_peer public.meet_participants%rowtype;
  v_live boolean;
begin
  select * into v_session from public.meet_sessions where id = p_session_id;
  if v_session.id is null then
    return null;
  end if;

  select * into v_me from public.meet_participants
   where session_id = p_session_id and profile_id = p_viewer;
  if v_me.profile_id is null then
    return null;
  end if;

  select * into v_peer from public.meet_participants
   where session_id = p_session_id and profile_id <> p_viewer
   limit 1;

  -- Expiry is authoritative here, not just in the sweeper: between lease lapse
  -- and the next cron tick the API must already say "ended/expired".
  v_live := public.meet_session_is_live(p_session_id);

  return jsonb_build_object(
    'sessionId', v_session.id,
    'mode', v_session.mode,
    'channel', v_session.channel,
    'status', case when v_live then 'active' else 'ended' end,
    'countryCode', case
      when v_session.mode = 'COUNTRY' then v_session.country_code
      else null
    end,
    'hood', case when v_session.mode = 'HOOD' then v_session.hood else null end,
    'sharedInterest', v_session.shared_interest,
    'myAlias', v_me.alias,
    'peerAlias', coalesce(v_peer.alias, 'Stranger'),
    'peerConnected', v_live and coalesce(v_peer.left_at is null, false),
    'isOfferer', v_me.seat = 'A',
    'createdAt', v_session.created_at,
    'expiresAt', v_session.expires_at,
    'endedAt', case
      when v_live then v_session.ended_at
      else coalesce(v_session.ended_at, v_session.expires_at)
    end,
    'endReason', case
      when v_live then v_session.end_reason
      else coalesce(v_session.end_reason, 'expired')
    end
  );
end;
$$;

revoke execute on function public.meet_session_payload(text, text) from public, anon, authenticated;

create or replace function public.get_meet_session(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_payload jsonb;
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'meet_session_read', 300, interval '5 minutes');

  v_payload := public.meet_session_payload(p_session_id, v_user);
  if v_payload is null then
    -- Missing session and non-participant are indistinguishable on purpose.
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  return v_payload;
end;
$$;

revoke execute on function public.get_meet_session(text) from public;
grant execute on function public.get_meet_session(text) to authenticated;


-- ── 8. Queue polling (bounded) and lease-aware matching ─────────────────────
create or replace function public.poll_meet_queue()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_queue public.meet_queue%rowtype;
  v_match jsonb;
  v_active text;
  v_payload jsonb;
begin
  if v_user is null then
    raise exception 'sign in to meet' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'meet_poll', 240, interval '5 minutes');

  if public.meet_has_active_session(v_user) then
    select p.session_id into v_active
      from public.meet_participants p
      join public.meet_sessions s on s.id = p.session_id
     where p.profile_id = v_user
       and p.left_at is null
       and s.status = 'active'
       and s.expires_at > now()
     limit 1;
    v_payload := public.meet_session_payload(v_active, v_user);
    if v_payload is not null then
      return jsonb_build_object('matched', true, 'session', v_payload);
    end if;
    -- The row vanished between the gate and the read. Fall through to the queue
    -- rather than answering "matched" with a null session, which the client
    -- would have to render as a lost match.
  end if;

  select * into v_queue
    from public.meet_queue
   where profile_id = v_user and status = 'waiting'
   order by queued_at desc
   limit 1;

  if v_queue.id is null then
    return jsonb_build_object('queued', false, 'matched', false);
  end if;

  v_match := public.try_meet_match(v_queue.id);
  if (v_match ->> 'matched')::boolean then
    return jsonb_build_object('queued', false, 'matched', true, 'session', v_match -> 'session');
  end if;

  return jsonb_build_object(
    'queued', true,
    'matched', false,
    'queueId', v_queue.id,
    'mode', v_queue.mode,
    'channel', v_queue.channel,
    'queuedAt', v_queue.queued_at
  );
end;
$$;

revoke execute on function public.poll_meet_queue() from public;
grant execute on function public.poll_meet_queue() to authenticated;

create or replace function public.join_meet_queue(
  p_mode public.meet_match_mode,
  p_country_code text default null,
  p_hood public.hood_id default null,
  p_interests text[] default '{}',
  p_channel public.meet_channel default 'TEXT'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_country text := nullif(upper(btrim(coalesce(p_country_code, ''))), '');
  v_interests text[] := coalesce(p_interests, '{}');
  v_channel public.meet_channel := coalesce(p_channel, 'TEXT');
  v_queue public.meet_queue%rowtype;
  v_active text;
  v_match jsonb;
  v_payload jsonb;
begin
  if v_user is null then
    raise exception 'sign in to meet' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'meet_join', 20, interval '10 minutes');

  if v_channel = 'VIDEO' then
    if not public.can_use_video_meet(v_user) then
      raise exception 'not eligible for video meet' using errcode = 'P0005';
    end if;
    if not exists (select 1 from public.meet_video_acks a where a.profile_id = v_user) then
      raise exception 'acknowledge video safety first' using errcode = 'P0004';
    end if;
  end if;

  if public.meet_has_active_session(v_user) then
    select p.session_id into v_active
      from public.meet_participants p
      join public.meet_sessions s on s.id = p.session_id
     where p.profile_id = v_user
       and p.left_at is null
       and s.status = 'active'
       and s.expires_at > now()
     limit 1;
    v_payload := public.meet_session_payload(v_active, v_user);
    if v_payload is not null then
      return jsonb_build_object(
        'queued', false,
        'alreadyActive', true,
        'session', v_payload
      );
    end if;
    -- Vanished between gate and read: queue normally instead of returning a
    -- match the client cannot open.
  end if;

  if p_mode = 'COUNTRY' and (v_country is null or v_country !~ '^[A-Z]{2}$') then
    raise exception 'country required' using errcode = 'P0004';
  end if;
  if p_mode = 'HOOD' then
    if p_hood is null then
      raise exception 'hood required' using errcode = 'P0004';
    end if;
    if not exists (
      select 1 from public.hood_memberships h
       where h.profile_id = v_user and h.hood = p_hood
    ) then
      raise exception 'join hood first' using errcode = 'P0004';
    end if;
  end if;
  if p_mode = 'INTERESTS' then
    select coalesce(array_agg(distinct btrim(x)), '{}') into v_interests
      from unnest(v_interests) x
     where char_length(btrim(x)) between 1 and 40;
    if coalesce(cardinality(v_interests), 0) < 1 then
      raise exception 'interests required' using errcode = 'P0004';
    end if;
  end if;

  update public.meet_queue
     set status = 'cancelled', updated_at = now()
   where profile_id = v_user and status = 'waiting';

  insert into public.meet_queue (profile_id, mode, channel, country_code, hood, interests)
  values (
    v_user,
    p_mode,
    v_channel,
    case when p_mode = 'COUNTRY' then v_country else null end,
    case when p_mode = 'HOOD' then p_hood else null end,
    case when p_mode = 'INTERESTS' then v_interests else '{}'::text[] end
  )
  returning * into v_queue;

  v_match := public.try_meet_match(v_queue.id);
  if (v_match ->> 'matched')::boolean then
    return jsonb_build_object(
      'queued', false,
      'matched', true,
      'session', v_match -> 'session'
    );
  end if;

  return jsonb_build_object(
    'queued', true,
    'matched', false,
    'queueId', v_queue.id,
    'mode', v_queue.mode,
    'channel', v_queue.channel,
    'queuedAt', v_queue.queued_at
  );
end;
$$;

revoke execute on function public.join_meet_queue(public.meet_match_mode, text, public.hood_id, text[], public.meet_channel) from public;
grant execute on function public.join_meet_queue(public.meet_match_mode, text, public.hood_id, text[], public.meet_channel) to authenticated;


-- ── 9. Message writes respect the lease ─────────────────────────────────────
create or replace function public.send_meet_message(p_session_id text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_session public.meet_sessions%rowtype;
  v_msg public.meet_messages%rowtype;
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'meet_message', 40, interval '10 minutes');

  if v_body is null or char_length(v_body) > 280 then
    raise exception 'invalid message' using errcode = 'P0004';
  end if;

  select * into v_session from public.meet_sessions where id = p_session_id for update;
  -- Missing, ended and lapsed all read as "closed": no existence oracle.
  if v_session.id is null
     or v_session.status <> 'active'
     or v_session.expires_at <= now() then
    raise exception 'session closed' using errcode = 'P0003';
  end if;

  if not exists (
    select 1 from public.meet_participants p
     where p.session_id = p_session_id and p.profile_id = v_user and p.left_at is null
  ) then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.meet_participants p
     where p.session_id = p_session_id
       and p.profile_id <> v_user
       and public.meet_is_blocked(v_user, p.profile_id)
  ) then
    raise exception 'blocked' using errcode = 'P0005';
  end if;

  -- Duplicate / spam throttle: identical body within 8s.
  if exists (
    select 1 from public.meet_messages m
     where m.session_id = p_session_id
       and m.sender_id = v_user
       and m.body = v_body
       and m.created_at > now() - interval '8 seconds'
  ) then
    raise exception 'slow down' using errcode = 'P0006';
  end if;

  insert into public.meet_messages (session_id, sender_id, body)
  values (p_session_id, v_user, v_body)
  returning * into v_msg;

  return jsonb_build_object(
    'id', v_msg.id,
    'sessionId', v_msg.session_id,
    'mine', true,
    'body', v_msg.body,
    'createdAt', v_msg.created_at
  );
end;
$$;

revoke execute on function public.send_meet_message(text, text) from public;
grant execute on function public.send_meet_message(text, text) to authenticated;

-- ── 10. Message history: participant-only, read-budgeted, never peer ids ────
create or replace function public.list_meet_messages(
  p_session_id text,
  p_limit integer default 40,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 40), 80));
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'meet_message_read', 240, interval '5 minutes');

  if not exists (
    select 1 from public.meet_participants p
     where p.session_id = p_session_id and p.profile_id = v_user
  ) then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id,
               'sessionId', m.session_id,
               'mine', m.sender_id = v_user,
               'body', m.body,
               'createdAt', m.created_at
             ) order by m.created_at asc)
        from (
          select *
            from public.meet_messages m
           where m.session_id = p_session_id
             and (p_before is null or m.created_at < p_before)
           order by m.created_at desc
           limit v_limit
        ) m
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.list_meet_messages(text, integer, timestamptz) from public;
grant execute on function public.list_meet_messages(text, integer, timestamptz) to authenticated;


-- ── 11. Explicit end stays immediate and idempotent ─────────────────────────
create or replace function public.leave_meet_session(
  p_session_id text,
  p_reason text default 'leave'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_session public.meet_sessions%rowtype;
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'meet_leave', 60, interval '10 minutes');

  select * into v_session from public.meet_sessions where id = p_session_id for update;
  if v_session.id is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.meet_participants p
     where p.session_id = p_session_id and p.profile_id = v_user
  ) then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  update public.meet_participants
     set left_at = coalesce(left_at, now())
   where session_id = p_session_id and profile_id = v_user;

  -- A sweep may already have ended it; never overwrite the first reason.
  if v_session.status = 'active' then
    update public.meet_sessions
       set status = 'ended',
           ended_at = now(),
           end_reason = coalesce(nullif(btrim(p_reason), ''), 'leave')
     where id = p_session_id;
    update public.meet_participants
       set left_at = coalesce(left_at, now())
     where session_id = p_session_id and left_at is null;
  end if;

  return jsonb_build_object('left', true, 'sessionId', p_session_id);
end;
$$;

revoke execute on function public.leave_meet_session(text, text) from public;
grant execute on function public.leave_meet_session(text, text) to authenticated;

-- ── 12. Heartbeat: the only way a client can extend its own lease ───────────
-- Locks the session row, so a heartbeat can never race a sweep into extending
-- a session the sweeper just closed, and vice versa.
create or replace function public.touch_meet_session(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_status public.meet_session_status;
  v_expires timestamptz;
  v_reason text;
  v_created timestamptz;
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'meet_touch', 120, interval '5 minutes');

  select s.status, s.expires_at, s.end_reason, s.created_at
    into v_status, v_expires, v_reason, v_created
    from public.meet_participants p
    join public.meet_sessions s on s.id = p.session_id
   where p.session_id = p_session_id
     and p.profile_id = v_user
   for update of s;

  if v_status is null then
    -- Unknown session and non-participant are intentionally identical.
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  if v_status <> 'active' or v_expires <= now() then
    return jsonb_build_object(
      'active', false,
      'endReason', coalesce(v_reason, 'expired'),
      'expiresAt', v_expires
    );
  end if;

  update public.meet_participants
     set last_heartbeat_at = now()
   where session_id = p_session_id and profile_id = v_user;

  -- Server-side throttle: refresh the lease only when less than 60 s is left.
  -- The client controls *when* it beats, never *how long* the lease is.
  --
  -- The ceiling is deliberate: a heartbeat keeps an *attended* session alive, it
  -- must not let a script hold a stranger's seat open forever.
  if v_expires < now() + interval '60 seconds' then
    update public.meet_sessions
       set expires_at = least(now() + interval '90 seconds', v_created + interval '6 hours')
     where id = p_session_id
       and status = 'active'
     returning expires_at into v_expires;
  end if;

  -- A capped extension lands in the past: report it as expired now rather than
  -- handing the client an `active: true` with a dead lease.
  if v_expires is null or v_expires <= now() then
    return jsonb_build_object(
      'active', false,
      'endReason', 'expired',
      'expiresAt', v_expires
    );
  end if;

  return jsonb_build_object(
    'active', true,
    'endReason', null,
    'expiresAt', v_expires
  );
end;
$$;

revoke execute on function public.touch_meet_session(text) from public;
grant execute on function public.touch_meet_session(text) to authenticated;


-- ── 13. Block / report are rate-limited, participant-scoped, idempotent ─────
create or replace function public.block_meet_peer(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_peer text;
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'meet_block', 20, interval '10 minutes');

  -- Participation is checked *before* the peer lookup. Without it any signed-in
  -- caller who guessed a session id could block the stranger sitting in it, and
  -- `leave_meet_session` would then end a session they are not part of.
  if not exists (
    select 1 from public.meet_participants p
     where p.session_id = p_session_id and p.profile_id = v_user
  ) then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  select p.profile_id into v_peer
    from public.meet_participants p
   where p.session_id = p_session_id and p.profile_id <> v_user
   limit 1;

  if v_peer is null then
    raise exception 'peer not found' using errcode = 'P0002';
  end if;

  perform public.block_profile(v_peer);
  perform public.leave_meet_session(p_session_id, 'block');
  return jsonb_build_object('blocked', true);
end;
$$;

revoke execute on function public.block_meet_peer(text) from public;
grant execute on function public.block_meet_peer(text) to authenticated;

create or replace function public.report_meet_session(
  p_session_id text,
  p_reason public.report_reason,
  p_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_detail text := nullif(btrim(coalesce(p_detail, '')), '');
  v_report text;
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'meet_report', 10, interval '10 minutes');

  if v_detail is not null and char_length(v_detail) > 500 then
    raise exception 'detail too long' using errcode = 'P0004';
  end if;

  -- Any participation counts, including one that already left, so a person can
  -- always report after hanging up.
  if not exists (
    select 1 from public.meet_participants p
     where p.session_id = p_session_id and p.profile_id = v_user
  ) then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  v_report := public.submit_report('meet_session', p_session_id, p_reason, v_detail);
  return jsonb_build_object('reported', true, 'reportId', v_report);
end;
$$;

revoke execute on function public.report_meet_session(text, public.report_reason, text) from public;
grant execute on function public.report_meet_session(text, public.report_reason, text) to authenticated;

-- Message-level report: the target the `meet_message` enum value always
-- promised. Reporting never ends the session by itself — leaving stays explicit
-- (and reporting must not become a way to eject the other person).
create or replace function public.report_meet_message(
  p_session_id text,
  p_message_id text,
  p_reason public.report_reason,
  p_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_detail text := nullif(btrim(coalesce(p_detail, '')), '');
  v_report text;
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'meet_report', 10, interval '10 minutes');

  if v_detail is not null and char_length(v_detail) > 500 then
    raise exception 'detail too long' using errcode = 'P0004';
  end if;

  if not exists (
    select 1 from public.meet_participants p
     where p.session_id = p_session_id and p.profile_id = v_user
  ) then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  -- Own messages, foreign sessions and unknown ids all answer identically, so
  -- the RPC cannot be used to probe which message ids exist.
  if not exists (
    select 1 from public.meet_messages m
     where m.id = p_message_id
       and m.session_id = p_session_id
       and m.sender_id <> v_user
  ) then
    raise exception 'message not found' using errcode = 'P0002';
  end if;

  v_report := public.submit_report('meet_message', p_message_id, p_reason, v_detail);
  return jsonb_build_object(
    'reported', true,
    'reportId', v_report,
    'sessionId', p_session_id,
    'messageId', p_message_id
  );
end;
$$;

revoke execute on function public.report_meet_message(text, text, public.report_reason, text) from public;
grant execute on function public.report_meet_message(text, text, public.report_reason, text) to authenticated;


-- ── 14. Staff evidence access, audited ──────────────────────────────────────
-- One row per read of a Meet transcript by staff. Kept without a foreign key on
-- session_id so the audit trail survives any future retention deletion.
create table if not exists public.meet_moderation_reads (
  id            text primary key default public.new_arena_id('mmr_'),
  moderator_id  text not null references public.profiles (id) on delete cascade,
  session_id    text not null,
  created_at    timestamptz not null default now()
);

create index if not exists meet_moderation_reads_session_idx
  on public.meet_moderation_reads (session_id, created_at desc);

alter table public.meet_moderation_reads enable row level security;
revoke all on table public.meet_moderation_reads from public, anon;
grant select on table public.meet_moderation_reads to authenticated;

drop policy if exists "meet moderation reads are visible to staff" on public.meet_moderation_reads;
create policy "meet moderation reads are visible to staff"
  on public.meet_moderation_reads for select using (public.is_staff());

-- Staff-only evidence bundle for one session: participants, a bounded slice of
-- the transcript, and every open report that points at the session or one of
-- its messages. Signals (SDP/ICE with network addresses) are deliberately
-- excluded: they are not abuse evidence.
create or replace function public.moderate_meet_session(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_session public.meet_sessions%rowtype;
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'meet_moderate_read', 60, interval '10 minutes');

  select * into v_session from public.meet_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  -- Audit before returning content: a failed read leaves no row, a successful
  -- one always does.
  insert into public.meet_moderation_reads (moderator_id, session_id)
  values (v_user, v_session.id);

  return jsonb_build_object(
    'sessionId', v_session.id,
    'channel', v_session.channel,
    'mode', v_session.mode,
    'status', v_session.status,
    'createdAt', v_session.created_at,
    'endedAt', v_session.ended_at,
    'expiresAt', v_session.expires_at,
    'endReason', v_session.end_reason,
    'underReview', public.meet_session_under_review(v_session.id),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'profileId', p.profile_id,
               'seat', p.seat,
               'alias', p.alias,
               'joinedAt', p.joined_at,
               'leftAt', p.left_at,
               'lastHeartbeatAt', p.last_heartbeat_at
             ) order by p.seat)
        from public.meet_participants p
       where p.session_id = v_session.id
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id,
               'senderId', m.sender_id,
               'body', m.body,
               'createdAt', m.created_at
             ) order by m.created_at asc)
        from (
          select *
            from public.meet_messages m
           where m.session_id = v_session.id
           order by m.created_at desc
           limit 200
        ) m
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id,
               'targetKind', r.target_kind,
               'targetId', r.target_id,
               'reason', r.reason,
               'detail', r.detail,
               'status', r.status,
               'createdAt', r.created_at
             ) order by r.created_at asc)
        from public.reports r
       where (r.target_kind = 'meet_session' and r.target_id = v_session.id)
          or (
            r.target_kind = 'meet_message'
            and exists (
              select 1 from public.meet_messages m
               where m.id = r.target_id and m.session_id = v_session.id
            )
          )
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.moderate_meet_session(text) from public, anon;
grant execute on function public.moderate_meet_session(text) to authenticated;


-- ── 15. Signaling: lease-aware and bounded ──────────────────────────────────
create or replace function public.publish_meet_signal(
  p_session_id text,
  p_kind public.meet_signal_kind,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_session public.meet_sessions%rowtype;
  v_id text;
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'meet_signal', 120, interval '10 minutes');

  -- Authorization comes first: a non-participant must not be able to tell an
  -- unknown session id from an existing one, nor learn its channel or state.
  if not exists (
    select 1 from public.meet_participants p
     where p.session_id = p_session_id and p.profile_id = v_user and p.left_at is null
  ) then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  select * into v_session from public.meet_sessions where id = p_session_id for update;
  if v_session.id is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_session.status <> 'active' or v_session.expires_at <= now() then
    raise exception 'session ended' using errcode = 'P0003';
  end if;
  if v_session.channel <> 'VIDEO' then
    raise exception 'signaling only for video' using errcode = 'P0004';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid signal' using errcode = 'P0004';
  end if;

  -- Abuse caps (M-11): a 16 KB ceiling for the whole payload and a shape check
  -- per kind. Candidate strings are tiny; an SDP is a few KB at most.
  if octet_length(p_payload::text) > 16384 then
    raise exception 'signal too large' using errcode = 'P0004';
  end if;

  if p_kind in ('offer', 'answer') then
    if coalesce(jsonb_typeof(p_payload -> 'sdp'), 'null') <> 'string'
       or char_length(p_payload ->> 'sdp') > 12000 then
      raise exception 'invalid signal' using errcode = 'P0004';
    end if;
  elsif p_kind = 'ice' then
    if coalesce(jsonb_typeof(p_payload -> 'candidate'), 'null') <> 'string'
       or char_length(p_payload ->> 'candidate') = 0 then
      raise exception 'invalid signal' using errcode = 'P0004';
    end if;
  end if;

  -- One offer / one answer per session
  if p_kind = 'offer' then
    if exists (
      select 1 from public.meet_participants p
       where p.session_id = p_session_id and p.profile_id = v_user and p.seat <> 'A'
    ) then
      raise exception 'only offerer may publish offer' using errcode = 'P0005';
    end if;
    if exists (
      select 1 from public.meet_signals s
       where s.session_id = p_session_id and s.kind = 'offer'
    ) then
      raise exception 'offer already published' using errcode = 'P0006';
    end if;
  end if;

  if p_kind = 'answer' then
    if exists (
      select 1 from public.meet_participants p
       where p.session_id = p_session_id and p.profile_id = v_user and p.seat <> 'B'
    ) then
      raise exception 'only answerer may publish answer' using errcode = 'P0005';
    end if;
    if exists (
      select 1 from public.meet_signals s
       where s.session_id = p_session_id and s.kind = 'answer'
    ) then
      raise exception 'answer already published' using errcode = 'P0006';
    end if;
  end if;

  insert into public.meet_signals (session_id, sender_id, kind, payload)
  values (p_session_id, v_user, p_kind, p_payload)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'kind', p_kind);
end;
$$;

revoke execute on function public.publish_meet_signal(text, public.meet_signal_kind, jsonb) from public;
grant execute on function public.publish_meet_signal(text, public.meet_signal_kind, jsonb) to authenticated;

create or replace function public.list_meet_signals(
  p_session_id text,
  p_after timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;
  -- 500 ms polling is 600 calls per 5 minutes; the budget leaves headroom.
  perform public.assert_rate_limit(v_user, 'meet_signal_read', 900, interval '5 minutes');

  if not exists (
    select 1 from public.meet_participants p
     where p.session_id = p_session_id and p.profile_id = v_user
  ) then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.meet_sessions s
     where s.id = p_session_id
       and s.status = 'active'
       and s.expires_at > now()
       and s.channel = 'VIDEO'
  ) then
    return jsonb_build_object('items', '[]'::jsonb, 'active', false);
  end if;

  return jsonb_build_object(
    'active', true,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'kind', s.kind,
               'payload', s.payload,
               'createdAt', s.created_at
             ) order by s.created_at asc)
        from public.meet_signals s
       where s.session_id = p_session_id
         and s.sender_id <> v_user
         and (p_after is null or s.created_at > p_after)
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.list_meet_signals(text, timestamptz) from public;
grant execute on function public.list_meet_signals(text, timestamptz) to authenticated;

notify pgrst, 'reload schema';


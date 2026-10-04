-- ============================================================================
-- Phase 14.2 — Meet the World (pseudonymous text matching)
-- Server-authoritative queue + sessions. No video / WebRTC.
-- ============================================================================

do $$ begin
  create type public.meet_match_mode as enum ('ANYWHERE', 'COUNTRY', 'INTERESTS', 'HOOD');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.meet_queue_status as enum ('waiting', 'matched', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.meet_session_status as enum ('active', 'ended');
exception when duplicate_object then null;
end $$;

alter type public.report_target add value if not exists 'meet_session';
alter type public.report_target add value if not exists 'meet_message';

create table if not exists public.meet_queue (
  id              text primary key default public.new_arena_id('mq_'),
  profile_id      text not null references public.profiles (id) on delete cascade,
  mode            public.meet_match_mode not null,
  country_code    text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  hood            public.hood_id,
  interests       text[] not null default '{}',
  status          public.meet_queue_status not null default 'waiting',
  matched_session_id text,
  queued_at       timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint meet_queue_mode_country check (
    mode <> 'COUNTRY' or country_code is not null
  ),
  constraint meet_queue_mode_hood check (
    mode <> 'HOOD' or hood is not null
  ),
  constraint meet_queue_mode_interests check (
    mode <> 'INTERESTS' or cardinality(interests) >= 1
  )
);

create unique index if not exists meet_queue_one_waiting_idx
  on public.meet_queue (profile_id)
  where status = 'waiting';

create index if not exists meet_queue_waiting_idx
  on public.meet_queue (status, mode, queued_at)
  where status = 'waiting';

create table if not exists public.meet_sessions (
  id               text primary key default public.new_arena_id('ms_'),
  mode             public.meet_match_mode not null,
  status           public.meet_session_status not null default 'active',
  country_code     text,
  hood             public.hood_id,
  shared_interest  text,
  created_at       timestamptz not null default now(),
  ended_at         timestamptz,
  end_reason       text
);

create table if not exists public.meet_participants (
  session_id  text not null references public.meet_sessions (id) on delete cascade,
  profile_id  text not null references public.profiles (id) on delete cascade,
  seat        text not null check (seat in ('A', 'B')),
  alias       text not null,
  joined_at   timestamptz not null default now(),
  left_at     timestamptz,
  primary key (session_id, profile_id),
  unique (session_id, seat)
);

create unique index if not exists meet_participants_active_one_idx
  on public.meet_participants (profile_id)
  where left_at is null;

create table if not exists public.meet_messages (
  id          text primary key default public.new_arena_id('mm_'),
  session_id  text not null references public.meet_sessions (id) on delete cascade,
  sender_id   text not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 280),
  created_at  timestamptz not null default now()
);

create index if not exists meet_messages_session_idx
  on public.meet_messages (session_id, created_at);

create table if not exists public.meet_recent_matches (
  profile_id       text not null references public.profiles (id) on delete cascade,
  other_profile_id text not null references public.profiles (id) on delete cascade,
  matched_at       timestamptz not null default now(),
  primary key (profile_id, other_profile_id),
  check (profile_id <> other_profile_id)
);

create index if not exists meet_recent_matches_ttl_idx
  on public.meet_recent_matches (matched_at);

alter table public.meet_queue enable row level security;
alter table public.meet_sessions enable row level security;
alter table public.meet_participants enable row level security;
alter table public.meet_messages enable row level security;
alter table public.meet_recent_matches enable row level security;

revoke all on table public.meet_queue from public, anon, authenticated;
revoke all on table public.meet_sessions from public, anon, authenticated;
revoke all on table public.meet_participants from public, anon, authenticated;
revoke all on table public.meet_messages from public, anon, authenticated;
revoke all on table public.meet_recent_matches from public, anon, authenticated;

-- Messages are read only through security-definer RPCs (no direct SELECT).
-- Avoids leaking peer profile_id via Realtime row payloads.
drop policy if exists "meet messages own session" on public.meet_messages;

do $$ begin
  alter table public.meet_queue
    add constraint meet_queue_matched_session_fk
    foreign key (matched_session_id) references public.meet_sessions (id)
    on delete set null;
exception when duplicate_object then null;
end $$;

-- ── Helpers ──────────────────────────────────────────────────────────────────
create or replace function public.meet_is_blocked(p_a text, p_b text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
     where (b.blocker_id = p_a and b.blocked_id = p_b)
        or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

revoke execute on function public.meet_is_blocked(text, text) from public, anon, authenticated;

create or replace function public.meet_recently_matched(p_a text, p_b text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.meet_recent_matches r
     where r.profile_id = p_a
       and r.other_profile_id = p_b
       and r.matched_at > now() - interval '6 hours'
  );
$$;

revoke execute on function public.meet_recently_matched(text, text) from public, anon, authenticated;

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
  );
$$;

revoke execute on function public.meet_has_active_session(text) from public, anon, authenticated;

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

  return jsonb_build_object(
    'sessionId', v_session.id,
    'mode', v_session.mode,
    'status', v_session.status,
    'countryCode', case
      when v_session.mode = 'COUNTRY' then v_session.country_code
      else null
    end,
    'hood', case when v_session.mode = 'HOOD' then v_session.hood else null end,
    'sharedInterest', v_session.shared_interest,
    'myAlias', v_me.alias,
    'peerAlias', coalesce(v_peer.alias, 'Stranger'),
    'peerConnected', v_peer.left_at is null and v_session.status = 'active',
    'createdAt', v_session.created_at,
    'endedAt', v_session.ended_at,
    'endReason', v_session.end_reason
  );
end;
$$;

revoke execute on function public.meet_session_payload(text, text) from public, anon, authenticated;

create or replace function public.meet_create_session(
  p_a text,
  p_b text,
  p_mode public.meet_match_mode,
  p_country text,
  p_hood public.hood_id,
  p_shared_interest text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session text;
begin
  insert into public.meet_sessions (mode, country_code, hood, shared_interest)
  values (p_mode, p_country, p_hood, p_shared_interest)
  returning id into v_session;

  insert into public.meet_participants (session_id, profile_id, seat, alias)
  values
    (v_session, p_a, 'A', 'Stranger A'),
    (v_session, p_b, 'B', 'Stranger B');

  insert into public.meet_recent_matches (profile_id, other_profile_id)
  values (p_a, p_b), (p_b, p_a)
  on conflict (profile_id, other_profile_id) do update
    set matched_at = now();

  return v_session;
end;
$$;

revoke execute on function public.meet_create_session(text, text, public.meet_match_mode, text, public.hood_id, text)
  from public, anon, authenticated;

-- ── Matchmaking ──────────────────────────────────────────────────────────────
create or replace function public.try_meet_match(p_queue_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.meet_queue%rowtype;
  v_other public.meet_queue%rowtype;
  v_session text;
  v_shared text;
begin
  select * into v_me from public.meet_queue where id = p_queue_id for update;
  if v_me.id is null or v_me.status <> 'waiting' then
    return jsonb_build_object('matched', false);
  end if;

  if public.meet_has_active_session(v_me.profile_id) then
    update public.meet_queue set status = 'cancelled', updated_at = now() where id = v_me.id;
    return jsonb_build_object('matched', false, 'reason', 'already_active');
  end if;

  select q.* into v_other
    from public.meet_queue q
   where q.status = 'waiting'
     and q.id <> v_me.id
     and q.profile_id <> v_me.profile_id
     and q.mode = v_me.mode
     and (v_me.mode <> 'COUNTRY' or q.country_code = v_me.country_code)
     and (v_me.mode <> 'HOOD' or q.hood = v_me.hood)
     and (
       v_me.mode <> 'INTERESTS'
       or exists (
         select 1 from unnest(q.interests) i
          where i = any (v_me.interests)
       )
     )
     and not public.meet_is_blocked(v_me.profile_id, q.profile_id)
     and not public.meet_recently_matched(v_me.profile_id, q.profile_id)
     and not public.meet_has_active_session(q.profile_id)
   order by q.queued_at asc
   for update of q skip locked
   limit 1;

  if v_other.id is null then
    return jsonb_build_object('matched', false);
  end if;

  if v_me.mode = 'INTERESTS' then
    select i into v_shared
      from unnest(v_me.interests) i
     where i = any (v_other.interests)
     limit 1;
  end if;

  v_session := public.meet_create_session(
    v_me.profile_id,
    v_other.profile_id,
    v_me.mode,
    case when v_me.mode = 'COUNTRY' then v_me.country_code else null end,
    case when v_me.mode = 'HOOD' then v_me.hood else null end,
    v_shared
  );

  update public.meet_queue
     set status = 'matched',
         matched_session_id = v_session,
         updated_at = now()
   where id in (v_me.id, v_other.id);

  return jsonb_build_object(
    'matched', true,
    'session', public.meet_session_payload(v_session, v_me.profile_id)
  );
end;
$$;

revoke execute on function public.try_meet_match(text) from public, anon, authenticated;

create or replace function public.join_meet_queue(
  p_mode public.meet_match_mode,
  p_country_code text default null,
  p_hood public.hood_id default null,
  p_interests text[] default '{}'
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
  v_queue public.meet_queue%rowtype;
  v_active text;
  v_match jsonb;
begin
  if v_user is null then
    raise exception 'sign in to meet' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'meet_join', 20, interval '10 minutes');

  if public.meet_has_active_session(v_user) then
    select p.session_id into v_active
      from public.meet_participants p
      join public.meet_sessions s on s.id = p.session_id
     where p.profile_id = v_user and p.left_at is null and s.status = 'active'
     limit 1;
    return jsonb_build_object(
      'queued', false,
      'alreadyActive', true,
      'session', public.meet_session_payload(v_active, v_user)
    );
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

  insert into public.meet_queue (profile_id, mode, country_code, hood, interests)
  values (
    v_user,
    p_mode,
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
    'queuedAt', v_queue.queued_at
  );
end;
$$;

revoke execute on function public.join_meet_queue(public.meet_match_mode, text, public.hood_id, text[]) from public;
grant execute on function public.join_meet_queue(public.meet_match_mode, text, public.hood_id, text[]) to authenticated;

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
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;

  if public.meet_has_active_session(v_user) then
    select p.session_id into v_active
      from public.meet_participants p
      join public.meet_sessions s on s.id = p.session_id
     where p.profile_id = v_user and p.left_at is null and s.status = 'active'
     limit 1;
    return jsonb_build_object(
      'matched', true,
      'session', public.meet_session_payload(v_active, v_user)
    );
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
    'queuedAt', v_queue.queued_at
  );
end;
$$;

revoke execute on function public.poll_meet_queue() from public;
grant execute on function public.poll_meet_queue() to authenticated;

create or replace function public.leave_meet_queue()
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
  update public.meet_queue
     set status = 'cancelled', updated_at = now()
   where profile_id = v_user and status = 'waiting';
  return jsonb_build_object('left', true);
end;
$$;

revoke execute on function public.leave_meet_queue() from public;
grant execute on function public.leave_meet_queue() to authenticated;

create or replace function public.get_meet_session(p_session_id text)
returns jsonb
language plpgsql
stable
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
  v_payload := public.meet_session_payload(p_session_id, v_user);
  if v_payload is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  return v_payload;
end;
$$;

revoke execute on function public.get_meet_session(text) from public;
grant execute on function public.get_meet_session(text) to authenticated;

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
  if v_session.id is null or v_session.status <> 'active' then
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

create or replace function public.list_meet_messages(
  p_session_id text,
  p_limit integer default 40,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
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

create or replace function public.next_meet(
  p_session_id text,
  p_mode public.meet_match_mode,
  p_country_code text default null,
  p_hood public.hood_id default null,
  p_interests text[] default '{}'
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
  perform public.assert_rate_limit(v_user, 'meet_next', 15, interval '10 minutes');
  perform public.leave_meet_session(p_session_id, 'next');
  return public.join_meet_queue(p_mode, p_country_code, p_hood, p_interests);
end;
$$;

revoke execute on function public.next_meet(text, public.meet_match_mode, text, public.hood_id, text[]) from public;
grant execute on function public.next_meet(text, public.meet_match_mode, text, public.hood_id, text[]) to authenticated;

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
  v_report text;
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.meet_participants p
     where p.session_id = p_session_id and p.profile_id = v_user
  ) then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  v_report := public.submit_report('meet_session', p_session_id, p_reason, p_detail);
  return jsonb_build_object('reported', true, 'reportId', v_report);
end;
$$;

revoke execute on function public.report_meet_session(text, public.report_reason, text) from public;
grant execute on function public.report_meet_session(text, public.report_reason, text) to authenticated;

-- Intentionally NOT added to supabase_realtime: message rows include sender_id.
-- Clients poll list_meet_messages for history and use presence for typing.

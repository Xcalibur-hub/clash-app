-- ============================================================================
-- Phase 14.3 — Meet VIDEO (pseudonymous 1:1 WebRTC)
-- Channel splits TEXT/VIDEO queues. Signaling via meet_signals (not media).
-- ============================================================================

do $$ begin
  create type public.meet_channel as enum ('TEXT', 'VIDEO');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.meet_signal_kind as enum ('offer', 'answer', 'ice');
exception when duplicate_object then null;
end $$;

-- Channel on queue + sessions (default TEXT preserves 14.2 rows)
alter table public.meet_queue
  add column if not exists channel public.meet_channel not null default 'TEXT';

alter table public.meet_sessions
  add column if not exists channel public.meet_channel not null default 'TEXT';

drop index if exists public.meet_queue_waiting_idx;
create index meet_queue_waiting_idx
  on public.meet_queue (status, channel, mode, queued_at)
  where status = 'waiting';

-- Safety acknowledgement (one-time)
create table if not exists public.meet_video_acks (
  profile_id       text primary key references public.profiles (id) on delete cascade,
  acknowledged_at  timestamptz not null default now()
);

alter table public.meet_video_acks enable row level security;
revoke all on table public.meet_video_acks from public, anon, authenticated;

-- Server-managed ICE config (TURN never baked into the app bundle)
create table if not exists public.meet_ice_config (
  id              integer primary key default 1 check (id = 1),
  stun_urls       text[] not null default array['stun:stun.l.google.com:19302'],
  turn_urls       text[] not null default '{}',
  turn_username   text,
  turn_credential text,
  updated_at      timestamptz not null default now()
);

insert into public.meet_ice_config (id) values (1) on conflict (id) do nothing;

alter table public.meet_ice_config enable row level security;
revoke all on table public.meet_ice_config from public, anon, authenticated;

-- WebRTC signaling (SDP / ICE) — not media frames
create table if not exists public.meet_signals (
  id          text primary key default public.new_arena_id('msig_'),
  session_id  text not null references public.meet_sessions (id) on delete cascade,
  sender_id   text not null references public.profiles (id) on delete cascade,
  kind        public.meet_signal_kind not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists meet_signals_session_idx
  on public.meet_signals (session_id, created_at);

alter table public.meet_signals enable row level security;
revoke all on table public.meet_signals from public, anon, authenticated;

-- ── Eligibility (centralized; no fabricated age verification) ────────────────
create or replace function public.can_use_video_meet(p_profile text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ok boolean := false;
begin
  -- LIMITATION: app has no verified age gate. This hook only checks that the
  -- profile is a real authenticated account. Stronger age assurance plugs in here.
  select exists (
    select 1
      from public.profiles p
     where p.id = p_profile
       and p.auth_user_id is not null
  ) into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke execute on function public.can_use_video_meet(text) from public, anon;
grant execute on function public.can_use_video_meet(text) to authenticated;

create or replace function public.ack_meet_video_safety()
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
  insert into public.meet_video_acks (profile_id)
  values (v_user)
  on conflict (profile_id) do update set acknowledged_at = now();
  return jsonb_build_object('acknowledged', true);
end;
$$;

revoke execute on function public.ack_meet_video_safety() from public;
grant execute on function public.ack_meet_video_safety() to authenticated;

create or replace function public.has_meet_video_safety_ack()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.meet_video_acks a
     where a.profile_id = public.my_profile_id()
  );
$$;

revoke execute on function public.has_meet_video_safety_ack() from public;
grant execute on function public.has_meet_video_safety_ack() to authenticated;

-- ── Session payload (+ channel + offerer) ────────────────────────────────────
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
    'channel', v_session.channel,
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
    'isOfferer', v_me.seat = 'A',
    'createdAt', v_session.created_at,
    'endedAt', v_session.ended_at,
    'endReason', v_session.end_reason
  );
end;
$$;

-- ── Create session with channel ──────────────────────────────────────────────
drop function if exists public.meet_create_session(text, text, public.meet_match_mode, text, public.hood_id, text);

create or replace function public.meet_create_session(
  p_a text,
  p_b text,
  p_mode public.meet_match_mode,
  p_country text,
  p_hood public.hood_id,
  p_shared_interest text,
  p_channel public.meet_channel default 'TEXT'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session text;
begin
  insert into public.meet_sessions (mode, channel, country_code, hood, shared_interest)
  values (p_mode, p_channel, p_country, p_hood, p_shared_interest)
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

revoke execute on function public.meet_create_session(text, text, public.meet_match_mode, text, public.hood_id, text, public.meet_channel)
  from public, anon, authenticated;

-- ── Matchmaking (channel-aware) ──────────────────────────────────────────────
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
  v_offerer text;
  v_answerer text;
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
     and q.channel = v_me.channel
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

  -- Deterministic offerer: earlier queue, then profile_id tie-break.
  if (v_me.queued_at, v_me.profile_id) < (v_other.queued_at, v_other.profile_id) then
    v_offerer := v_me.profile_id;
    v_answerer := v_other.profile_id;
  else
    v_offerer := v_other.profile_id;
    v_answerer := v_me.profile_id;
  end if;

  v_session := public.meet_create_session(
    v_offerer,
    v_answerer,
    v_me.mode,
    case when v_me.mode = 'COUNTRY' then v_me.country_code else null end,
    case when v_me.mode = 'HOOD' then v_me.hood else null end,
    v_shared,
    v_me.channel
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

drop function if exists public.join_meet_queue(public.meet_match_mode, text, public.hood_id, text[]);

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

drop function if exists public.next_meet(text, public.meet_match_mode, text, public.hood_id, text[]);

create or replace function public.next_meet(
  p_session_id text,
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
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'meet_next', 15, interval '10 minutes');
  perform public.leave_meet_session(p_session_id, 'next');
  return public.join_meet_queue(p_mode, p_country_code, p_hood, p_interests, p_channel);
end;
$$;

revoke execute on function public.next_meet(text, public.meet_match_mode, text, public.hood_id, text[], public.meet_channel) from public;
grant execute on function public.next_meet(text, public.meet_match_mode, text, public.hood_id, text[], public.meet_channel) to authenticated;

-- ── Signaling ────────────────────────────────────────────────────────────────
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

  select * into v_session from public.meet_sessions where id = p_session_id for update;
  if v_session.id is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_session.status <> 'active' then
    raise exception 'session ended' using errcode = 'P0003';
  end if;
  if v_session.channel <> 'VIDEO' then
    raise exception 'signaling only for video' using errcode = 'P0004';
  end if;

  if not exists (
    select 1 from public.meet_participants p
     where p.session_id = p_session_id and p.profile_id = v_user and p.left_at is null
  ) then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid signal' using errcode = 'P0004';
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
stable
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
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

  if not exists (
    select 1 from public.meet_sessions s
     where s.id = p_session_id and s.status = 'active' and s.channel = 'VIDEO'
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

create or replace function public.get_meet_ice_servers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_cfg public.meet_ice_config%rowtype;
  v_servers jsonb := '[]'::jsonb;
  v_url text;
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;
  if not public.can_use_video_meet(v_user) then
    raise exception 'not eligible' using errcode = 'P0005';
  end if;

  select * into v_cfg from public.meet_ice_config where id = 1;
  if v_cfg.id is null then
    return jsonb_build_object(
      'iceServers', jsonb_build_array(
        jsonb_build_object('urls', jsonb_build_array('stun:stun.l.google.com:19302'))
      ),
      'hasTurn', false
    );
  end if;

  foreach v_url in array coalesce(v_cfg.stun_urls, '{}') loop
    v_servers := v_servers || jsonb_build_array(jsonb_build_object('urls', v_url));
  end loop;

  if coalesce(cardinality(v_cfg.turn_urls), 0) > 0
     and v_cfg.turn_username is not null
     and v_cfg.turn_credential is not null then
    v_servers := v_servers || jsonb_build_array(jsonb_build_object(
      'urls', to_jsonb(v_cfg.turn_urls),
      'username', v_cfg.turn_username,
      'credential', v_cfg.turn_credential
    ));
  end if;

  return jsonb_build_object(
    'iceServers', v_servers,
    'hasTurn', coalesce(cardinality(v_cfg.turn_urls), 0) > 0
      and v_cfg.turn_username is not null
      and v_cfg.turn_credential is not null
  );
end;
$$;

revoke execute on function public.get_meet_ice_servers() from public;
grant execute on function public.get_meet_ice_servers() to authenticated;

-- Cleanup expired signals + stale waiting queue rows
create or replace function public.cleanup_meet_signals(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
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

  return coalesce(v_n, 0);
end;
$$;

revoke execute on function public.cleanup_meet_signals(integer) from public, anon, authenticated;
grant execute on function public.cleanup_meet_signals(integer) to service_role;

create or replace function public.run_maintenance(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clashes integer;
  v_takes   integer;
  v_media   jsonb;
  v_rates   integer;
  v_drops   integer;
  v_subs    integer;
  v_preds   integer;
  v_world   integer;
  v_arena   integer;
  v_signals integer;
begin
  select public.settle_due_clashes(p_limit) into v_clashes;
  select public.expire_stale_takes(p_limit) into v_takes;
  select public.cleanup_stale_media(least(p_limit, 100)) into v_media;
  select public.cleanup_rate_limits(interval '7 days') into v_rates;
  select public.expire_vault_drops(p_limit) into v_drops;
  select public.expire_vault_subscriptions(p_limit) into v_subs;
  select public.close_prediction_games(p_limit) into v_preds;
  select public.expire_world_drops(p_limit) into v_world;
  select public.transition_due_arena_rooms(p_limit) into v_arena;
  select public.cleanup_meet_signals(p_limit) into v_signals;

  return jsonb_build_object(
    'clashes_settled', v_clashes,
    'takes_expired', v_takes,
    'media', v_media,
    'rate_limits_pruned', v_rates,
    'vault_drops_expired', v_drops,
    'vault_subscriptions_expired', v_subs,
    'prediction_games_closed', v_preds,
    'world_drops_expired', v_world,
    'arena_rooms_transitioned', v_arena,
    'meet_signals_pruned', v_signals
  );
end;
$$;

revoke execute on function public.run_maintenance(integer) from public, anon, authenticated;
grant execute on function public.run_maintenance(integer) to service_role;

-- Phase 6G.1 — server-owned Meet NEW-admission gate (first-release beta).
-- Forward-only. Does not rewrite prior migrations. Does not re-enable Meet.
-- Denies NEW TEXT/VIDEO queue inserts and match/session creation.
-- Preserves already-active continuation reads, cancel/leave/exit, block/report.
-- Compatible lock order with cancel_meet_search / try_meet_match: FOR UPDATE on
-- the caller's queue row remains the first Meet-row lock in the matcher path.

-- ── Policy helpers (not client-callable) ─────────────────────────────────────
create or replace function public.meet_new_admission_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

comment on function public.meet_new_admission_allowed() is
  'Phase 6G.1 server policy: false denies NEW Meet TEXT/VIDEO admission. Flip via a later forward migration only.';

create or replace function public.assert_meet_new_admission()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.meet_new_admission_allowed() then
    raise exception 'meet admission deferred for the text-debate beta'
      using errcode = 'P0006';
  end if;
end;
$$;

revoke all on function public.meet_new_admission_allowed() from public, anon, authenticated, service_role;
revoke all on function public.assert_meet_new_admission() from public, anon, authenticated, service_role;

-- ── Session factory: refuse NEW sessions even for service_role callers ───────
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
  perform public.assert_meet_new_admission();

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

-- ── Matcher: lock waiting row, then refuse NEW matches under the gate ────────
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

  -- After the same first-row lock as cancel_meet_search: deny before peer lock/create.
  if not public.meet_new_admission_allowed() then
    return jsonb_build_object('matched', false, 'reason', 'admission_deferred');
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

revoke execute on function public.try_meet_match(text) from public, anon, authenticated;

-- ── Join: preserve alreadyActive continuation; deny before any queue write ───
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
  end if;

  -- NEW admission boundary: raise before cancel-waiting / insert / match.
  perform public.assert_meet_new_admission();

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

revoke execute on function public.join_meet_queue(public.meet_match_mode, text, public.hood_id, text[], public.meet_channel) from public, anon;
grant execute on function public.join_meet_queue(public.meet_match_mode, text, public.hood_id, text[], public.meet_channel) to authenticated;

-- ── Poll: keep active-session reads; matcher path cannot create under gate ───
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
  end if;

  select * into v_queue
    from public.meet_queue
   where profile_id = v_user and status = 'waiting'
   order by queued_at desc
   limit 1;

  if v_queue.id is null then
    return jsonb_build_object('queued', false, 'matched', false);
  end if;

  -- Pre-gate leftover waiting rows may still exist; matcher returns matched:false.
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

revoke execute on function public.poll_meet_queue() from public, anon;
grant execute on function public.poll_meet_queue() to authenticated;

-- ── Next: refuse NEW admission before leave so continuation is not force-drained ─
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
  -- Deny re-queue before leaving the current authorized session.
  perform public.assert_meet_new_admission();
  perform public.leave_meet_session(p_session_id, 'next');
  return public.join_meet_queue(p_mode, p_country_code, p_hood, p_interests, p_channel);
end;
$$;

revoke execute on function public.next_meet(text, public.meet_match_mode, text, public.hood_id, text[], public.meet_channel) from public, anon;
grant execute on function public.next_meet(text, public.meet_match_mode, text, public.hood_id, text[], public.meet_channel) to authenticated;

-- Phase 6F.4 — actor-scoped Meet search cancellation / recovery.
-- Additive only. Does not enable matchmaking. Does not call try_meet_match.
-- Compatible lock order with try_meet_match: FOR UPDATE on the caller's queue row first.

create or replace function public.cancel_meet_search(p_queue_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_queue public.meet_queue%rowtype;
  v_session public.meet_sessions%rowtype;
  v_session_id text;
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;
  if p_queue_id is null or btrim(p_queue_id) = '' then
    raise exception 'queue id required' using errcode = '22023';
  end if;

  -- Same first lock as try_meet_match(p_queue_id): one of cancel or match wins the row.
  select * into v_queue
    from public.meet_queue
   where id = p_queue_id
   for update;

  -- Non-owner and missing are indistinguishable (no existence leak).
  if v_queue.id is null or v_queue.profile_id is distinct from v_user then
    return jsonb_build_object(
      'outcome', 'not_found',
      'queueId', p_queue_id,
      'resolved', false
    );
  end if;

  if v_queue.status = 'waiting' then
    update public.meet_queue
       set status = 'cancelled',
           updated_at = now()
     where id = v_queue.id
       and status = 'waiting';
    return jsonb_build_object(
      'outcome', 'cancelled_waiting',
      'queueId', v_queue.id,
      'resolved', true
    );
  end if;

  if v_queue.status = 'cancelled' then
    return jsonb_build_object(
      'outcome', 'already_terminal',
      'queueId', v_queue.id,
      'resolved', true
    );
  end if;

  -- status = matched: end only the session linked to THIS search, never an unrelated newer one.
  if v_queue.status = 'matched' then
    v_session_id := v_queue.matched_session_id;
    if v_session_id is null then
      update public.meet_queue
         set status = 'cancelled',
             updated_at = now()
       where id = v_queue.id;
      return jsonb_build_object(
        'outcome', 'already_terminal',
        'queueId', v_queue.id,
        'resolved', true
      );
    end if;

    select * into v_session
      from public.meet_sessions
     where id = v_session_id
     for update;

    if v_session.id is null then
      return jsonb_build_object(
        'outcome', 'already_terminal',
        'queueId', v_queue.id,
        'sessionId', v_session_id,
        'resolved', true
      );
    end if;

    if not exists (
      select 1 from public.meet_participants p
       where p.session_id = v_session_id and p.profile_id = v_user
    ) then
      -- Queue ownership already proven; missing participant row is treated terminal.
      return jsonb_build_object(
        'outcome', 'already_terminal',
        'queueId', v_queue.id,
        'sessionId', v_session_id,
        'resolved', true
      );
    end if;

    update public.meet_participants
       set left_at = coalesce(left_at, now())
     where session_id = v_session_id and profile_id = v_user;

    if v_session.status = 'active' then
      update public.meet_sessions
         set status = 'ended',
             ended_at = now(),
             end_reason = 'cancel'
       where id = v_session_id
         and status = 'active';
      update public.meet_participants
         set left_at = coalesce(left_at, now())
       where session_id = v_session_id and left_at is null;
    end if;

    -- Terminal fence on this search id so delayed join/poll cannot treat it as live.
    update public.meet_queue
       set status = 'cancelled',
           updated_at = now()
     where id = v_queue.id
       and status = 'matched';

    return jsonb_build_object(
      'outcome', 'ended_session',
      'queueId', v_queue.id,
      'sessionId', v_session_id,
      'resolved', true
    );
  end if;

  return jsonb_build_object(
    'outcome', 'unresolved',
    'queueId', v_queue.id,
    'resolved', false
  );
end;
$$;

revoke execute on function public.cancel_meet_search(text) from public, anon;
grant execute on function public.cancel_meet_search(text) to authenticated;

comment on function public.cancel_meet_search(text) is
  'Actor-scoped cancel of one Meet search by queue id. Cancels waiting or ends the linked match. Never matches. Never extends leases.';

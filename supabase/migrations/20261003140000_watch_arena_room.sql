-- Phase 13.8B — Explicit spectator room selection.
-- Debater placement stays server-authoritative via join_arena_topic.
-- Spectators do not consume capacity; they may move between rooms on a topic.
-- Debaters cannot leave their assigned room to watch another.

/**
 * Watch a specific room as a spectator.
 *
 * Returns the same join-shaped jsonb as join_arena_topic (joined, roomId, …).
 *
 * Rules:
 *   · Auth required
 *   · Room must belong to a live topic (or SETTLED for result viewing)
 *   · Debaters already on this topic: same room → idempotent; other room → refuse
 *   · Spectators may move to the chosen room (UPDATE room_id)
 *   · New viewers INSERT as spectator (no capacity increment)
 */
create or replace function public.watch_arena_room(p_room_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     text := public.my_profile_id();
  v_room     public.arena_rooms%rowtype;
  v_topic    public.arena_daily_topics%rowtype;
  v_existing public.arena_room_participants%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to watch a room' using errcode = '42501';
  end if;
  if p_room_id is null or btrim(p_room_id) = '' then
    raise exception 'room id is required' using errcode = 'P0003';
  end if;

  select * into v_room
    from public.arena_rooms
   where id = p_room_id
     for update;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;

  select * into v_topic
    from public.arena_daily_topics
   where id = v_room.topic_id
     for update;
  if not found then
    raise exception 'topic does not exist' using errcode = 'P0002';
  end if;

  -- Scheduled topics stay private. Closed topics may still be watched if the
  -- room settled (public result). Cancelled rooms are not watchable.
  if v_topic.status = 'scheduled' and not public.is_staff() then
    raise exception 'topic is not available' using errcode = 'P0003';
  end if;
  if v_room.status = 'CANCELLED' then
    raise exception 'this room is not available' using errcode = 'P0003';
  end if;
  if v_topic.status = 'live' and now() < v_topic.opens_at then
    raise exception 'topic has not opened yet' using errcode = 'P0003';
  end if;

  select * into v_existing
    from public.arena_room_participants
   where topic_id = v_room.topic_id
     and profile_id = v_user
     for update;

  if found then
    if v_existing.role = 'debater' then
      if v_existing.room_id = p_room_id then
        select * into v_room from public.arena_rooms where id = p_room_id;
        return jsonb_build_object(
          'joined', false,
          'roomId', v_existing.room_id,
          'topicId', v_room.topic_id,
          'stance', v_existing.initial_stance,
          'role', v_existing.role,
          'status', v_room.status,
          'capacity', v_room.capacity,
          'participantCount', v_room.participant_count,
          'joinedAt', v_existing.joined_at
        );
      end if;
      raise exception 'you are already debating in another room' using errcode = 'P0006';
    end if;

    -- Spectator already in this room.
    if v_existing.room_id = p_room_id then
      select * into v_room from public.arena_rooms where id = p_room_id;
      return jsonb_build_object(
        'joined', false,
        'roomId', v_existing.room_id,
        'topicId', v_room.topic_id,
        'stance', null,
        'role', 'spectator',
        'status', v_room.status,
        'capacity', v_room.capacity,
        'participantCount', v_room.participant_count,
        'joinedAt', v_existing.joined_at
      );
    end if;

    -- Move spectator membership to the chosen room (no capacity change).
    perform public.assert_rate_limit(v_user, 'arena_room_watch', 30, interval '1 hour');

    update public.arena_room_participants
       set room_id = p_room_id
     where topic_id = v_room.topic_id
       and profile_id = v_user
    returning * into v_existing;

    select * into v_room from public.arena_rooms where id = p_room_id;

    return jsonb_build_object(
      'joined', true,
      'roomId', v_room.id,
      'topicId', v_room.topic_id,
      'stance', null,
      'role', 'spectator',
      'status', v_room.status,
      'capacity', v_room.capacity,
      'participantCount', v_room.participant_count,
      'joinedAt', v_existing.joined_at
    );
  end if;

  -- Fresh spectator membership in the chosen room.
  if v_topic.status <> 'live' and v_room.status <> 'SETTLED' then
    raise exception 'topic is not live' using errcode = 'P0003';
  end if;
  if v_topic.status = 'live' and now() >= v_topic.closes_at and v_room.status <> 'SETTLED' then
    raise exception 'topic is closed' using errcode = 'P0003';
  end if;

  perform public.assert_rate_limit(v_user, 'arena_room_watch', 30, interval '1 hour');

  insert into public.arena_room_participants (
    room_id, topic_id, profile_id, initial_stance, role
  ) values (
    p_room_id, v_room.topic_id, v_user, null, 'spectator'
  )
  returning * into v_existing;

  select * into v_room from public.arena_rooms where id = p_room_id;

  return jsonb_build_object(
    'joined', true,
    'roomId', v_room.id,
    'topicId', v_room.topic_id,
    'stance', null,
    'role', 'spectator',
    'status', v_room.status,
    'capacity', v_room.capacity,
    'participantCount', v_room.participant_count,
    'joinedAt', v_existing.joined_at
  );
end;
$$;

revoke execute on function public.watch_arena_room(text) from public, anon;
grant execute on function public.watch_arena_room(text) to authenticated;

comment on function public.watch_arena_room(text) is
  'Spectator entry into an explicit room. Debaters stay assigned. No capacity use.';

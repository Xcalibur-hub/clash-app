-- ============================================================================
-- CLASH 2.0 · Phase 13.2 — Spectator → debater upgrade
-- ----------------------------------------------------------------------------
-- A spectator may change their mind and join the debate in the SAME room.
-- One row stays UNIQUE(topic_id, profile_id). Debaters never downgrade.
-- Capacity is authoritative: spectators do not count; upgrade increments once.
-- ============================================================================

/**
 * Promote the caller's spectator membership in `p_room_id` to a debater with
 * a private initial stance. Never creates a second participant row.
 *
 * Returns jsonb:
 *   upgraded (bool), roomId, topicId, stance, role, status, capacity,
 *   participantCount, joinedAt
 *
 * Errors:
 *   42501 — not signed in / not a member of this room
 *   P0002 — room missing
 *   P0003 — stance missing / room not accepting upgrades / already debater
 *           with mismatched role path
 *   P0006 — already a debater (idempotent reject for a second upgrade attempt
 *           that looks like a double-tap with a different stance — same stance
 *           returns upgraded=false success)
 *   P0009 — room full (participant_count >= capacity)
 */
create or replace function public.upgrade_arena_spectator(
  p_room_id text,
  p_stance  public.take_stance
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_part public.arena_room_participants%rowtype;
  v_room public.arena_rooms%rowtype;
  v_topic public.arena_daily_topics%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to join the debate' using errcode = '42501';
  end if;
  if p_stance is null then
    raise exception 'pick a stance to join the debate' using errcode = 'P0003';
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

  if v_topic.status <> 'live' or now() >= v_topic.closes_at then
    raise exception 'topic is closed' using errcode = 'P0003';
  end if;

  -- Upgrades are allowed while the room is still in play. SETTLED/CANCELLED
  -- cannot gain new debaters.
  if v_room.status not in ('OPEN', 'FINAL_ARGUMENTS', 'JUDGING') then
    raise exception 'this room is no longer accepting debaters' using errcode = 'P0003';
  end if;

  select * into v_part
    from public.arena_room_participants
   where room_id = p_room_id
     and profile_id = v_user
     for update;
  if not found then
    raise exception 'join the room first' using errcode = '42501';
  end if;

  -- Already a debater: never downgrade, never overwrite stance.
  if v_part.role = 'debater' then
    if v_part.initial_stance is not null and v_part.initial_stance = p_stance then
      return jsonb_build_object(
        'upgraded', false,
        'roomId', v_room.id,
        'topicId', v_room.topic_id,
        'stance', v_part.initial_stance,
        'role', v_part.role,
        'status', v_room.status,
        'capacity', v_room.capacity,
        'participantCount', v_room.participant_count,
        'joinedAt', v_part.joined_at
      );
    end if;
    raise exception 'already a debater' using errcode = 'P0006';
  end if;

  if v_part.role <> 'spectator' then
    raise exception 'only spectators can upgrade' using errcode = 'P0003';
  end if;

  -- Capacity: spectators do not consume a slot; upgrading does, exactly once.
  if v_room.participant_count >= v_room.capacity then
    raise exception 'room is full' using errcode = 'P0009';
  end if;

  perform public.assert_rate_limit(v_user, 'arena_spectator_upgrade', 10, interval '1 hour');

  update public.arena_room_participants
     set role = 'debater',
         initial_stance = p_stance
   where room_id = p_room_id
     and profile_id = v_user
  returning * into v_part;

  update public.arena_rooms
     set participant_count = participant_count + 1
   where id = p_room_id
  returning * into v_room;

  return jsonb_build_object(
    'upgraded', true,
    'roomId', v_room.id,
    'topicId', v_room.topic_id,
    'stance', v_part.initial_stance,
    'role', v_part.role,
    'status', v_room.status,
    'capacity', v_room.capacity,
    'participantCount', v_room.participant_count,
    'joinedAt', v_part.joined_at
  );
end;
$$;

revoke execute on function public.upgrade_arena_spectator(text, public.take_stance)
  from public, anon;
grant execute on function public.upgrade_arena_spectator(text, public.take_stance)
  to authenticated;

-- Hard ban: clients still have no UPDATE on participants. Document the
-- downgrade rule for any future DEFIVER helper that might touch the row.
comment on function public.upgrade_arena_spectator(text, public.take_stance) is
  'Spectator → debater only. Never downgrades. Capacity-checked. Same room.';

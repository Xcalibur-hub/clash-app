-- Phase 13.8 — public room discovery for a live topic.
-- Returns capacity / presence only. Never stance splits (privacy).

create or replace function public.list_arena_topic_rooms(p_topic_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_topic  public.arena_daily_topics%rowtype;
  v_rooms  jsonb := '[]'::jsonb;
begin
  if p_topic_id is null or btrim(p_topic_id) = '' then
    raise exception 'topic id is required' using errcode = 'P0003';
  end if;

  select * into v_topic from public.arena_daily_topics where id = p_topic_id;
  if not found then
    raise exception 'topic does not exist' using errcode = 'P0002';
  end if;

  -- Scheduled topics stay staff-only until they open.
  if v_topic.status = 'scheduled' and not public.is_staff() then
    raise exception 'topic is not available' using errcode = 'P0003';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'roomId', x.id,
        'roomIndex', x.room_index,
        'status', x.status,
        'capacity', x.capacity,
        'participantCount', x.participant_count,
        'opensAt', x.opens_at,
        'closesAt', x.closes_at,
        'isViewerRoom', x.is_viewer_room
      )
      order by x.room_index asc
    ),
    '[]'::jsonb
  )
  into v_rooms
  from (
    select
      r.id,
      r.status,
      r.capacity,
      r.participant_count,
      r.opens_at,
      r.closes_at,
      row_number() over (order by r.created_at asc, r.id asc)::integer as room_index,
      exists (
        select 1
          from public.arena_room_participants p
         where p.room_id = r.id
           and v_viewer is not null
           and p.profile_id = v_viewer
      ) as is_viewer_room
    from public.arena_rooms r
   where r.topic_id = p_topic_id
     and r.status in ('OPEN', 'FINAL_ARGUMENTS', 'JUDGING', 'SETTLED')
  ) x;

  return jsonb_build_object(
    'topicId', v_topic.id,
    'rooms', v_rooms
  );
end;
$$;

revoke execute on function public.list_arena_topic_rooms(text) from public;
grant execute on function public.list_arena_topic_rooms(text) to anon, authenticated;

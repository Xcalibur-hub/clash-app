-- Phase 13.8C — room presence for live-room presentation.
-- Returns handle / name / tint only. Never stance.

create or replace function public.list_arena_room_presence(
  p_room_id text,
  p_limit   integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_limit  integer := greatest(1, least(coalesce(p_limit, 12), 24));
  v_room   public.arena_rooms%rowtype;
begin
  if p_room_id is null or btrim(p_room_id) = '' then
    raise exception 'room id is required' using errcode = 'P0003';
  end if;

  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;

  -- Same membership gate as the transcript — presence is for people in the room.
  if not public.arena_is_room_member(p_room_id) and not public.is_staff() then
    raise exception 'join the room to see who is here' using errcode = '42501';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        public.arena_profile_json(part.profile_id)
          || jsonb_build_object(
            'isViewer', v_viewer is not null and part.profile_id = v_viewer
          )
        order by
          case when v_viewer is not null and part.profile_id = v_viewer then 0 else 1 end,
          part.joined_at asc
      )
      from (
        select part.profile_id, part.joined_at
          from public.arena_room_participants part
         where part.room_id = p_room_id
         order by part.joined_at asc
         limit v_limit
      ) part
    ),
    '[]'::jsonb
  );
end;
$$;

revoke execute on function public.list_arena_room_presence(text, integer) from public, anon;
grant execute on function public.list_arena_room_presence(text, integer) to authenticated;

comment on function public.list_arena_room_presence(text, integer) is
  'Member presence for a room. No stance fields. Membership required.';

-- Typing identities come from authenticated server writes, never client Presence
-- metadata. Private broadcast carries only an invalidation hint.
create table public.arena_room_typing (
  room_id text not null references public.arena_rooms(id) on delete cascade,
  author_id text not null references public.profiles(id) on delete cascade,
  reply_message_id text references public.arena_room_messages(id) on delete cascade,
  expires_at timestamptz not null,
  primary key(room_id,author_id)
);
alter table public.arena_room_typing enable row level security;
revoke all on public.arena_room_typing from public,anon,authenticated,service_role;

create function public.set_arena_room_typing(p_room_id text,p_typing boolean,p_reply_message_id text default null)
returns void language plpgsql security definer set search_path='' as $$
declare me text:=public.my_profile_id();
begin
  if me is null or not public.arena_is_room_member(p_room_id) or not public.arena_room_readable(p_room_id) then
    raise exception 'room unavailable' using errcode='42501';
  end if;
  if not exists(select 1 from public.arena_room_participants where room_id=p_room_id and profile_id=me and role='debater') then
    raise exception 'fighter typing only' using errcode='42501';
  end if;
  if p_typing is null then raise exception 'typing state required' using errcode='22023'; end if;
  perform public.assert_rate_limit(me,'arena_typing',60,interval '1 minute');
  if p_typing and not exists(select 1 from public.arena_rooms r join public.arena_daily_topics t on t.id=r.topic_id
    where r.id=p_room_id and r.status in ('OPEN','FINAL_ARGUMENTS') and now()>=t.opens_at and now()<t.judging_at) then
    raise exception 'argument stage closed' using errcode='42501';
  end if;
  if p_typing and p_reply_message_id is not null and not exists(select 1 from public.arena_room_messages m
    where m.id=p_reply_message_id and m.room_id=p_room_id and m.hidden_at is null
      and not public.arena_actor_hidden_internal(me,m.author_id)) then
    raise exception 'reply unavailable' using errcode='42501';
  end if;
  insert into public.arena_room_typing(room_id,author_id,reply_message_id,expires_at)
    values(p_room_id,me,case when p_typing then p_reply_message_id else null end,
      clock_timestamp()+case when p_typing then interval '6 seconds' else interval '0 seconds' end)
    on conflict(room_id,author_id) do update set reply_message_id=excluded.reply_message_id,expires_at=excluded.expires_at;
  perform realtime.send('{}'::jsonb,'typing', 'arena-typing:'||p_room_id,true);
end $$;

create function public.get_arena_room_typing(p_room_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if public.my_profile_id() is null or not public.arena_is_room_member(p_room_id) or not public.arena_room_readable(p_room_id) then
    raise exception 'room unavailable' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('userId',p.id,'handle',p.handle,'name',p.name,
    'avatarTint',p.avatar_tint,'replyingToMessageId',case when m.hidden_at is null and m.room_id=p_room_id
      and not public.arena_actor_hidden_internal(public.my_profile_id(),m.author_id) then m.id else null end,'typing',true)),'[]'::jsonb)
    into result from public.arena_room_typing s join public.profiles p on p.id=s.author_id
    left join public.arena_room_messages m on m.id=s.reply_message_id
    where s.room_id=p_room_id and s.expires_at>clock_timestamp()
      and not public.arena_actor_hidden_internal(public.my_profile_id(),s.author_id);
  return result;
end $$;
revoke all on function public.set_arena_room_typing(text,boolean,text),public.get_arena_room_typing(text)
  from public,anon,authenticated,service_role;
grant execute on function public.set_arena_room_typing(text,boolean,text),public.get_arena_room_typing(text) to authenticated;

create policy "members receive server typing hints" on realtime.messages
  for select to authenticated using (
    extension='broadcast' and left(realtime.topic(),13)='arena-typing:'
    and public.arena_is_room_member(substr(realtime.topic(),14))
    and public.arena_room_readable(substr(realtime.topic(),14)));
-- No client INSERT policy: clients cannot broadcast or publish Presence metadata
-- into this private topic. No Presence SELECT policy exposes membership metadata.
notify pgrst,'reload schema';

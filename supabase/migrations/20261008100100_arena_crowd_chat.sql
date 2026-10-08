-- Public audience conversation within an entered canonical duel. This table is
-- deliberately independent of fighter arguments, ballots, backing and Corners.
create table public.arena_crowd_messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.arena_rooms(id) on delete cascade,
  author_id text not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500
    and octet_length(body) <= 2000 and body ~ ('[^[:space:]'||chr(160)||chr(8203)||chr(8204)||chr(8205)||chr(65279)||']')),
  request_key uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  hidden_at timestamptz,
  unique(room_id, author_id, request_key)
);
create index arena_crowd_page on public.arena_crowd_messages(room_id,created_at desc,id desc)
  where hidden_at is null;
create index arena_crowd_author on public.arena_crowd_messages(author_id);
alter table public.arena_crowd_messages enable row level security;
revoke all on public.arena_crowd_messages from public,anon,authenticated,service_role;
grant select(id,room_id,author_id,body,created_at,hidden_at) on public.arena_crowd_messages to authenticated;
grant select on public.arena_crowd_messages to service_role;

create function public.arena_crowd_access(p_room_id text) returns boolean
language sql stable security definer set search_path='' as $$
  select public.my_profile_id() is not null and exists (
    select 1 from public.arena_rooms r join public.clashes c on c.id=r.clash_id
    join public.takes t on t.id=c.take_id
    where r.id=p_room_id and c.duel_key is not null and t.status<>'removed'
    and r.status<>'CANCELLED' and c.status<>'cancelled'
    and public.arena_is_room_member(r.id)
    and not public.arena_actor_hidden(public.my_profile_id(),t.author_id)
    and not public.arena_actor_hidden(public.my_profile_id(),c.challenger_id)
  )
$$;
revoke execute on function public.arena_crowd_access(text) from public,anon;
grant execute on function public.arena_crowd_access(text) to authenticated;
create policy crowd_member_read on public.arena_crowd_messages for select to authenticated using (
  hidden_at is null and public.arena_crowd_access(room_id)
  and not public.arena_actor_hidden(public.my_profile_id(),author_id)
);

create function public.arena_crowd_payload(p public.arena_crowd_messages) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',p.id,'roomId',p.room_id,'body',p.body,
    'createdAt',p.created_at,'author',public.arena_profile_json(p.author_id),
    'isOwn',p.author_id=public.my_profile_id())
$$;
revoke execute on function public.arena_crowd_payload(public.arena_crowd_messages) from public,anon,authenticated;

create function public.get_arena_crowd(p_room_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.arena_rooms%rowtype; c public.clashes%rowtype; a text;
begin
  if not public.arena_crowd_access(p_room_id) then
    raise exception 'Crowd is unavailable' using errcode='42501';
  end if;
  select * into r from public.arena_rooms where id=p_room_id;
  select * into c from public.clashes where id=r.clash_id;
  select author_id into a from public.takes where id=c.take_id;
  return jsonb_build_object('roomId',r.id,'canSend',c.status='open'
    and r.status in ('OPEN','FINAL_ARGUMENTS','JUDGING')
    and clock_timestamp()>=c.opens_at and clock_timestamp()<c.closes_at
    and not public.arena_actor_hidden(a,public.my_profile_id())
    and not public.arena_actor_hidden(c.challenger_id,public.my_profile_id()),
    'serverNow',clock_timestamp(),'closesAt',c.closes_at,
    'spectatorCount',(select count(*) from public.arena_room_participants where room_id=r.id and role='spectator'));
end $$;

create function public.post_arena_crowd_message(p_room_id text,p_body text,p_request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me text:=public.my_profile_id(); cid text; c public.clashes%rowtype;
  m public.arena_crowd_messages%rowtype; body text:=btrim(p_body,E' \t\n\r'||chr(160)); ctx jsonb;
begin
  if me is null then raise exception 'Sign in to join the Crowd' using errcode='42501'; end if;
  if p_request_key is null or body is null or char_length(body) not between 1 and 500
    or octet_length(body)>2000 or body !~ ('[^[:space:]'||chr(160)||chr(8203)||chr(8204)||chr(8205)||chr(65279)||']') then
    raise exception 'Enter a message of 1 to 500 characters' using errcode='22023';
  end if;
  select clash_id into cid from public.arena_rooms where id=p_room_id;
  select * into c from public.clashes where id=cid for share;
  if c.id is null or c.duel_key is null or not public.arena_crowd_access(p_room_id) then
    raise exception 'Crowd is unavailable' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crowd:'||p_room_id||':'||me,0));
  select * into m from public.arena_crowd_messages
    where room_id=p_room_id and author_id=me and request_key=p_request_key;
  if found then
    if m.body<>body then raise exception 'Request already submitted' using errcode='P0006'; end if;
    if m.hidden_at is not null then raise exception 'Message is unavailable' using errcode='42501'; end if;
    return public.arena_crowd_payload(m);
  end if;
  ctx:=public.get_arena_crowd(p_room_id);
  if not (ctx->>'canSend')::boolean then raise exception 'Crowd chat is closed' using errcode='P0003'; end if;
  perform public.assert_rate_limit(me,'arena_crowd_burst',5,interval '1 minute');
  perform public.assert_rate_limit(me,'arena_crowd_message',30,interval '10 minutes');
  -- Recheck after every possible lock wait: client clocks never admit a send.
  ctx:=public.get_arena_crowd(p_room_id);
  if not (ctx->>'canSend')::boolean then raise exception 'Crowd chat is closed' using errcode='P0003'; end if;
  insert into public.arena_crowd_messages(room_id,author_id,body,request_key)
    values(p_room_id,me,body,p_request_key) returning * into m;
  return public.arena_crowd_payload(m);
end $$;

create function public.list_arena_crowd_messages(p_room_id text,
  p_cursor_at timestamptz default null,p_cursor_id uuid default null,
  p_direction text default 'older',p_limit integer default 40) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.arena_crowd_access(p_room_id) then raise exception 'Crowd is unavailable' using errcode='42501'; end if;
  if p_direction is null or p_direction not in ('older','newer') or p_limit is null or p_limit not between 1 and 100
    or (p_cursor_at is null)<>(p_cursor_id is null) then raise exception 'Invalid Crowd page' using errcode='22023'; end if;
  select coalesce(jsonb_agg(public.arena_crowd_payload(x) order by x.created_at,x.id),'[]'::jsonb) into result from (
    select m.* from public.arena_crowd_messages m where m.room_id=p_room_id and m.hidden_at is null
    and not public.arena_actor_hidden(public.my_profile_id(),m.author_id)
    and (p_cursor_at is null or (p_direction='older' and (m.created_at,m.id)<(p_cursor_at,p_cursor_id))
      or (p_direction='newer' and (m.created_at,m.id)>(p_cursor_at,p_cursor_id)))
    order by case when p_direction='older' then m.created_at end desc,
      case when p_direction='older' then m.id end desc,
      case when p_direction='newer' then m.created_at end,
      case when p_direction='newer' then m.id end limit p_limit
  ) x;
  return result;
end $$;

-- Also a bounded hydration/visibility probe. Never delivers event payloads directly.
create function public.get_arena_crowd_messages(p_room_id text,p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not public.arena_crowd_access(p_room_id) then raise exception 'Crowd is unavailable' using errcode='42501'; end if;
  if coalesce(cardinality(p_ids),0)>100 then raise exception 'Too many messages' using errcode='22023'; end if;
  return (select coalesce(jsonb_agg(public.arena_crowd_payload(m) order by m.created_at,m.id),'[]'::jsonb)
    from public.arena_crowd_messages m where m.room_id=p_room_id and m.id=any(p_ids)
    and m.hidden_at is null and not public.arena_actor_hidden(public.my_profile_id(),m.author_id));
end $$;

-- Private targets cannot be probed through the shared reporting RPC.
alter function public.submit_report(public.report_target,text,public.report_reason,text) rename to submit_report_before_crowd;
revoke execute on function public.submit_report_before_crowd(public.report_target,text,public.report_reason,text)
  from public,anon,authenticated,service_role;
create function public.submit_report(p_target_kind public.report_target,p_target_id text,
  p_reason public.report_reason,p_detail text default null) returns text
language plpgsql security definer set search_path='' as $$
begin
  if p_target_kind='arena_crowd_message' then
    if not exists(select 1 from public.arena_crowd_messages m where m.id::text=p_target_id
      and m.hidden_at is null and public.arena_crowd_access(m.room_id)
      and not public.arena_actor_hidden(public.my_profile_id(),m.author_id)) then
      raise exception 'Message is unavailable' using errcode='42501';
    end if;
    perform public.assert_rate_limit(public.my_profile_id(),'arena_crowd_report',20,interval '1 hour');
  end if;
  return public.submit_report_before_crowd(p_target_kind,p_target_id,p_reason,p_detail);
end $$;

create function public.moderate_arena_crowd_message(p_message_id uuid,p_hidden boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare m public.arena_crowd_messages%rowtype; h public.hood_id;
begin
  select * into m from public.arena_crowd_messages where id=p_message_id for update;
  select t.hood into h from public.arena_rooms r join public.clashes c on c.id=r.clash_id
    join public.takes t on t.id=c.take_id where r.id=m.room_id;
  if m.id is null or not public.is_hood_moderator(h) then raise exception 'Moderation unavailable' using errcode='42501'; end if;
  if p_hidden is null or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'Moderation reason required' using errcode='22023'; end if;
  update public.arena_crowd_messages set hidden_at=case when p_hidden then clock_timestamp() else null end where id=m.id;
  insert into public.moderation_actions(id,moderator_id,target_kind,target_id,action,reason)
    values(public.new_arena_id('mod_'),public.my_profile_id(),'arena_crowd_message',m.id::text,
      case when p_hidden then 'remove_content'::public.moderation_action else 'restore_content'::public.moderation_action end,p_reason);
end $$;

revoke execute on function public.get_arena_crowd(text),public.post_arena_crowd_message(text,text,uuid),
  public.list_arena_crowd_messages(text,timestamptz,uuid,text,integer),public.get_arena_crowd_messages(text,uuid[]),
  public.submit_report(public.report_target,text,public.report_reason,text),
  public.moderate_arena_crowd_message(uuid,boolean,text) from public,anon;
grant execute on function public.get_arena_crowd(text),public.post_arena_crowd_message(text,text,uuid),
  public.list_arena_crowd_messages(text,timestamptz,uuid,text,integer),public.get_arena_crowd_messages(text,uuid[]),
  public.submit_report(public.report_target,text,public.report_reason,text),
  public.moderate_arena_crowd_message(uuid,boolean,text) to authenticated;
alter publication supabase_realtime add table public.arena_crowd_messages;

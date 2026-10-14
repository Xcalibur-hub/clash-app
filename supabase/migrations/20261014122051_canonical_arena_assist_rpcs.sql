-- Private inbox, not a second transcript or competition engine.
create table public.arena_private_assists (
 id uuid primary key,
 room_id text not null references public.arena_rooms(id) on delete cascade,
 sender_id text not null references public.profiles(id) on delete cascade,
 fighter_id text not null references public.profiles(id) on delete cascade,
 body text not null check (char_length(body) <= 500),
 media_object_id text references public.media_objects(id) on delete cascade,
 status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','REJECTED')),
 created_at timestamptz not null default clock_timestamp(),
 hidden_at timestamptz,
 published_message_id text references public.arena_room_messages(id) on delete set null,
 published_media_id text references public.media_objects(id) on delete set null,
 check (sender_id <> fighter_id),
 check (btrim(body) <> '' or media_object_id is not null)
);
create index arena_private_assists_inbox on public.arena_private_assists(room_id,fighter_id,created_at desc,id desc);
alter table public.arena_private_assists enable row level security;
revoke all on public.arena_private_assists from public,anon,authenticated,service_role;
grant select on public.arena_private_assists to authenticated;

-- Caller bound. Definer ownership prevents recursive RLS lookup; no arbitrary
-- actor parameter or raw relationship result is exposed.
create function public.arena_private_assist_readable(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.arena_private_assists a
 join public.arena_rooms r on r.id=a.room_id join public.clashes c on c.id=r.clash_id
 where a.id=p_id and a.fighter_id=public.my_profile_id() and a.hidden_at is null
 and c.status<>'cancelled' and public.arena_is_room_debater(r.id)
 and public.arena_room_readable(r.id) and public.arena_take_readable(c.take_id)
 and not public.arena_actor_hidden_internal(a.fighter_id,a.sender_id)
 and not public.arena_actor_hidden_internal(a.sender_id,a.fighter_id)
 and (a.media_object_id is null or exists(select 1 from public.media_objects m
   where m.id=a.media_object_id and m.status='ready' and m.visibility='private')));
$$;
revoke all on function public.arena_private_assist_readable(uuid) from public,anon,service_role;
grant execute on function public.arena_private_assist_readable(uuid) to authenticated;
create policy "selected fighter private assist inbox" on public.arena_private_assists
 for select to authenticated using (public.arena_private_assist_readable(id));

-- Entitlement target for the server-only signer. No managed Storage DDL or
-- arbitrary path/actor input. Ordinary clients still cannot sign others' assets.
create function public.arena_private_assist_media_target(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target jsonb; me text:=public.my_profile_id();
begin
 if me is null then return null; end if;
 select jsonb_build_object('bucket',m.bucket,'path',m.storage_path,'mediaKind',m.media_kind)
 into target from public.arena_private_assists a join public.media_objects m on m.id=a.media_object_id
 where a.id=p_id and a.status<>'REJECTED' and public.arena_private_assist_readable(a.id)
 and m.bucket='private-media' and m.owner_id=a.sender_id
 and m.media_kind in ('image','video');
 if target is null then return null; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('assist-sign-rate:'||me,0));
 perform public.assert_rate_limit(me,'private_assist_media',60,interval '1 minute');
 return target;
end
$$;
revoke all on function public.arena_private_assist_media_target(uuid) from public,anon,service_role;
grant execute on function public.arena_private_assist_media_target(uuid) to authenticated;

-- Internal canonical write gate: Clash -> source -> Room; same serialization
-- and source/safety assertions as official contributions. Closed history is read-only.
create function public.assert_private_assist_window(p_room text) returns void
language plpgsql security definer set search_path='' as $$
declare cid text; judge_at timestamptz;
begin
 select clash_id into cid from public.arena_rooms where id=p_room;
 if cid is null then raise exception 'Canonical Room unavailable' using errcode='42501'; end if;
 perform public.assert_canonical_clash_access(cid,true);
 perform 1 from public.arena_rooms where id=p_room for update;
 select t.judging_at into judge_at from public.arena_rooms r join public.arena_daily_topics t on t.id=r.topic_id where r.id=p_room;
 if not public.arena_is_room_member(p_room) or not exists(select 1 from public.clashes
   where id=cid and status='open' and opens_at<=clock_timestamp() and closes_at>clock_timestamp())
   or clock_timestamp()>=judge_at then
  raise exception 'Assist window unavailable' using errcode='42501';
 end if;
end $$;
revoke all on function public.assert_private_assist_window(text) from public,anon,authenticated,service_role;

create function public.send_arena_private_assist(p_room_id text,p_side text,p_body text,p_media_id text,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me text:=public.my_profile_id(); fighter text; prior public.arena_private_assists%rowtype;
begin
 if me is null or p_request_key is null or p_side is null or p_side not in ('A','B')
 or p_body is null or char_length(p_body)>500 or (btrim(p_body)='' and p_media_id is null) then
  raise exception 'Invalid assist request' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('private-assist:'||p_request_key,0));
 perform public.assert_private_assist_window(p_room_id);
 if public.arena_is_room_debater(p_room_id) then raise exception 'Spectator required' using errcode='42501'; end if;
 select case when p_side='A' then t.author_id else c.challenger_id end into fighter
 from public.arena_rooms r join public.clashes c on c.id=r.clash_id join public.takes t on t.id=c.take_id where r.id=p_room_id;
 if public.arena_actor_hidden_internal(me,fighter) or public.arena_actor_hidden_internal(fighter,me) then
  raise exception 'Assist unavailable' using errcode='42501'; end if;
 if p_media_id is not null and not exists(select 1 from public.media_objects where id=p_media_id
   and owner_id=me and status='ready' and visibility='private' and media_kind in ('image','video')) then
  raise exception 'Private owned ready media required' using errcode='42501'; end if;
 select * into prior from public.arena_private_assists where id=p_request_key;
 if found then
  if prior.sender_id<>me then raise exception 'Assist unavailable' using errcode='42501'; end if;
  if prior.room_id<>p_room_id or prior.fighter_id<>fighter or prior.body<>p_body or prior.media_object_id is distinct from p_media_id then
   raise exception 'Request payload changed' using errcode='P0006'; end if;
  return jsonb_build_object('id',prior.id,'status',prior.status);
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('assist-rate:'||me,0));
 perform public.assert_private_assist_window(p_room_id);
 perform public.assert_rate_limit(me,'private_assist',5,interval '1 minute');
 insert into public.arena_private_assists(id,room_id,sender_id,fighter_id,body,media_object_id)
 values(p_request_key,p_room_id,me,fighter,p_body,p_media_id);
 return jsonb_build_object('id',p_request_key,'status','PENDING');
end $$;

create function public.list_arena_private_assists(p_room_id text,p_before_at timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if public.my_profile_id() is null or not public.arena_is_room_debater(p_room_id) or not public.arena_room_readable(p_room_id) then
  raise exception 'Private inbox unavailable' using errcode='42501'; end if;
 if (p_before_at is null)<>(p_before_id is null) then raise exception 'Invalid cursor' using errcode='22023'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'body',a.body,'status',a.status,
  'createdAt',a.created_at,'mediaId',a.media_object_id,'mediaKind',m.media_kind,'mediaPath',m.storage_path,
  'publishedMessageId',a.published_message_id) order by a.created_at desc,a.id desc),'[]'::jsonb)
 from (select * from public.arena_private_assists a where a.room_id=p_room_id
   and public.arena_private_assist_readable(a.id)
   and (p_before_at is null or (a.created_at,a.id)<(p_before_at,p_before_id))
   order by a.created_at desc,a.id desc limit 30) a left join public.media_objects m on m.id=a.media_object_id);
end $$;

create function public.respond_arena_private_assist(p_id uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare r text; a public.arena_private_assists%rowtype;
begin
 select room_id into r from public.arena_private_assists where id=p_id;
 perform public.assert_private_assist_window(r);
 if not public.arena_private_assist_readable(p_id) or p_action is null or p_action not in ('ACCEPTED','REJECTED') then
  raise exception 'Assist unavailable' using errcode='42501'; end if;
 select * into a from public.arena_private_assists where id=p_id for update;
 if a.status=p_action then return; end if;
 if a.status<>'PENDING' then raise exception 'Assist already resolved' using errcode='P0006'; end if;
 update public.arena_private_assists set status=p_action where id=p_id;
end $$;

-- The fighter explicitly publishes a copy. Any attachment must be a fresh
-- fighter-owned PUBLIC upload; the spectator's private original stays private.
create function public.incorporate_arena_private_assist(p_id uuid,p_request_key uuid,p_public_media_id text default null,p_public_media_url text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r text; a public.arena_private_assists%rowtype; result jsonb;
begin
 if p_request_key is null then raise exception 'Request key required' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('official:'||p_request_key,0));
 select room_id into r from public.arena_private_assists where id=p_id;
 perform public.assert_private_assist_window(r);
 if not public.arena_private_assist_readable(p_id) then raise exception 'Assist unavailable' using errcode='42501'; end if;
 select * into a from public.arena_private_assists where id=p_id for update;
 if a.status<>'ACCEPTED' then raise exception 'Accepted assist required' using errcode='42501'; end if;
 if a.published_message_id is not null then
  if a.published_media_id is distinct from p_public_media_id then raise exception 'Published payload changed' using errcode='P0006'; end if;
  return public.get_arena_room_message(a.published_message_id);
 end if;
 if (a.media_object_id is null)<>(p_public_media_id is null) or (p_public_media_id is null)<>(p_public_media_url is null) then
  raise exception 'Explicit media copy required' using errcode='22023'; end if;
 result:=public.submit_arena_official(r,'message',jsonb_build_object('body',a.body,'parentId',null,
  'mediaObjectId',p_public_media_id,'mediaUrl',p_public_media_url,'gifProvider',null,'gifExternalId',null),p_request_key);
 update public.arena_private_assists set published_message_id=result->>'id',published_media_id=p_public_media_id where id=p_id;
 return result;
end $$;

create function public.report_arena_private_assist(p_id uuid,p_reason public.report_reason) returns text
language plpgsql security definer set search_path='' as $$
declare result text;
begin
 if not public.arena_private_assist_readable(p_id) then raise exception 'Assist unavailable' using errcode='42501'; end if;
 result:=public.submit_report('arena_private_assist',p_id::text,p_reason,null);
 update public.arena_private_assists set hidden_at=clock_timestamp() where id=p_id;
 return result;
end $$;
create function public.review_reported_arena_assist(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_staff() or not exists(select 1 from public.reports where target_kind='arena_private_assist' and target_id=p_id::text) then
  raise exception 'Authorized reported-content review required' using errcode='42501'; end if;
 return (select jsonb_build_object('id',id,'body',body,'mediaId',media_object_id,'hiddenAt',hidden_at) from public.arena_private_assists where id=p_id);
end $$;

revoke all on function public.send_arena_private_assist(text,text,text,text,uuid),
 public.list_arena_private_assists(text,timestamptz,uuid), public.respond_arena_private_assist(uuid,text),
 public.incorporate_arena_private_assist(uuid,uuid,text,text), public.report_arena_private_assist(uuid,public.report_reason),
 public.review_reported_arena_assist(uuid) from public,anon,service_role;
grant execute on function public.send_arena_private_assist(text,text,text,text,uuid),
 public.list_arena_private_assists(text,timestamptz,uuid), public.respond_arena_private_assist(uuid,text),
 public.incorporate_arena_private_assist(uuid,uuid,text,text), public.report_arena_private_assist(uuid,public.report_reason),
 public.review_reported_arena_assist(uuid) to authenticated;

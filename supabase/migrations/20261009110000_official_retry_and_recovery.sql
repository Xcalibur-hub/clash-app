-- Internal receipts refer to existing official rows; they are not a transcript.
create table public.arena_official_requests (
 request_key uuid primary key,
 room_id text not null references public.arena_rooms(id) on delete cascade,
 author_id text not null references public.profiles(id) on delete cascade,
 operation text not null check(operation in ('message','evidence','reshare')),
 payload jsonb not null,
 message_id text references public.arena_room_messages(id) on delete cascade,
 evidence_id text references public.arena_room_evidence(id) on delete cascade,
 check ((message_id is null) <> (evidence_id is null))
);
alter table public.arena_official_requests enable row level security;
revoke all on public.arena_official_requests from public,anon,authenticated,service_role;

-- Stamp canonical fighter contributions after the Clash serialization wait,
-- rather than using a transaction-start time from before a long disconnect/lock.
-- Competition opening/judging/closing clocks and existing rows are unchanged.
do $stamp$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.guard_arena_duel_content()'::regprocedure);
 patched:=replace(definition,E'  return new;\nend;',
   E'  if tg_op=''INSERT'' then new.created_at:=clock_timestamp(); end if;\n  return new;\nend;');
 if patched=definition then raise exception 'canonical content timestamp anchor changed'; end if;
 execute patched;
end $stamp$;

create function public.submit_arena_official(p_room_id text,p_operation text,p_payload jsonb,p_request_key uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me text:=public.my_profile_id(); cid text; receipt public.arena_official_requests%rowtype;
 m public.arena_room_messages%rowtype; e public.arena_room_evidence%rowtype; result jsonb;
begin
 if me is null then raise exception 'Sign in to submit' using errcode='42501'; end if;
 if p_operation is null or p_operation not in ('message','evidence','reshare')
   or p_payload is null or jsonb_typeof(p_payload)<>'object'
   or exists(select 1 from jsonb_object_keys(p_payload) k where k not in
    ('body','parentId','mediaObjectId','mediaUrl','gifProvider','gifExternalId','sourceMessageId','kind','title','sourceUrl')) then
   raise exception 'Invalid official request' using errcode='22023';
 end if;
 select clash_id into cid from public.arena_rooms where id=p_room_id;
 if cid is null then raise exception 'Canonical Room required' using errcode='42501'; end if;
 -- Key first, then Clash/Take, matching every other call to this endpoint.
 if p_request_key is not null then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('official:'||p_request_key::text,0));
 end if;
 perform public.assert_canonical_clash_access(cid,true);
 if not public.arena_is_room_member(p_room_id) or not public.arena_is_room_debater(p_room_id)
   or not exists(select 1 from public.clashes c join public.takes t on t.id=c.take_id
     where c.id=cid and me in(t.author_id,c.challenger_id) and c.status<>'cancelled') then
   raise exception 'Official submission unavailable' using errcode='42501';
 end if;
 select * into receipt from public.arena_official_requests where request_key=p_request_key;
 if found then
   if receipt.author_id<>me then raise exception 'Official submission unavailable' using errcode='42501'; end if;
   if receipt.room_id<>p_room_id or receipt.operation<>p_operation or receipt.payload<>p_payload then
     raise exception 'Request already submitted with a different payload' using errcode='P0006';
   end if;
   if receipt.message_id is not null then
     result:=public.get_arena_room_message(receipt.message_id);
   else
     select * into e from public.arena_room_evidence where id=receipt.evidence_id and hidden_at is null;
     if found then result:=public.arena_evidence_payload(e,me); end if;
   end if;
   if result is null then raise exception 'Contribution unavailable' using errcode='42501'; end if;
   return result; -- no insert, quota, or side effect; readable historical acknowledgement
 end if;
 if p_operation='message' then
   select * into m from public.post_arena_room_message(p_room_id,p_payload->>'body',p_payload->>'parentId',
     p_payload->>'mediaObjectId',p_payload->>'mediaUrl',p_payload->>'gifProvider',p_payload->>'gifExternalId');
 elsif p_operation='reshare' then
   select * into m from public.post_arena_clash_media_reshare(p_room_id,p_payload->>'sourceMessageId',
     p_payload->>'parentId',coalesce(p_payload->>'body',''));
 else
   result:=public.submit_arena_evidence(p_room_id,(p_payload->>'kind')::public.arena_evidence_kind,
     p_payload->>'title',p_payload->>'sourceUrl',p_payload->>'mediaObjectId',p_payload->>'mediaUrl');
   select * into e from public.arena_room_evidence where id=result->>'id';
 end if;
 if p_request_key is not null then
   insert into public.arena_official_requests values(p_request_key,p_room_id,me,p_operation,p_payload,m.id,e.id);
 end if;
 if p_operation<>'evidence' then result:=public.get_arena_room_message(m.id); end if;
 return result;
end $$;
revoke all on function public.submit_arena_official(text,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.submit_arena_official(text,text,jsonb,uuid) to authenticated;

-- Precise keyset pages; old RPC signatures and legacy ranked evidence stay intact.
create function public.list_arena_official_page(p_room_id text,p_stream text default 'message',
 p_cursor_at timestamptz default null,p_cursor_id text default null,
 p_direction text default 'older',p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; reveal boolean;
begin
 if public.my_profile_id() is null or not public.arena_is_room_member(p_room_id)
   or not public.arena_room_readable(p_room_id) then
   raise exception 'Room unavailable' using errcode='42501'; end if;
 if p_stream is null or p_stream not in ('message','evidence') or p_direction is null
   or p_direction not in ('older','newer') or p_limit is null or p_limit not between 1 and 100
   or (p_cursor_at is null)<>(p_cursor_id is null) then
   raise exception 'Invalid page' using errcode='22023'; end if;
 select status='SETTLED' into reveal from public.arena_rooms where id=p_room_id;
 if p_stream='message' then
   select coalesce(jsonb_agg(public.arena_message_payload(m,public.my_profile_id(),reveal)
     order by case when p_direction='newer' then m.created_at end asc,
       case when p_direction='older' then m.created_at end desc,
       case when p_direction='newer' then m.id end asc,case when p_direction='older' then m.id end desc),'[]'::jsonb)
   into result from (select m.* from public.arena_room_messages m where m.room_id=p_room_id
     and m.hidden_at is null and not public.arena_actor_hidden_internal(public.my_profile_id(),m.author_id)
     and (p_cursor_at is null or (p_direction='older' and (m.created_at,m.id)<(p_cursor_at,p_cursor_id))
       or (p_direction='newer' and (m.created_at,m.id)>(p_cursor_at,p_cursor_id)))
     order by case when p_direction='newer' then m.created_at end asc,
       case when p_direction='older' then m.created_at end desc,
       case when p_direction='newer' then m.id end asc,case when p_direction='older' then m.id end desc
     limit p_limit) m;
 else
   select coalesce(jsonb_agg(public.arena_evidence_payload(e,public.my_profile_id())
     order by case when p_direction='newer' then e.created_at end asc,
       case when p_direction='older' then e.created_at end desc,
       case when p_direction='newer' then e.id end asc,case when p_direction='older' then e.id end desc),'[]'::jsonb)
   into result from (select e.* from public.arena_room_evidence e where e.room_id=p_room_id
     and e.hidden_at is null and not public.arena_actor_hidden_internal(public.my_profile_id(),e.author_id)
     and (p_cursor_at is null or (p_direction='older' and (e.created_at,e.id)<(p_cursor_at,p_cursor_id))
       or (p_direction='newer' and (e.created_at,e.id)>(p_cursor_at,p_cursor_id)))
     order by case when p_direction='newer' then e.created_at end asc,
       case when p_direction='older' then e.created_at end desc,
       case when p_direction='newer' then e.id end asc,case when p_direction='older' then e.id end desc
     limit p_limit) e;
 end if;
 return result;
end $$;
revoke all on function public.list_arena_official_page(text,text,timestamptz,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_arena_official_page(text,text,timestamptz,text,text,integer) to authenticated;
create index arena_evidence_precise_page on public.arena_room_evidence(room_id,created_at desc,id desc);
create function public.get_arena_official_evidence_visibility(p_room_id text,p_ids text[])
returns text[] language plpgsql stable security definer set search_path='' as $$
begin
 if public.my_profile_id() is null or not public.arena_is_room_member(p_room_id)
   or not public.arena_room_readable(p_room_id) then raise exception 'Room unavailable' using errcode='42501'; end if;
 if p_ids is null or cardinality(p_ids)>100 then raise exception 'Invalid visibility batch' using errcode='22023'; end if;
 return array(select e.id from public.arena_room_evidence e where e.room_id=p_room_id and e.id=any(p_ids)
   and e.hidden_at is null and not public.arena_actor_hidden_internal(public.my_profile_id(),e.author_id));
end $$;
revoke all on function public.get_arena_official_evidence_visibility(text,text[]) from public,anon,authenticated,service_role;
grant execute on function public.get_arena_official_evidence_visibility(text,text[]) to authenticated;
notify pgrst,'reload schema';

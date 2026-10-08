-- Account-derived challenge discovery. No client writes or duplicate lifecycle.
create index arena_challenge_incoming_page on public.arena_challenges(challenged_id,created_at desc,id desc);
create index arena_challenge_outgoing_page on public.arena_challenges(challenger_id,created_at desc,id desc);
create policy arena_challenge_fixture_exclusion on public.arena_challenges as restrictive for select to authenticated
 using (exists(select 1 from public.takes t where t.id=take_id and not t.is_runtime_fixture));

-- Patch installed definitions so Phase 0.5's internal relationship helper remains private.
do $patch$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.create_arena_challenge(text,text)'::regprocedure);
 patched:=replace(definition,'if t.status<>''active'' or t.expires_at','if t.is_runtime_fixture or t.status<>''active'' or t.expires_at');
 if patched=definition then raise exception 'unexpected challenge creation definition'; end if;
 execute patched;
 definition:=pg_get_functiondef('public.list_arena_challenges(text,timestamptz,uuid,integer)'::regprocedure);
 patched:=replace(definition,'if not found or t.status<>''active'' or','if not found or t.is_runtime_fixture or t.status<>''active'' or');
 if patched=definition then raise exception 'unexpected challenge listing definition'; end if;
 execute patched;
 definition:=pg_get_functiondef('public.resolve_arena_challenge(uuid,text)'::regprocedure);
 patched:=replace(definition,'  if ch.status<>''PENDING'' then',
 '  if t.is_runtime_fixture or public.arena_actor_hidden_internal(me,ch.challenger_id)
    or public.arena_actor_hidden_internal(ch.challenger_id,me)
    or public.arena_actor_hidden_internal(me,ch.challenged_id)
    or (ch.status<>''PENDING'' and t.status=''removed'') then
    raise exception ''Challenge unavailable'' using errcode=''42501'';
  end if;
  if ch.status<>''PENDING'' then');
 if patched=definition then raise exception 'unexpected challenge resolution definition'; end if;
 execute patched;
end $patch$;

create function public.list_my_arena_challenges(p_direction text,p_before_created_at timestamptz default null,
 p_before_id uuid default null,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path='' as $inbox$
declare me text:=public.my_profile_id(); page jsonb; size integer:=least(greatest(coalesce(p_limit,20),1),50);
begin
 if me is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_direction is null or p_direction not in ('INCOMING','OUTGOING')
   or (p_before_created_at is null)<>(p_before_id is null) then
   raise exception 'invalid inbox page' using errcode='22023'; end if;
 select coalesce(jsonb_agg(payload order by created_at desc,id desc),'[]'::jsonb) into page
 from (select ch.id,ch.created_at,public.arena_challenge_payload(ch)||jsonb_build_object(
   'recipient',jsonb_build_object('id',recipient.id,'name',recipient.name,'handle',recipient.handle),
   'source',jsonb_build_object('id',t.id,'title',t.text,'hood',t.hood)) payload
  from public.arena_challenges ch join public.takes t on t.id=ch.take_id
  join public.profiles recipient on recipient.id=ch.challenged_id
  where ((p_direction='INCOMING' and ch.challenged_id=me) or (p_direction='OUTGOING' and ch.challenger_id=me))
   and t.status='active' and not t.is_runtime_fixture and public.arena_take_readable(t.id)
   and not public.arena_actor_hidden_internal(me,ch.challenger_id)
   and not public.arena_actor_hidden_internal(ch.challenger_id,me)
   and not public.arena_actor_hidden_internal(me,ch.challenged_id)
   and not public.arena_actor_hidden_internal(ch.challenged_id,me)
   and (p_before_created_at is null or (ch.created_at,ch.id)<(p_before_created_at,p_before_id))
  order by ch.created_at desc,ch.id desc limit size+1) page_rows;
 return jsonb_build_object('viewerId',me,'items',(select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) from jsonb_array_elements(page) with ordinality where ordinality<=size),
  'hasMore',jsonb_array_length(page)>size);
end $inbox$;
revoke all on function public.list_my_arena_challenges(text,timestamptz,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_my_arena_challenges(text,timestamptz,uuid,integer) to authenticated;
notify pgrst,'reload schema';

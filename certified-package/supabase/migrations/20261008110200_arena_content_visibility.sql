-- One caller-scoped predicate for direct reads and legacy definer RPCs.
create function public.arena_take_readable(p_take_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.takes t where t.id=p_take_id
    and t.status <> 'removed'
    and not public.arena_actor_hidden_internal(public.my_profile_id(),t.author_id));
$$;
revoke all on function public.arena_take_readable(text) from public,anon,authenticated;
grant execute on function public.arena_take_readable(text) to anon,authenticated;

create policy "removed takes are not public content" on public.takes
  as restrictive for select to anon,authenticated using (status <> 'removed');
create policy "replies require a visible source and author" on public.comments
  as restrictive for select to anon,authenticated using (
    not is_removed and public.arena_take_readable(take_id)
    and not public.arena_actor_hidden(public.my_profile_id(),author_id));

create function public.arena_room_readable(p_room_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.arena_rooms r
    join public.arena_daily_topics topic on topic.id=r.topic_id
    left join public.clashes c on c.id=r.clash_id
    where r.id=p_room_id
      and (topic.status <> 'scheduled' or public.arena_is_room_member(r.id) or public.is_staff())
      and (r.clash_id is null or (
        public.arena_take_readable(c.take_id)
        and not public.arena_actor_hidden_internal(public.my_profile_id(),c.challenger_id))));
$$;
revoke all on function public.arena_room_readable(text) from public,anon,authenticated;
grant execute on function public.arena_room_readable(text) to anon,authenticated;
create policy "room messages require visible content" on public.arena_room_messages
  as restrictive for select to authenticated using (
    hidden_at is null and public.arena_room_readable(room_id));
create policy "room evidence requires visible content" on public.arena_room_evidence
  as restrictive for select to authenticated using (
    hidden_at is null and public.arena_room_readable(room_id));

-- Patch existing definitions rather than copying outdated RPC versions. Exact
-- known anchors make schema drift abort the transaction rather than silently
-- leaving an unprotected legacy path.
do $$
declare v_definition text; v_updated text; r record;
begin
  v_definition:=pg_get_functiondef('public.clash_view_legacy(text)'::regprocedure);
  v_updated:=replace(v_definition,'where c.id = p_clash_id;',
    'where c.id = p_clash_id and public.arena_take_readable(c.take_id) and not public.arena_actor_hidden_internal(public.my_profile_id(),c.challenger_id);');
  if v_updated=v_definition then raise exception 'legacy Clash visibility anchor changed'; end if;
  execute v_updated;
  v_definition:=pg_get_functiondef('public.profile_clash_list(text)'::regprocedure);
  v_updated:=replace(v_definition,
    'where c.challenger_id = p_profile_id or t.author_id = p_profile_id',
    'where (c.challenger_id = p_profile_id or t.author_id = p_profile_id) and public.arena_take_readable(t.id) and not public.arena_actor_hidden_internal(public.my_profile_id(),c.challenger_id)');
  if v_updated=v_definition then raise exception 'profile Clash visibility anchor changed'; end if;
  execute v_updated;
  v_definition:=pg_get_functiondef('public.get_arena_room_message(text)'::regprocedure);
  v_updated:=replace(v_definition,'if not found or v_msg.hidden_at is not null then',
    'if not found or v_msg.hidden_at is not null or not public.arena_room_readable(v_msg.room_id) then');
  if v_updated=v_definition then raise exception 'single message visibility anchor changed'; end if;
  execute v_updated;
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'get_arena_room','list_arena_room_messages','list_arena_room_evidence','get_arena_room_pulse')
  loop
    v_definition:=pg_get_functiondef(r.oid);
    v_updated:=regexp_replace(v_definition,'\mbegin\M',
      E'begin\n  if exists(select 1 from public.arena_rooms where id=p_room_id) and not public.arena_room_readable(p_room_id) then raise exception ''room unavailable'' using errcode=''42501''; end if;', 'i');
    if v_updated=v_definition then raise exception 'Room visibility anchor changed: %',r.oid::regprocedure; end if;
    execute v_updated;
  end loop;
end $$;
notify pgrst,'reload schema';

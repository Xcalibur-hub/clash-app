-- A canonical topic copies its Take text. Hiding the source must also hide that
-- copy in legacy topic, discovery, trending and Explore reads.
create function public.arena_topic_readable(p_topic_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.arena_daily_topics t where t.id=p_topic_id
    and (t.status<>'scheduled' or public.is_staff() or exists(select 1 from public.arena_rooms r
      where r.topic_id=t.id and public.arena_is_room_member(r.id)))
    and not exists(select 1 from public.arena_rooms r where r.topic_id=t.id and r.clash_id is not null
      and not public.arena_room_readable(r.id)));
$$;
revoke all on function public.arena_topic_readable(text) from public,anon,authenticated;
grant execute on function public.arena_topic_readable(text) to anon,authenticated;
create policy "canonical topic copies require visible source" on public.arena_daily_topics
  as restrictive for select to anon,authenticated using(public.arena_topic_readable(id));
create view public.arena_readable_topics with(security_barrier=true) as
  select t.* from public.arena_daily_topics t where public.arena_topic_readable(t.id);
revoke all on public.arena_readable_topics from public,anon,authenticated,service_role;

do $$
declare r record; definition text; updated text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('get_arena_topic',
      'list_arena_topic_rooms','list_arena_trending_battles','list_live_arena_topic_previews','list_live_arena_topics',
      'get_explore_country','get_explore_for_you','get_explore_live','get_explore_world_summary',
      'get_global_viral','get_teleport_candidate','search_explore')
  loop
    definition:=pg_get_functiondef(r.oid);
    updated:=regexp_replace(definition,'\m(from|join)\s+public\.arena_daily_topics\M',
      '\1 public.arena_readable_topics','gi');
    -- A view row is cast explicitly when the original table payload builder is
    -- called, preserving its type and JSON contract.
    updated:=regexp_replace(updated,'public\.arena_topic_payload\((\w+),',
      'public.arena_topic_payload(row(\1.*)::public.arena_daily_topics,','g');
    if updated<>definition then execute updated; end if;
  end loop;
  -- Insert after rewriting discovery reads: this compatibility check must query
  -- the underlying scheduled row, which the filtered view intentionally hides.
  definition:=pg_get_functiondef('public.get_arena_topic(text)'::regprocedure);
  updated:=regexp_replace(definition,'\mbegin\M',
    E'begin\n  if exists(select 1 from public.arena_daily_topics where id=p_topic_id and status=''scheduled'') and not public.is_staff() then raise exception ''topic is not available'' using errcode=''P0003''; end if;','i');
  if updated=definition then raise exception 'topic publication guard anchor changed'; end if;
  execute updated;
end $$;

create or replace function public.arena_message_room(p_message_id text)
returns text language sql stable security definer set search_path='' as $$
  select m.room_id from public.arena_room_messages m where m.id=p_message_id
    and m.hidden_at is null and public.arena_room_readable(m.room_id)
    and (public.arena_is_room_member(m.room_id) or public.is_staff())
    and not public.arena_actor_hidden_internal(public.my_profile_id(),m.author_id);
$$;
create or replace function public.arena_evidence_room(p_evidence_id text)
returns text language sql stable security definer set search_path='' as $$
  select e.room_id from public.arena_room_evidence e where e.id=p_evidence_id
    and e.hidden_at is null and public.arena_room_readable(e.room_id)
    and (public.arena_is_room_member(e.room_id) or public.is_staff())
    and not public.arena_actor_hidden_internal(public.my_profile_id(),e.author_id);
$$;
notify pgrst,'reload schema';

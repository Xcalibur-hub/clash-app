-- Preserve server-to-server visibility checks while removing the public oracle.
do $$
declare v_definition text; r record;
begin
  v_definition := pg_get_functiondef('public.arena_actor_hidden(text,text)'::regprocedure);
  execute replace(v_definition, 'FUNCTION public.arena_actor_hidden(',
    'FUNCTION public.arena_actor_hidden_internal(');
  -- Existing definer RPCs deliberately check both directions, including reverse
  -- fighter mutes. Keep their semantics using the owner-only implementation.
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and p.proname not in ('arena_actor_hidden','arena_actor_hidden_internal')
      and position('public.arena_actor_hidden(' in p.prosrc) > 0
  loop
    execute replace(pg_get_functiondef(r.oid), 'public.arena_actor_hidden(',
      'public.arena_actor_hidden_internal(');
  end loop;
end $$;
revoke all on function public.arena_actor_hidden_internal(text,text)
  from public, anon, authenticated, service_role;

create or replace function public.arena_actor_hidden(p_viewer text, p_author text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_viewer is distinct from public.my_profile_id() then
    raise exception 'visibility checks must use the current viewer' using errcode='42501';
  end if;
  return public.arena_actor_hidden_internal(p_viewer,p_author);
end $$;
revoke all on function public.arena_actor_hidden(text,text) from public, anon, authenticated;
grant execute on function public.arena_actor_hidden(text,text) to anon, authenticated;

-- Membership-scoped lookups are needed by reaction RLS, but may not reveal
-- private message/evidence room IDs to arbitrary callers.
create or replace function public.arena_message_room(p_message_id text)
returns text language sql stable security definer set search_path = '' as $$
  select m.room_id from public.arena_room_messages m
  where m.id=p_message_id and m.hidden_at is null
    and (public.arena_is_room_member(m.room_id) or public.is_staff())
    and not public.arena_actor_hidden_internal(public.my_profile_id(),m.author_id);
$$;
create or replace function public.arena_evidence_room(p_evidence_id text)
returns text language sql stable security definer set search_path = '' as $$
  select e.room_id from public.arena_room_evidence e
  where e.id=p_evidence_id and e.hidden_at is null
    and (public.arena_is_room_member(e.room_id) or public.is_staff())
    and not public.arena_actor_hidden_internal(public.my_profile_id(),e.author_id);
$$;
revoke all on function public.arena_message_room(text), public.arena_evidence_room(text)
  from public, anon, authenticated;
grant execute on function public.arena_message_room(text), public.arena_evidence_room(text)
  to authenticated;

-- Supabase's explicit anon default grants survive REVOKE FROM PUBLIC. Cover
-- both committed Crew RPCs and installed, uncommitted discovery functions.
-- Do not require discovery to exist on a clean checkout.
do $$
declare r record;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'arena_assert_crew_join_allowed','arena_assert_crew_specialties',
      'arena_crew_discovery_card','arena_crew_notify','arena_crew_payload',
      'arena_crew_role','arena_crew_specialty_vocabulary','arena_is_crew_member',
      'create_arena_crew','decide_arena_crew_join_request','discover_arena_crews',
      'follow_arena_crew','get_arena_crew','invite_to_arena_crew','join_arena_crew',
      'leave_arena_crew','list_arena_crew_members','list_arena_crews',
      'list_my_arena_crews','list_rising_arena_crews','request_arena_crew_join',
      'respond_arena_crew_invite','unfollow_arena_crew')
  loop
    execute format('revoke execute on function %s from public, anon',r.oid::regprocedure);
    if r.proname in ('arena_assert_crew_join_allowed','arena_assert_crew_specialties',
      'arena_crew_discovery_card','arena_crew_notify','arena_crew_payload') then
      execute format('revoke execute on function %s from authenticated',r.oid::regprocedure);
    end if;
  end loop;
end $$;
notify pgrst, 'reload schema';

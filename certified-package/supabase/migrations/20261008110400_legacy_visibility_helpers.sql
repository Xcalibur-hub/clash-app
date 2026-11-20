-- The same relationship oracle exists in Explore and Vault. Preserve internal
-- and verified service-role uses; scope every public helper to the caller.
do $$
declare helper text; r record; definition text;
begin
  foreach helper in array array['explore_actor_hidden','vault_profiles_blocked','can_access_vault_drop'] loop
    definition:=pg_get_functiondef(to_regprocedure('public.'||helper||'(text,text)'));
    if definition is null then raise exception 'missing visibility helper %',helper; end if;
    execute replace(definition,'FUNCTION public.'||helper||'(', 'FUNCTION public.'||helper||'_internal(');
    execute format('revoke all on function public.%I(text,text) from public,anon,authenticated,service_role',helper||'_internal');
    for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prosecdef and p.proname<>helper and p.proname<>helper||'_internal'
        and position('public.'||helper||'(' in p.prosrc)>0
    loop
      execute replace(pg_get_functiondef(r.oid),'public.'||helper||'(', 'public.'||helper||'_internal(');
    end loop;
  end loop;
end $$;
create or replace function public.explore_actor_hidden(p_viewer text,p_author text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if p_viewer is distinct from public.my_profile_id() then raise exception 'current viewer required' using errcode='42501'; end if;
  return public.explore_actor_hidden_internal(p_viewer,p_author);
end $$;
create or replace function public.vault_profiles_blocked(p_a text,p_b text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if p_a is distinct from public.my_profile_id() and p_b is distinct from public.my_profile_id() then
    raise exception 'current viewer required' using errcode='42501'; end if;
  return public.vault_profiles_blocked_internal(p_a,p_b);
end $$;
create or replace function public.can_access_vault_drop(p_viewer_profile_id text,p_drop_id text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if p_viewer_profile_id is distinct from public.my_profile_id() and coalesce(auth.role(),'')<>'service_role' then
    raise exception 'current viewer required' using errcode='42501'; end if;
  return public.can_access_vault_drop_internal(p_viewer_profile_id,p_drop_id);
end $$;
revoke all on function public.explore_actor_hidden(text,text),public.vault_profiles_blocked(text,text),public.can_access_vault_drop(text,text)
  from public,anon,authenticated;
grant execute on function public.explore_actor_hidden(text,text),public.vault_profiles_blocked(text,text),public.can_access_vault_drop(text,text) to anon,authenticated;
grant execute on function public.can_access_vault_drop(text,text) to service_role;
revoke execute on function public.notify_new_follower() from public,anon,authenticated;

-- Auxiliary Room reads must obey the same source filter as the main transcript.
do $$
declare r record; definition text; updated text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('get_arena_room_message_visibility','arena_room_mindshift_stats')
  loop
    definition:=pg_get_functiondef(r.oid);
    updated:=regexp_replace(definition,'\mbegin\M',
      E'begin\n  if exists(select 1 from public.arena_rooms where id=p_room_id) and not public.arena_room_readable(p_room_id) then raise exception ''room unavailable'' using errcode=''42501''; end if;', 'i');
    if updated=definition then raise exception 'auxiliary Room visibility anchor changed'; end if;
    execute updated;
  end loop;
end $$;
notify pgrst,'reload schema';

-- M1: source-scoped public competition reads. Prepared only; NOT APPLIED.
create function public.clash_readable(p_clash_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clashes c
    where c.id = p_clash_id
      and public.arena_take_readable(c.take_id)
      and not public.arena_actor_hidden_internal(public.my_profile_id(), c.challenger_id)
      and (
        (c.duel_key is null and not exists (
          select 1 from public.arena_rooms r where r.clash_id = c.id))
        or (c.duel_key is not null and exists (
          select 1 from public.arena_rooms r where r.clash_id = c.id
            and r.capacity = 2 and r.participant_count = 2
            and public.arena_room_readable(r.id)))
      )
  );
$$;
revoke all on function public.clash_readable(text) from public, anon, authenticated, service_role;
grant execute on function public.clash_readable(text) to anon, authenticated;

-- The helper reads clashes, and arena_room_readable also looks up clashes.
-- Prevent a recursion-prone deployment under unexpected function/table owners.
-- Do not disable RLS, FORCE settings or change any owner to make this pass.
do $ownership$
declare v_owner oid; v_bypass boolean; r record;
begin
  select p.proowner, (a.rolsuper or a.rolbypassrls) into v_owner, v_bypass
    from pg_catalog.pg_proc p join pg_catalog.pg_roles a on a.oid=p.proowner
    where p.oid='public.clash_readable(text)'::regprocedure;
  if exists(select 1 from pg_catalog.pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) then
    raise exception 'M1: interactive API role unexpectedly bypasses RLS';
  end if;
  if exists(select 1 from pg_catalog.pg_class where oid in ('public.clashes'::regclass,'public.verdicts'::regclass) and not relrowsecurity) then
    raise exception 'M1: competition RLS must already be enabled';
  end if;
  for r in select c.oid,c.relowner,c.relforcerowsecurity from pg_catalog.pg_class c
    where c.oid = any(array['public.clashes'::regclass,'public.takes'::regclass,
      'public.arena_rooms'::regclass,'public.arena_daily_topics'::regclass,
      'public.arena_room_participants'::regclass,'public.profiles'::regclass,
      'public.blocks'::regclass,'public.mutes'::regclass,
      'public.verdicts'::regclass,'public.arena_challenges'::regclass])
  loop
    if not v_bypass and (r.relowner <> v_owner or r.relforcerowsecurity) then
      raise exception 'M1: trusted read owner cannot bypass RLS on %', r.oid::regclass;
    end if;
  end loop;
  for r in select p.oid,p.proowner,p.prosecdef,p.proconfig from pg_catalog.pg_proc p
    where p.oid = any(array['public.arena_take_readable(text)'::regprocedure,
      'public.arena_room_readable(text)'::regprocedure,'public.arena_is_room_member(text)'::regprocedure,
      'public.arena_actor_hidden_internal(text,text)'::regprocedure,'public.my_profile_id()'::regprocedure,
      'public.is_staff()'::regprocedure,'public.clash_view(text)'::regprocedure,
      'public.clash_view_phase1(text)'::regprocedure,'public.clash_view_legacy(text)'::regprocedure,
      'public.clash_view_for_take(text)'::regprocedure,'public.profile_clash_list(text)'::regprocedure])
  loop
    if r.proowner <> v_owner or not r.prosecdef or not coalesce(r.proconfig @> array['search_path=""'],false) then
      raise exception 'M1: unexpected trusted function owner/security configuration: %',r.oid::regprocedure;
    end if;
  end loop;
end;
$ownership$;

-- Existing permissive policies compose with these restrictive gates. No table
-- or column grants change, especially BLIND challenger identity restrictions.
create policy "clashes require readable source" on public.clashes
  as restrictive for select to anon, authenticated using (public.clash_readable(id));
create policy "verdicts require readable source" on public.verdicts
  as restrictive for select to anon, authenticated using (public.clash_readable(clash_id));

-- Definer readers bypass table policies: guard before any metadata enrichment.
create or replace function public.clash_view(p_clash_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; counter text;
begin
  if not public.clash_readable(p_clash_id) then return null; end if;
  result := public.clash_view_phase1(p_clash_id);
  if result is null then return null; end if;
  select counter_position into counter from public.arena_challenges
    where clash_id=p_clash_id and status='ACCEPTED';
  if found then result := result || jsonb_build_object('sideBText',counter); end if;
  return result;
end;
$$;

create or replace function public.clash_view_for_take(p_take_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_id text;
begin
  select c.id into v_id from public.clashes c
    where c.take_id=p_take_id and c.status='open' order by c.created_at desc limit 1;
  if v_id is null then
    select c.id into v_id from public.clashes c
      where c.take_id=p_take_id order by c.created_at desc limit 1;
  end if;
  if v_id is null or not public.clash_readable(v_id) then return null; end if;
  return public.clash_view(v_id);
end;
$$;

-- Preserve all BLIND redaction/listing rules and LIMIT semantics. Abort on schema
-- drift instead of replacing history with a copied older function definition.
do $history$
declare definition text; anchor text := '(c.challenger_id = p_profile_id or t.author_id = p_profile_id)';
begin
  definition := pg_get_functiondef('public.profile_clash_list(text)'::regprocedure);
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
    raise exception 'M1: profile history visibility anchor changed';
  end if;
  execute replace(definition,anchor,anchor || ' and public.clash_readable(c.id)');
end;
$history$;

-- Public callers must use guarded entrypoints, not internal compatibility bodies.
revoke all on function public.clash_view_legacy(text), public.clash_view_phase1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.clash_view(text), public.clash_view_for_take(text), public.profile_clash_list(text)
  from public;
-- Existing service dependency is clash_view; its owner invokes the read helper.
grant execute on function public.clash_view(text) to anon, authenticated, service_role;
grant execute on function public.clash_view_for_take(text), public.profile_clash_list(text) to anon, authenticated;
notify pgrst, 'reload schema';

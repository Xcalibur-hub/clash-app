-- Entitlement and candidate builders are internal APIs, not arbitrary-person
-- query surfaces. Caller-scoped wrappers preserve existing policy dependencies.
do $$
declare helper text; r record; definition text;
begin
  foreach helper in array array['can_access_course_lesson','creator_ai_viewer_can_access',
    'creator_live_viewer_can_access','vault_community_viewer_can_access'] loop
    definition:=pg_get_functiondef(to_regprocedure('public.'||helper||'(text,text)'));
    if definition is null then raise exception 'missing viewer helper %',helper; end if;
    execute replace(definition,'FUNCTION public.'||helper||'(', 'FUNCTION public.'||helper||'_internal(');
    execute format('revoke all on function public.%I(text,text) from public,anon,authenticated,service_role',helper||'_internal');
    for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prosecdef and p.proname not in (helper,helper||'_internal')
        and position('public.'||helper||'(' in p.prosrc)>0
    loop
      execute replace(pg_get_functiondef(r.oid),'public.'||helper||'(', 'public.'||helper||'_internal(');
    end loop;
    -- Preserve parameters, return type, volatility and all existing grants.
    definition:=regexp_replace(definition,'\mbegin\M',
      E'begin\n  if p_viewer is distinct from public.my_profile_id() then raise exception ''current viewer required'' using errcode=''42501''; end if;', 'i');
    execute definition;
  end loop;
end $$;
revoke execute on function public.arena_backup_reasons(text,text,text),public.explore_vault_preview_rows(text,text,integer)
  from public,anon,authenticated;
notify pgrst,'reload schema';

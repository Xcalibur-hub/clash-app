-- H1: only the owner-executed trusted creation/settlement call chain writes notices.
-- No application/Edge caller uses this helper directly, including service_role.
revoke execute on function public.clash_notify(text, text, public.notification_kind, text)
  from public, anon, authenticated, service_role;

-- H2: table SELECT overrides column restrictions, so remove it first.
revoke select on table public.course_lessons from public, anon, authenticated;
-- Clear pre-existing column ACLs too; future columns must be explicitly reviewed.
do $$
declare v_columns text;
begin
  select string_agg(format('%I', attname), ', ' order by attnum) into v_columns
  from pg_attribute where attrelid = 'public.course_lessons'::regclass
    and attnum > 0 and not attisdropped;
  execute format('revoke select (%s) on public.course_lessons from public, anon, authenticated', v_columns);
end;
$$;
grant select (id, course_id, title, description, position, content_type,
  preview_allowed, access_type, status, created_at, updated_at)
  on public.course_lessons to anon, authenticated;

-- Fail closed if a target environment has unexpected inherited privileges.
-- Do not silently modify a shared role hierarchy or unrelated grants.
do $$
declare v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role,
      'public.clash_notify(text,text,public.notification_kind,text)', 'EXECUTE')
      or has_table_privilege(v_role, 'public.course_lessons', 'SELECT')
      or has_column_privilege(v_role, 'public.course_lessons', 'body_text', 'SELECT')
      or has_column_privilege(v_role, 'public.course_lessons', 'media_object_id', 'SELECT') then
      raise exception 'Unexpected inherited authorization for role %; inspect role grants before deployment', v_role;
    end if;
  end loop;
end;
$$;
-- Existing RLS, entitlement-aware card/media RPCs, owner privileges and trusted
-- service-role table access remain unchanged. No new public writer is introduced.

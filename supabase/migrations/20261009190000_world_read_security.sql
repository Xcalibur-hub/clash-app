-- Explore Phase 1B: World Drop discovery privacy.
-- The original permissive SELECT policy allowed raw published rows to bypass
-- the block/mute and media checks applied by World RPCs.
-- This additive checkpoint enforces one caller-scoped visibility contract
-- for both direct SELECT and public discovery RPCs.
create or replace function public.world_drop_readable(p_drop_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.world_drops d
      join public.media_objects m on m.id = d.media_object_id
     where d.id = p_drop_id
       and d.status = 'PUBLISHED'
       and d.deleted_at is null
       and d.expires_at > now()
       and m.status = 'ready'
       and m.deleted_at is null
       and m.visibility = 'public'
       and m.bucket = 'public-media'
       and not public.world_author_hidden(public.my_profile_id(), d.author_id)
  );
$$;
revoke all on function public.world_drop_readable(text) from public, anon, authenticated, service_role;
grant execute on function public.world_drop_readable(text) to anon, authenticated;

-- Preserve author/staff visibility for own drafts and moderation; all other
-- raw reads must pass the same public, caller-scoped discovery contract.
create policy "World drops require caller scoped public visibility"
  on public.world_drops as restrictive for select to anon, authenticated
  using (
    public.owns_profile(author_id)
    or public.is_staff()
    or public.world_drop_readable(id)
  );

-- SECURITY DEFINER RPCs bypass row RLS. Apply the same predicate inside each
-- discoverable projection; do not change the author's world_my_drops contract.
do $$
declare
  v_name text;
  v_signature text;
  v_definition text;
  v_updated text;
  v_anchor text;
begin
  foreach v_name in array array['world_nearby', 'world_recent', 'world_mission_drops', 'world_drop_view']
  loop
    v_signature := case v_name
      when 'world_nearby' then 'public.world_nearby(double precision,double precision,double precision,integer)'
      when 'world_recent' then 'public.world_recent(integer)'
      when 'world_mission_drops' then 'public.world_mission_drops(text,integer)'
      else 'public.world_drop_view(text)'
    end;
    v_definition := pg_get_functiondef(to_regprocedure(v_signature));
    if v_definition is null then
      raise exception 'World RPC missing: %', v_signature;
    end if;
    if v_name = 'world_drop_view' then
      v_anchor := 'where d.id = p_drop_id';
      v_updated := replace(v_definition, v_anchor,
        v_anchor || E'\n     and public.world_drop_readable(d.id)');
    else
      v_anchor := 'and not public.world_author_hidden(v_viewer, d.author_id)';
      v_updated := replace(v_definition, v_anchor,
        v_anchor || E'\n       and public.world_drop_readable(d.id)');
    end if;
    if v_updated = v_definition then
      raise exception 'World RPC visibility anchor changed: %', v_name;
    end if;
    execute v_updated;
  end loop;
end $$;
notify pgrst, 'reload schema';

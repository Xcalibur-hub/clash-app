-- ============================================================================
-- CLASH cloud wrapper — step 24 of 111
-- version           : 20260928140000
-- ledger name       : world_drop_view
-- mode              : direct
-- executed source   : supabase/migrations/20260928140000_world_drop_view.sql
-- executed sha256   : 891e35ec00a715568d4a85620d8fe96534aa30a3bb9145eaeeee4ad9c84be840
-- normalisation     : none
-- normalized sha256 : 891e35ec00a715568d4a85620d8fe96534aa30a3bb9145eaeeee4ad9c84be840
--
-- ATOMICITY: the migration SQL and its ledger row are committed together.
-- If this file fails, neither the schema change nor the ledger row survives.
-- ============================================================================
begin;

-- ============================================================================
-- CLASH 2.0 · Phase 5 Step 2 — World Drop detail read
-- ----------------------------------------------------------------------------
-- Additive RPC only. No table/schema redesign.
-- Required so /world/drop/[dropId] can load a single Drop through the same
-- authoritative card shape used by nearby/recent/mission discovery (block/mute,
-- approx coords only, no raw location).
-- ============================================================================

create or replace function public.world_drop_view(p_drop_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_drop public.world_drops%rowtype;
begin
  if p_drop_id is null or char_length(trim(p_drop_id)) = 0 then
    return null;
  end if;

  select * into v_drop
    from public.world_drops d
   where d.id = p_drop_id
     and d.deleted_at is null
     and d.status = 'PUBLISHED'
     and d.expires_at > now();

  if v_drop.id is null then
    return null;
  end if;

  if public.world_author_hidden(v_viewer, v_drop.author_id) then
    return null;
  end if;

  return public.world_drop_card(v_drop, null);
end;
$$;

grant execute on function public.world_drop_view(text) to anon, authenticated;
revoke execute on function public.world_drop_view(text) from public;


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20260928140000',
  'world_drop_view',
  array['sha256:891e35ec00a715568d4a85620d8fe96534aa30a3bb9145eaeeee4ad9c84be840'],
  'clash-cloud-wrapper-v1'
)
on conflict (version) do nothing;

commit;

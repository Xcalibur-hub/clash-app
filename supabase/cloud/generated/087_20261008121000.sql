-- ============================================================================
-- CLASH cloud wrapper — step 87 of 111
-- version           : 20261008121000
-- ledger name       : arena_discovery_states
-- mode              : direct
-- executed source   : supabase/migrations/20261008121000_arena_discovery_states.sql
-- executed sha256   : 60e249c9a05dc6ffc4679e98809aa2a76d706f4f9b305e9d7daa3b7e3818d7c0
-- normalisation     : none
-- normalized sha256 : 60e249c9a05dc6ffc4679e98809aa2a76d706f4f9b305e9d7daa3b7e3818d7c0
--
-- ATOMICITY: the migration SQL and its ledger row are committed together.
-- A server-side error before COMMIT aborts the transaction, so neither the
-- schema change nor its ledger row survives. A connection lost around COMMIT
-- can leave the outcome unknown, which is why the runner classifies it from
-- the ledger instead of claiming a rollback.
-- ============================================================================
begin;

-- Runtime fixtures remain available by ID for verification, but are not discovery.
-- Existing column-scoped UPDATE/INSERT grants do not permit clients to set this flag.
alter table public.takes add column is_runtime_fixture boolean not null default false;

create function public.list_arena_clash_discovery()
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(entry order by created_at desc, id desc),'[]'::jsonb)
  from (
    select c.id,c.created_at,jsonb_build_object(
      'id',c.id,'takeId',c.take_id,'roomId',v.payload->>'roomId',
      'title',v.payload->>'sideAText','status',c.status,
      'state',case when c.status in ('settled','cancelled') or c.closes_at<=now() then 'COMPLETED'
        when c.opens_at>now() then 'UPCOMING' else 'LIVE' end,
      'kind','CLASH') entry
    from public.clashes c join public.takes t on t.id=c.take_id
    cross join lateral (select public.clash_view(c.id) payload) v
    where not t.is_runtime_fixture and v.payload is not null
    union all
    select ch.id::text,ch.created_at,jsonb_build_object(
      'id',ch.id,'takeId',ch.take_id,'roomId',null,'title',t.text,
      'status',ch.status,'state','PENDING','kind','CHALLENGE')
    from public.arena_challenges ch join public.takes t on t.id=ch.take_id
    where ch.status='PENDING' and ch.expires_at>now() and not t.is_runtime_fixture
    order by created_at desc,id desc limit 60
  ) entries;
$$;
revoke all on function public.list_arena_clash_discovery() from public,anon,service_role;
grant execute on function public.list_arena_clash_discovery() to authenticated;

-- Legacy topic discovery must also exclude copied fixture propositions.
create or replace view public.arena_readable_topics with(security_barrier=true) as
  select t.* from public.arena_daily_topics t where public.arena_topic_readable(t.id)
    and not exists(select 1 from public.arena_rooms r join public.clashes c on c.id=r.clash_id
      join public.takes source on source.id=c.take_id
      where r.topic_id=t.id and source.is_runtime_fixture);
notify pgrst,'reload schema';


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20261008121000',
  'arena_discovery_states',
  array['sha256:60e249c9a05dc6ffc4679e98809aa2a76d706f4f9b305e9d7daa3b7e3818d7c0'],
  'clash-cloud-wrapper-v1'
)
on conflict (version) do nothing;

commit;

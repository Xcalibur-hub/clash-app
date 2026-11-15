-- CLASH CLOUD — 00_preflight.sql (generated; do not edit)
-- ============================================================================
-- Project: kgaqejgubjemdecifzew   Source: 9569391e0950956682c522d2d118bc8a711169d2
-- Run BEFORE deployment. READ-ONLY: issues SELECTs only.
-- FAIL-CLOSED: this file ends with a guard that RAISEs when any gating check
-- fails, so psql -v ON_ERROR_STOP=1 exits non-zero. An empty result set or an
-- ignored report can never be mistaken for success.
-- ============================================================================

select ord, check_name, expected, actual,
       case
         when r.check_name like 'INFO%' then 'INFO'
         when r.expected like '>=%' then case when r.actual::int >= substring(r.expected from 3)::int then 'PASS' else 'FAIL' end
         else case when r.actual = r.expected then 'PASS' else 'FAIL' end
       end as status
  from (
  select 1 as ord, 'postgres major version 17'::text as check_name, '17'::text as expected, split_part(current_setting('server_version'), '.', 1)::text as actual
  union all
  select 2 as ord, 'wal_level'::text as check_name, 'logical'::text as expected, current_setting('wal_level')::text as actual
  union all
  select 3 as ord, 'replication slots'::text as check_name, '0'::text as expected, (select count(*)::text from pg_replication_slots)::text as actual
  union all
  select 4 as ord, 'baseline public relations'::text as check_name, '0'::text as expected, (select count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S','f'))::text as actual
  union all
  select 5 as ord, 'baseline public functions'::text as check_name, '0'::text as expected, (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')::text as actual
  union all
  select 6 as ord, 'baseline auth.users rows'::text as check_name, '0'::text as expected, (select count(*)::text from auth.users)::text as actual
  union all
  select 7 as ord, 'baseline storage.buckets rows'::text as check_name, '0'::text as expected, (select count(*)::text from storage.buckets)::text as actual
  union all
  select 8 as ord, 'postgis installed in extensions'::text as check_name, 'postgis|extensions'::text as expected, coalesce((select e.extname||'|'||n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='postgis'),'ABSENT')::text as actual
  union all
  select 9 as ord, 'pgcrypto schema'::text as check_name, 'extensions'::text as expected, coalesce((select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'),'ABSENT')::text as actual
  union all
  select 10 as ord, 'pg_cron extension absent'::text as check_name, 'ABSENT'::text as expected, coalesce((select extversion from pg_extension where extname='pg_cron'),'ABSENT')::text as actual
  union all
  select 11 as ord, 'cron.schedule() absent'::text as check_name, 'ABSENT'::text as expected, coalesce(to_regprocedure('cron.schedule(text,text,text)')::text,'ABSENT')::text as actual
  union all
  select 12 as ord, 'schema cron absent'::text as check_name, 'ABSENT'::text as expected, coalesce((select nspname from pg_namespace where nspname='cron'),'ABSENT')::text as actual
  union all
  select 13 as ord, 'publication supabase_realtime owner'::text as check_name, 'postgres'::text as expected, coalesce((select r.rolname from pg_publication p join pg_roles r on r.oid=p.pubowner where p.pubname='supabase_realtime'),'ABSENT')::text as actual
  union all
  select 14 as ord, 'publication supabase_realtime tables'::text as check_name, '0'::text as expected, (select count(*)::text from pg_publication_tables where pubname='supabase_realtime')::text as actual
  union all
  select 15 as ord, 'realtime.messages RLS'::text as check_name, 'true'::text as expected, coalesce((select relrowsecurity::text from pg_class where oid=to_regclass('realtime.messages')),'ABSENT')::text as actual
  union all
  select 16 as ord, 'API roles present'::text as check_name, '4'::text as expected, (select count(*)::text from pg_roles where rolname in ('anon','authenticated','service_role','authenticator'))::text as actual
  union all
  select 17 as ord, 'storage.objects.owner type'::text as check_name, 'uuid'::text as expected, coalesce((select data_type from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='owner'),'ABSENT')::text as actual
  union all
  select 18 as ord, 'supautils delegates storage.objects policy DDL'::text as check_name, 'delegated'::text as expected, case when (select setting from pg_settings where name='supautils.policy_grants') like '%storage.objects%' then 'delegated' else 'MISSING' end::text as actual
  union all
  select 19 as ord, 'supautils delegates realtime.messages policy DDL'::text as check_name, 'delegated'::text as expected, case when (select setting from pg_settings where name='supautils.policy_grants') like '%realtime.messages%' then 'delegated' else 'MISSING' end::text as actual
  union all
  select 20 as ord, 'INFO supautils privileged_extensions has pg_cron'::text as check_name, 'INFO'::text as expected, case when (select setting from pg_settings where name='supautils.privileged_extensions') like '%pg_cron%' then 'INFO present - file 13 variant mandatory' else 'INFO absent' end::text as actual
  union all
  select 21 as ord, 'INFO expected step count'::text as check_name, 'INFO'::text as expected, 'INFO 111 wrappers'::text as actual
  ) r
 order by ord;

do $preflight$
declare
  v_fail text;
begin
  select string_agg(c.ord::text || '. ' || c.check_name || '  expected=' || c.expected || '  actual=' || c.actual, E'\n')
    into v_fail
    from (
      select r.ord, r.check_name, r.expected, r.actual,
             case
         when r.check_name like 'INFO%' then 'INFO'
         when r.expected like '>=%' then case when r.actual::int >= substring(r.expected from 3)::int then 'PASS' else 'FAIL' end
         else case when r.actual = r.expected then 'PASS' else 'FAIL' end
       end as status
        from (
  select 1 as ord, 'postgres major version 17'::text as check_name, '17'::text as expected, split_part(current_setting('server_version'), '.', 1)::text as actual
  union all
  select 2 as ord, 'wal_level'::text as check_name, 'logical'::text as expected, current_setting('wal_level')::text as actual
  union all
  select 3 as ord, 'replication slots'::text as check_name, '0'::text as expected, (select count(*)::text from pg_replication_slots)::text as actual
  union all
  select 4 as ord, 'baseline public relations'::text as check_name, '0'::text as expected, (select count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S','f'))::text as actual
  union all
  select 5 as ord, 'baseline public functions'::text as check_name, '0'::text as expected, (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')::text as actual
  union all
  select 6 as ord, 'baseline auth.users rows'::text as check_name, '0'::text as expected, (select count(*)::text from auth.users)::text as actual
  union all
  select 7 as ord, 'baseline storage.buckets rows'::text as check_name, '0'::text as expected, (select count(*)::text from storage.buckets)::text as actual
  union all
  select 8 as ord, 'postgis installed in extensions'::text as check_name, 'postgis|extensions'::text as expected, coalesce((select e.extname||'|'||n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='postgis'),'ABSENT')::text as actual
  union all
  select 9 as ord, 'pgcrypto schema'::text as check_name, 'extensions'::text as expected, coalesce((select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'),'ABSENT')::text as actual
  union all
  select 10 as ord, 'pg_cron extension absent'::text as check_name, 'ABSENT'::text as expected, coalesce((select extversion from pg_extension where extname='pg_cron'),'ABSENT')::text as actual
  union all
  select 11 as ord, 'cron.schedule() absent'::text as check_name, 'ABSENT'::text as expected, coalesce(to_regprocedure('cron.schedule(text,text,text)')::text,'ABSENT')::text as actual
  union all
  select 12 as ord, 'schema cron absent'::text as check_name, 'ABSENT'::text as expected, coalesce((select nspname from pg_namespace where nspname='cron'),'ABSENT')::text as actual
  union all
  select 13 as ord, 'publication supabase_realtime owner'::text as check_name, 'postgres'::text as expected, coalesce((select r.rolname from pg_publication p join pg_roles r on r.oid=p.pubowner where p.pubname='supabase_realtime'),'ABSENT')::text as actual
  union all
  select 14 as ord, 'publication supabase_realtime tables'::text as check_name, '0'::text as expected, (select count(*)::text from pg_publication_tables where pubname='supabase_realtime')::text as actual
  union all
  select 15 as ord, 'realtime.messages RLS'::text as check_name, 'true'::text as expected, coalesce((select relrowsecurity::text from pg_class where oid=to_regclass('realtime.messages')),'ABSENT')::text as actual
  union all
  select 16 as ord, 'API roles present'::text as check_name, '4'::text as expected, (select count(*)::text from pg_roles where rolname in ('anon','authenticated','service_role','authenticator'))::text as actual
  union all
  select 17 as ord, 'storage.objects.owner type'::text as check_name, 'uuid'::text as expected, coalesce((select data_type from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='owner'),'ABSENT')::text as actual
  union all
  select 18 as ord, 'supautils delegates storage.objects policy DDL'::text as check_name, 'delegated'::text as expected, case when (select setting from pg_settings where name='supautils.policy_grants') like '%storage.objects%' then 'delegated' else 'MISSING' end::text as actual
  union all
  select 19 as ord, 'supautils delegates realtime.messages policy DDL'::text as check_name, 'delegated'::text as expected, case when (select setting from pg_settings where name='supautils.policy_grants') like '%realtime.messages%' then 'delegated' else 'MISSING' end::text as actual
  union all
  select 20 as ord, 'INFO supautils privileged_extensions has pg_cron'::text as check_name, 'INFO'::text as expected, case when (select setting from pg_settings where name='supautils.privileged_extensions') like '%pg_cron%' then 'INFO present - file 13 variant mandatory' else 'INFO absent' end::text as actual
  union all
  select 21 as ord, 'INFO expected step count'::text as check_name, 'INFO'::text as expected, 'INFO 111 wrappers'::text as actual
        ) r
     ) c
   where c.status = 'FAIL';

  if v_fail is not null then
    raise exception E'preflight FAILED:\n%', v_fail;
  end if;

  raise notice 'preflight OK: every gating check passed';
end
$preflight$;

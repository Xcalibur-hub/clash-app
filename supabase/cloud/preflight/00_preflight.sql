-- ============================================================================
-- CLASH CLOUD — 00_preflight.sql   ·   READ-ONLY
-- Project: kgaqejgubjemdecifzew      Source: 9569391e0950956682c522d2d118bc8a711169d2
-- ----------------------------------------------------------------------------
-- Run BEFORE any deployment step. Every row must be PASS (INFO rows are
-- recorded but do not gate). Any FAIL => STOP. Do not "fix" the environment to
-- make a check pass; record the FAIL and escalate.
--
-- This script issues SELECT statements only. It writes nothing.
-- ============================================================================

with checks(ord, check_name, expected, actual) as (
  select 1,  'postgres major version', '17.x', current_setting('server_version')
  union all
  select 2,  'wal_level', 'logical', current_setting('wal_level')
  union all
  select 3,  'replication slots', '0',
         (select count(*)::text from pg_replication_slots)
  union all
  select 4,  'baseline: public relations (r,p,v,m,S,f)', '0',
         (select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r','p','v','m','S','f'))
  union all
  select 5,  'baseline: public functions', '0',
         (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public')
  union all
  select 6,  'baseline: auth.users rows', '0',
         (select count(*)::text from auth.users)
  union all
  select 7,  'baseline: storage.buckets rows', '0',
         (select count(*)::text from storage.buckets)
  union all
  select 8,  'postgis installed in extensions schema', 'postgis|extensions',
         coalesce((select e.extname || '|' || n.nspname
                     from pg_extension e join pg_namespace n on n.oid = e.extnamespace
                    where e.extname = 'postgis'), 'ABSENT')
  union all
  select 9,  'pgcrypto schema', 'extensions',
         coalesce((select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace
                    where e.extname = 'pgcrypto'), 'ABSENT')
  union all
  select 10, 'pg_cron extension', 'ABSENT',
         coalesce((select extversion from pg_extension where extname = 'pg_cron'), 'ABSENT')
  union all
  select 11, 'cron.schedule() present', 'ABSENT',
         coalesce(to_regprocedure('cron.schedule(text,text,text)')::text, 'ABSENT')
  union all
  select 12, 'schema "cron" present', 'ABSENT',
         coalesce((select nspname from pg_namespace where nspname = 'cron'), 'ABSENT')
  union all
  select 13, 'publication supabase_realtime owner', 'postgres',
         coalesce((select r.rolname from pg_publication p join pg_roles r on r.oid = p.pubowner
                    where p.pubname = 'supabase_realtime'), 'ABSENT')
  union all
  select 14, 'publication supabase_realtime tables', '0',
         (select count(*)::text from pg_publication_tables where pubname = 'supabase_realtime')
  union all
  select 15, 'realtime.messages RLS enabled', 'true',
         coalesce((select relrowsecurity::text from pg_class
                    where oid = to_regclass('realtime.messages')), 'ABSENT')
  union all
  select 16, 'API roles present', '4',
         (select count(*)::text from pg_roles
           where rolname in ('anon','authenticated','service_role','authenticator'))
  union all
  select 17, 'storage.objects.owner column type', 'uuid',
         coalesce((select data_type from information_schema.columns
                    where table_schema = 'storage' and table_name = 'objects'
                      and column_name = 'owner'), 'ABSENT')
  union all
  select 18, 'migration ledger table', 'ABSENT or 0 rows',
         coalesce(to_regclass('supabase_migrations.schema_migrations')::text, 'ABSENT')
  union all
  select 19, 'supautils delegates storage.objects policy DDL', 'delegated',
         case when (select setting from pg_settings where name = 'supautils.policy_grants')
                   like '%storage.objects%' then 'delegated' else 'MISSING' end
  union all
  select 20, 'supautils delegates realtime.messages policy DDL', 'delegated',
         case when (select setting from pg_settings where name = 'supautils.policy_grants')
                   like '%realtime.messages%' then 'delegated' else 'MISSING' end
  union all
  select 21, 'supautils privileged_extensions contains pg_cron', 'INFO: hazard documented',
         case when (select setting from pg_settings where name = 'supautils.privileged_extensions')
                   like '%pg_cron%' then 'INFO: present — base file 13 must NOT be run'
              else 'INFO: absent — variant still required by policy' end
  union all
  select 22, 'source checkout sha256 of file 13 matches manifest', 'see manifest.json',
         'verified by tools/check-manifest.ps1'
)
select ord,
       check_name,
       expected,
       actual,
       case
         when check_name like 'supautils privileged%' then 'INFO'
         when check_name = 'postgres major version'
              then case when actual like '17.%' then 'PASS' else 'FAIL' end
         when check_name = 'migration ledger table'
              then case when actual = 'ABSENT' then 'PASS' else 'FAIL' end
         when check_name like 'source checkout%' then 'INFO'
         else case when actual = expected then 'PASS' else 'FAIL' end
       end as status
  from checks
 order by ord;

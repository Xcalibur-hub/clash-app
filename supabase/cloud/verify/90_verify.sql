-- ============================================================================
-- CLASH CLOUD — 90_verify.sql   ·   READ-ONLY
-- Project: kgaqejgubjemdecifzew
-- ----------------------------------------------------------------------------
-- Run AFTER all 111 steps + the storage bootstrap. Every row must be PASS.
-- Any FAIL => the deployment is NOT a success, regardless of what the ledger
-- says. Record the FAIL in evidence and STOP.
--
-- This script issues SELECT statements only. It writes nothing.
-- ============================================================================

with checks(ord, check_name, expected, actual) as (
  select 1,  'ledger rows', '111',
         (select count(*)::text from supabase_migrations.schema_migrations)
  union all
  select 2,  'ledger contains version 20260927030000', '1',
         (select count(*)::text from supabase_migrations.schema_migrations
           where version = '20260927030000')
  union all
  select 3,  'public tables exist', 'true',
         (select (count(*) > 0)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r','p'))
  union all
  select 4,  'core tables present', '8',
         (select count(*)::text from (values
            ('profiles'),('arena_rooms'),('arena_room_messages'),('arena_daily_topics'),
            ('media_objects'),('rate_limit_events'),('arena_room_results'),('arena_room_participants')
          ) as t(tbl)
          where to_regclass('public.' || t.tbl) is not null)
  union all
  select 5,  'core functions present', '9',
         (select count(*)::text from (values
            ('run_maintenance'),('settle_due_clashes'),('create_arena_daily_topic'),
            ('join_arena_topic'),('post_arena_room_message'),('list_arena_official_page'),
            ('watch_arena_room'),('my_profile_id'),('owns_profile')
          ) as t(fn)
          where to_regprocedure('public.' || t.fn) is not null)
  union all
  select 6,  'arena_room_messages in supabase_realtime', 'true',
         (select (count(*) > 0)::text from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public' and tablename = 'arena_room_messages')
  union all
  select 7,  'realtime.messages policies (at least 5)', '>=5',
         (select count(*)::text from pg_policy
           where polrelid = to_regclass('realtime.messages'))
  union all
  select 8,  'realtime.messages policy names', '5',
         (select count(*)::text from pg_policy
           where polrelid = to_regclass('realtime.messages')
             and polname in ('members receive server typing hints',
                             'meet typing read boundary',
                             'meet typing guest boundary',
                             'meet typing no client publication',
                             'active participants receive meet typing hints'))
  union all
  select 9,  'storage.objects policies', '5',
         (select count(*)::text from pg_policy
           where polrelid = to_regclass('storage.objects')
             and polname in ('media objects are publicly readable',
                             'own media objects are readable',
                             'media upload into own namespace',
                             'own media objects are updatable',
                             'own media objects are deletable'))
  union all
  select 10, 'buckets', '2',
         (select count(*)::text from storage.buckets where id in ('public-media','private-media'))
  union all
  select 11, 'public-media is public', 'true',
         coalesce((select public::text from storage.buckets where id = 'public-media'), 'ABSENT')
  union all
  select 12, 'private-media is private', 'false',
         coalesce((select public::text from storage.buckets where id = 'private-media'), 'ABSENT')
  union all
  select 13, 'bucket mime allowlist', '8',
         coalesce((select array_length(allowed_mime_types, 1)::text
                     from storage.buckets where id = 'public-media'), 'ABSENT')
  union all
  select 14, 'TRIPWIRE pg_cron extension', 'ABSENT',
         coalesce((select extversion from pg_extension where extname = 'pg_cron'), 'ABSENT')
  union all
  select 15, 'TRIPWIRE cron.schedule()', 'ABSENT',
         coalesce(to_regprocedure('cron.schedule(text,text,text)')::text, 'ABSENT')
  union all
  select 16, 'TRIPWIRE schema "cron"', 'ABSENT',
         coalesce((select nspname from pg_namespace where nspname = 'cron'), 'ABSENT')
  union all
  select 17, 'run_maintenance not executable by anon', 'false',
         has_function_privilege('anon', 'public.run_maintenance(integer)', 'EXECUTE')::text
  union all
  select 18, 'run_maintenance not executable by authenticated', 'false',
         has_function_privilege('authenticated', 'public.run_maintenance(integer)', 'EXECUTE')::text
  union all
  select 19, 'run_maintenance executable by service_role', 'true',
         has_function_privilege('service_role', 'public.run_maintenance(integer)', 'EXECUTE')::text
  union all
  select 20, 'realtime.messages RLS still enabled', 'true',
         coalesce((select relrowsecurity::text from pg_class
                    where oid = to_regclass('realtime.messages')), 'ABSENT')
  union all
  select 21, 'wal_level unchanged', 'logical', current_setting('wal_level')
  union all
  select 22, 'no CLASH cron job scheduled', 'ABSENT',
         case when to_regclass('cron.job') is null then 'ABSENT'
              else coalesce(
                     (xpath('/row/j/text()',
                            query_to_xml('select string_agg(jobname, ' || quote_literal('|') || ') as j from cron.job',
                                         false, true, '')))[1]::text,
                     'no rows')
              end
)
select ord,
       check_name,
       expected,
       actual,
       case
         when check_name = 'realtime.messages policies (at least 5)'
           then case when actual::int >= 5 then 'PASS' else 'FAIL' end
         else case when actual = expected then 'PASS' else 'FAIL' end
       end as status
  from checks
 order by ord;

-- NOTE on check 22: `cron.job` is referenced only inside a query_to_xml string,
-- so it is never resolved at parse time. On a compliant deployment the
-- `cron` schema does not exist and this check returns ABSENT without error.
-- Checks 14-16 independently prove the same absence from the catalog.

-- CLASH CLOUD — 95_storage_config.sql (generated; do not edit)
-- ============================================================================
-- Project: kgaqejgubjemdecifzew
-- READ-ONLY. Migration 4 (20260926150000_media_storage.sql) creates the buckets
-- and the five storage.objects policies whenever storage.buckets/objects exist,
-- which is always true on hosted Supabase. This file therefore VERIFIES the
-- exact configuration and writes nothing (audit finding F4).
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
  select 1 as ord, 'bucket count for media'::text as check_name, '2'::text as expected, (select count(*)::text from storage.buckets where id in ('public-media','private-media'))::text as actual
  union all
  select 2 as ord, 'public-media is public'::text as check_name, 'true'::text as expected, coalesce((select public::text from storage.buckets where id='public-media'),'ABSENT')::text as actual
  union all
  select 3 as ord, 'private-media is private'::text as check_name, 'false'::text as expected, coalesce((select public::text from storage.buckets where id='private-media'),'ABSENT')::text as actual
  union all
  select 4 as ord, 'file_size_limit'::text as check_name, '104857600'::text as expected, coalesce((select file_size_limit::text from storage.buckets where id='public-media'),'ABSENT')::text as actual
  union all
  select 5 as ord, 'mime allowlist length'::text as check_name, '8'::text as expected, coalesce((select array_length(allowed_mime_types,1)::text from storage.buckets where id='public-media'),'ABSENT')::text as actual
  union all
  select 6 as ord, 'storage.objects policies'::text as check_name, '5'::text as expected, (select count(*)::text from pg_policy where polrelid=to_regclass('storage.objects') and polname in ('media objects are publicly readable','own media objects are readable','media upload into own namespace','own media objects are updatable','own media objects are deletable'))::text as actual
  union all
  select 7 as ord, 'INFO created by migration 4, not by this package'::text as check_name, 'INFO'::text as expected, 'INFO migration 20260926150000 owns bucket+policy creation'::text as actual
  ) r
 order by ord;

do $storage_verify$
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
  select 1 as ord, 'bucket count for media'::text as check_name, '2'::text as expected, (select count(*)::text from storage.buckets where id in ('public-media','private-media'))::text as actual
  union all
  select 2 as ord, 'public-media is public'::text as check_name, 'true'::text as expected, coalesce((select public::text from storage.buckets where id='public-media'),'ABSENT')::text as actual
  union all
  select 3 as ord, 'private-media is private'::text as check_name, 'false'::text as expected, coalesce((select public::text from storage.buckets where id='private-media'),'ABSENT')::text as actual
  union all
  select 4 as ord, 'file_size_limit'::text as check_name, '104857600'::text as expected, coalesce((select file_size_limit::text from storage.buckets where id='public-media'),'ABSENT')::text as actual
  union all
  select 5 as ord, 'mime allowlist length'::text as check_name, '8'::text as expected, coalesce((select array_length(allowed_mime_types,1)::text from storage.buckets where id='public-media'),'ABSENT')::text as actual
  union all
  select 6 as ord, 'storage.objects policies'::text as check_name, '5'::text as expected, (select count(*)::text from pg_policy where polrelid=to_regclass('storage.objects') and polname in ('media objects are publicly readable','own media objects are readable','media upload into own namespace','own media objects are updatable','own media objects are deletable'))::text as actual
  union all
  select 7 as ord, 'INFO created by migration 4, not by this package'::text as check_name, 'INFO'::text as expected, 'INFO migration 20260926150000 owns bucket+policy creation'::text as actual
        ) r
     ) c
   where c.status = 'FAIL';

  if v_fail is not null then
    raise exception E'storage_verify FAILED:\n%', v_fail;
  end if;

  raise notice 'storage_verify OK: every gating check passed';
end
$storage_verify$;

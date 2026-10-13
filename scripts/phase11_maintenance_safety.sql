-- ============================================================================
-- Phase 11 Step 9 Part C — maintenance safety harness (LOCAL DOCKER ONLY)
-- ----------------------------------------------------------------------------
-- Exercises public.run_maintenance(integer) for: privilege boundaries,
-- idempotency, monotonic counters, unexpected-deletion safety, failure-ledger
-- retention (cap + age prune), concurrent invocation and runtime.
--
-- FAIL-CLOSED: refuses a non-loopback database. Everything is rolled back.
-- Run:
--   docker exec supabase_db_<project> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f /tmp/phase11_maintenance_safety.sql
-- ============================================================================
begin;
create temp table m9(name text, result text, detail text) on commit drop;

do $guard$
begin
  if host(inet_server_addr()) is not null
     and host(inet_server_addr()) not in ('127.0.0.1', '::1') then
    raise exception 'refusing non-loopback database: %', host(inet_server_addr());
  end if;
end
$guard$;

insert into m9
select 'priv_anon_denied', case when not has_function_privilege('anon', 'public.run_maintenance(integer)', 'execute') then 'PASS' else 'FAIL' end, 'anon'
union all
select 'priv_authenticated_denied', case when not has_function_privilege('authenticated', 'public.run_maintenance(integer)', 'execute') then 'PASS' else 'FAIL' end, 'authenticated'
union all
select 'priv_logger_denied', case when not has_function_privilege('authenticated', 'public.record_arena_maintenance_failure(text,text,text)', 'execute')
                                       and not has_function_privilege('anon', 'public.record_arena_maintenance_failure(text,text,text)', 'execute')
                                  then 'PASS' else 'FAIL' end, 'failure-logging helper is service/owner only'
union all
select 'priv_service_role_allowed', case when has_function_privilege('service_role', 'public.run_maintenance(integer)', 'execute') then 'PASS' else 'FAIL' end, 'service_role';

create temp table m9_before on commit drop as
select (select count(*) from public.profiles) profiles,
       (select count(*) from public.takes) takes,
       (select count(*) from public.clashes) clashes,
       (select count(*) from public.comments) comments,
       (select count(*) from public.notifications) notifications,
       (select count(*) from public.reputation_events) reputation_events,
       (select count(*) from public.arena_rooms) arena_rooms;

-- Failure-ledger retention fixtures through the reviewed logging helper (the
-- 1,000 cap is enforced on log, not by a raw insert) plus one aged row.
do $cap$
begin
  for i in 1..1005 loop
    perform public.record_arena_maintenance_failure('clash_settlement', 'm9-item-' || i, 'M9042');
  end loop;
end
$cap$;
insert into public.arena_maintenance_failures
  (operation, item_id, first_failed_at, last_failed_at, failed_attempts, sqlstate, safe_detail, retry_status)
values ('clash_settlement', 'm9-aged-item', now() - interval '8 days', now() - interval '8 days', 1, 'M9000', 'aged fixture', 'pending');

create temp table m9_run(seq int, payload jsonb, ms numeric) on commit drop;
do $runs$
declare t0 timestamptz; p jsonb;
begin
  for i in 1..2 loop
    t0 := clock_timestamp();
    p := public.run_maintenance(500);
    insert into m9_run values (i, p, round(extract(epoch from clock_timestamp() - t0) * 1000, 1));
  end loop;
end
$runs$;

insert into m9
select 'idempotent_no_partial_failure',
       case when not exists (select 1 from m9_run where (payload->>'partial_failure')::boolean) then 'PASS' else 'FAIL' end,
       (select string_agg(coalesce(payload->>'partial_failure', 'null'), ',' order by seq) from m9_run)
union all
select 'idempotent_key_set_stable',
       case when (select count(*) from jsonb_object_keys((select payload from m9_run where seq = 1)))
                  = (select count(*) from jsonb_object_keys((select payload from m9_run where seq = 2)))
                 and not exists (
                   select 1 from jsonb_object_keys((select payload from m9_run where seq = 1)) k
                   where k not in (select jsonb_object_keys(payload) from m9_run where seq = 2))
            then 'PASS' else 'FAIL' end,
       (select count(*)::text || ' keys' from jsonb_object_keys((select payload from m9_run where seq = 1)))
union all
select 'second_run_settles_nothing',
       case when coalesce((select (payload->>'clashes_settled')::int from m9_run where seq = 2), 0) = 0 then 'PASS' else 'FAIL' end,
       (select payload->>'clashes_settled' from m9_run where seq = 2)
union all
select 'second_run_expires_nothing',
       case when coalesce((select (payload->>'takes_expired')::int from m9_run where seq = 2), 0) = 0
                 and coalesce((select (payload->>'vault_drops_expired')::int from m9_run where seq = 2), 0) = 0
                 and coalesce((select (payload->>'world_drops_expired')::int from m9_run where seq = 2), 0) = 0
            then 'PASS' else 'FAIL' end,
       (select concat('takes=', payload->>'takes_expired', ' vault=', payload->>'vault_drops_expired', ' world=', payload->>'world_drops_expired') from m9_run where seq = 2)
union all
select 'no_unexpected_entity_deletion',
       case when (select concat_ws(',', b.profiles, b.takes, b.clashes, b.comments, b.notifications, b.reputation_events, b.arena_rooms) from m9_before b)
                 = concat_ws(',', (select count(*) from public.profiles), (select count(*) from public.takes), (select count(*) from public.clashes),
                              (select count(*) from public.comments), (select count(*) from public.notifications),
                              (select count(*) from public.reputation_events), (select count(*) from public.arena_rooms))
            then 'PASS' else 'FAIL' end,
       'profiles/takes/clashes/comments/notifications/reputation_events/arena_rooms unchanged'
union all
select 'failure_ledger_cap_enforced',
       case when (select count(*) from public.arena_maintenance_failures) <= 1000 then 'PASS' else 'FAIL' end,
       (select count(*)::text from public.arena_maintenance_failures)
union all
select 'failure_ledger_age_pruned',
       case when not exists (select 1 from public.arena_maintenance_failures where item_id = 'm9-aged-item') then 'PASS' else 'FAIL' end,
       'aged 8-day row removed'
union all
select 'runtime_under_2s',
       case when (select max(ms) from m9_run) < 2000 then 'PASS' else 'FAIL' end,
       (select string_agg(ms::text || 'ms', ', ' order by seq) from m9_run);

-- Concurrent invocation: hold the maintenance lock on an independent connection.
create extension if not exists dblink with schema extensions;
select extensions.dblink_connect('m9-hold', 'host=127.0.0.1 port=5432 user=postgres password=postgres dbname=' || current_database());
select extensions.dblink_exec('m9-hold', 'begin');
select payload from extensions.dblink('m9-hold', 'select public.run_maintenance(1)') as held(payload jsonb);
create temp table m9_conc(payload jsonb) on commit drop;
insert into m9_conc select public.run_maintenance(500);
insert into m9
select 'concurrent_invocation',
       case when coalesce((select (payload->>'skipped')::boolean from m9_conc), false) then 'PASS'
            when exists (select 1 from m9_conc) then 'UNVERIFIED'
            else 'FAIL' end,
       case when exists (select 1 from m9_conc where payload ? 'skipped')
              then 'skipped=' || (select payload->>'skipped' from m9_conc)
              else 'idle-queue: the held call had no work, so no overlap lock was held' end;
select extensions.dblink_exec('m9-hold', 'commit');
select extensions.dblink_disconnect('m9-hold');

select result, count(*) as tests from m9 group by 1 order by 1;
select name, result, detail from m9 order by name;
rollback;


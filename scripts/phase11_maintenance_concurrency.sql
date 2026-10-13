-- ============================================================================
-- Phase 11 Step 10 Part B — maintenance CONCURRENCY harness (LOCAL DOCKER ONLY)
-- ----------------------------------------------------------------------------
-- Seeds committed expired Clashes so run_maintenance(500) has real work, then
-- fires genuinely overlapping run_maintenance calls on independent dblink
-- sessions and checks serialization / overlap rejection / exactly-once effects.
--
-- Fixtures are committed (dblink sessions cannot see uncommitted rows) and are
-- removed by the cleanup section at the end. FAIL-CLOSED on non-loopback hosts.
-- Run: docker exec supabase_db_<project> psql -U postgres -d postgres \
--        -v ON_ERROR_STOP=1 -f /tmp/phase11_maintenance_concurrency.sql
-- ============================================================================

do $guard$
begin
  if host(inet_server_addr()) is not null and host(inet_server_addr()) not in ('127.0.0.1', '::1') then
    raise exception 'refusing non-loopback database: %', host(inet_server_addr());
  end if;
end
$guard$;

create extension if not exists dblink with schema extensions;

-- Accounts (profiles are created by the auth trigger, then pinned).
delete from public.profiles where id like 'c10-%';
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000c10a1'),
  ('00000000-0000-0000-0000-0000000c10b1'),
  ('00000000-0000-0000-0000-0000000c10c1')
on conflict (id) do nothing;
update public.profiles set id = 'c10-author', handle = 'c10_author' where auth_user_id = '00000000-0000-0000-0000-0000000c10a1';
update public.profiles set id = 'c10-challenger', handle = 'c10_challenger' where auth_user_id = '00000000-0000-0000-0000-0000000c10b1';
update public.profiles set id = 'c10-juror', handle = 'c10_juror' where auth_user_id = '00000000-0000-0000-0000-0000000c10c1';

drop table if exists public._c10_results;
create table public._c10_results (round int, sender int, payload jsonb, ms numeric, err text);

-- 600 expired Clashes, each with exactly one juror ballot: real, exactly-once work.
do $seed$
declare i int;
begin
  perform set_config('c10.enabled', '1', false);
  delete from public.verdicts where clash_id like 'c10-clash-%';
  delete from public.reputation_events where clash_id like 'c10-clash-%';
  delete from public.notifications where entity_id like 'c10-clash-%';
  delete from public.judgements where clash_id like 'c10-clash-%';
  delete from public.clashes where id like 'c10-clash-%';
  delete from public.takes where id like 'c10-take-%';
  for i in 1..600 loop
    insert into public.takes (id, author_id, hood, text, is_runtime_fixture)
      values ('c10-take-' || i, 'c10-author', 'techtakes', 'concurrency fixture', true);
    insert into public.clashes (id, take_id, challenger_id, status, opens_at, closes_at)
      values ('c10-clash-' || i, 'c10-take-' || i, 'c10-challenger', 'open', now() - interval '10 minutes', now() - interval '1 minute');
    insert into public.judgements (clash_id, juror_id, side)
      values ('c10-clash-' || i, 'c10-juror', 'A');
  end loop;
end
$seed$;

-- Genuine overlap: 3 independent sessions, 6 rounds back-to-back.
do $race$
declare
  r int; s int; senders int := 3; conn text; t0 timestamptz; ms numeric; res jsonb;
begin
  for s in 1..senders loop
    perform extensions.dblink_connect('c10-c' || s,
      'host=127.0.0.1 port=5432 user=postgres password=postgres dbname=' || current_database());
  end loop;
  for r in 1..6 loop
    for s in 1..senders loop
      begin
        perform extensions.dblink_send_query('c10-c' || s, 'select public.run_maintenance(500)');
      exception when others then
        insert into public._c10_results values (r, s, null, null, 'send: ' || sqlerrm);
      end;
    end loop;
    for s in 1..senders loop
      begin
        t0 := clock_timestamp();
        select q into res from extensions.dblink_get_result('c10-c' || s) as t(q jsonb);
        ms := round(extract(epoch from clock_timestamp() - t0) * 1000, 1);
        insert into public._c10_results values (r, s, res, ms, null);
      exception when others then
        insert into public._c10_results values (r, s, null, null, 'get: ' || sqlerrm);
      end;
    end loop;
  end loop;
  for s in 1..senders loop
    perform extensions.dblink_disconnect('c10-c' || s);
  end loop;
end
$race$;

drop table if exists public._c10_report;
create table public._c10_report (name text, result text, detail text);
insert into public._c10_report
select 'concurrency_errors',
       case when not exists (select 1 from public._c10_results where err is not null) then 'PASS' else 'FAIL' end,
       coalesce((select string_agg(distinct err, ' | ') from public._c10_results where err is not null), 'none')
union all
select 'no_partial_failure',
       case when not exists (select 1 from public._c10_results where (payload->>'partial_failure')::boolean) then 'PASS' else 'FAIL' end,
       'partial_failure rows=' || (select count(*)::text from public._c10_results where (payload->>'partial_failure')::boolean)
union all
select 'overlap_rejected_or_serialized',
       case when (select count(*) from public._c10_results where (payload->>'skipped')::boolean) > 0 then 'PASS'
            when (select count(*) from public._c10_results where payload is not null) = 18 then 'UNVERIFIED'
            else 'FAIL' end,
       'skipped=' || (select count(*)::text from public._c10_results where (payload->>'skipped')::boolean)
       || ' of ' || (select count(*)::text from public._c10_results where payload is not null)
       || ' calls; max_ms=' || coalesce((select max(ms)::text from public._c10_results), '0')
union all
select 'exactly_once_verdicts',
       case when (select count(*) from public.verdicts where clash_id like 'c10-clash-%') = 600 then 'PASS' else 'FAIL' end,
       'verdicts=' || (select count(*)::text from public.verdicts where clash_id like 'c10-clash-%')
union all
select 'no_duplicate_verdict_per_clash',
       case when not exists (select 1 from public.verdicts where clash_id like 'c10-clash-%' group by clash_id having count(*) > 1) then 'PASS' else 'FAIL' end,
       'max_per_clash=' || coalesce((select max(c)::text from (select count(*) c from public.verdicts where clash_id like 'c10-clash-%' group by clash_id) x), '0')
union all
select 'reputation_events_uniform',
       case when (select count(distinct c) from (select count(*) c from public.reputation_events where clash_id like 'c10-clash-%' group by clash_id) x) <= 1
            then 'PASS' else 'FAIL' end,
       'events=' || (select count(*)::text from public.reputation_events where clash_id like 'c10-clash-%')
union all
select 'reported_settlements_match_work',
       case when coalesce((select sum((payload->>'clashes_settled')::int) from public._c10_results), 0) = 600 then 'PASS' else 'FAIL' end,
       'sum(clashes_settled)=' || coalesce((select sum((payload->>'clashes_settled')::int)::text from public._c10_results), '0');

select result, count(*) as checks from public._c10_report group by 1 order by 1;
select name, result, detail from public._c10_report order by name;

-- Cleanup: remove every harness-owned row and table.
delete from public.verdicts where clash_id like 'c10-clash-%';
delete from public.reputation_events where clash_id like 'c10-clash-%';
delete from public.notifications where entity_id like 'c10-clash-%';
delete from public.judgements where clash_id like 'c10-clash-%';
delete from public.clashes where id like 'c10-clash-%';
delete from public.takes where id like 'c10-take-%';
delete from public.arena_maintenance_failures where item_id like 'c10-%';
drop table public._c10_results;
drop table public._c10_report;
delete from auth.users where id in ('00000000-0000-0000-0000-0000000c10a1','00000000-0000-0000-0000-0000000c10b1','00000000-0000-0000-0000-0000000c10c1');
delete from public.profiles where id like 'c10-%';


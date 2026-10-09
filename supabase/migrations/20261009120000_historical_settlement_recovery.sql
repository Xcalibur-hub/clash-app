-- Operator diagnostics only; no Room/profile/relationship details reach clients.
create table public.arena_maintenance_failures (
 operation text not null check(operation in ('clash_settlement','room_transition')),
 item_id text not null,
 first_failed_at timestamptz not null default clock_timestamp(),
 last_failed_at timestamptz not null default clock_timestamp(),
 failed_attempts integer not null default 1,
 sqlstate text not null check(sqlstate ~ '^[0-9A-Z]{5}$'),
 safe_detail text not null,
 retry_status text not null default 'pending' check(retry_status in ('pending','resolved')),
 resolved_at timestamptz,
 primary key(operation,item_id)
);
alter table public.arena_maintenance_failures enable row level security;
revoke all on public.arena_maintenance_failures from public,anon,authenticated,service_role;
grant select on public.arena_maintenance_failures to service_role;

create function public.record_arena_maintenance_failure(p_operation text,p_item_id text,p_state text)
returns void language plpgsql security definer set search_path='' as $$
begin
 -- Only batch owners call this helper, under the maintenance advisory lock.
 -- Never store MESSAGE_TEXT, DETAIL or CONTEXT: these can contain private data.
 insert into public.arena_maintenance_failures(operation,item_id,sqlstate,safe_detail)
 values(p_operation,p_item_id,p_state,case left(p_state,2)
   when '23' then 'Integrity constraint failure' when '40' then 'Transaction retry required'
   when '42' then 'Authorization or database definition failure'
   when '53' then 'Database resource failure' when '55' then 'Database lock or object unavailable'
   when 'P0' then 'Operation rejected by server rule' else 'Database operation failed' end)
 on conflict(operation,item_id) do update set last_failed_at=clock_timestamp(),
   failed_attempts=least(public.arena_maintenance_failures.failed_attempts,2147483646)+1,
   sqlstate=excluded.sqlstate,safe_detail=excluded.safe_detail,retry_status='pending',resolved_at=null;
 delete from public.arena_maintenance_failures where last_failed_at<clock_timestamp()-interval '7 days';
 delete from public.arena_maintenance_failures where (operation,item_id) in
   (select operation,item_id from public.arena_maintenance_failures
    order by last_failed_at desc,operation,item_id offset 1000);
 perform set_config('clash.maintenance_failures',
   (coalesce(nullif(current_setting('clash.maintenance_failures',true),''),'0')::integer+1)::text,true);
end $$;
revoke all on function public.record_arena_maintenance_failure(text,text,text) from public,anon,authenticated,service_role;

create function public.resolve_arena_maintenance_failure(p_operation text,p_item_id text)
returns void language sql security definer set search_path='' as $$
 update public.arena_maintenance_failures set retry_status='resolved',resolved_at=clock_timestamp()
 where operation=p_operation and item_id=p_item_id and retry_status='pending';
$$;
revoke all on function public.resolve_arena_maintenance_failure(text,text) from public,anon,authenticated,service_role;

-- Patch the installed functions rather than replacing unrelated maintenance work.
-- A nonblocking shared batch lock prevents concurrent batches from deadlocking
-- across Clash/Room/diagnostic rows and makes the 1,000-row cap deterministic.
-- Nested calls in the same transaction reacquire it; an overlapping batch retries
-- on the next existing cron tick. No cron frequency or settlement rule changes.
do $patch$
declare definition text; patched text;
 guard text:=E'\n  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(''arena-maintenance-batch'',0)) then return 0; end if;';
begin
 definition:=replace(pg_get_functiondef('public.settle_due_clashes(integer)'::regprocedure),chr(13),'');
 patched:=replace(definition,E'begin\n  for v_row in',E'begin'||guard||E'\n  for v_row in');
 patched:=replace(patched,'v_settled := v_settled + 1;',
   'v_settled := v_settled + 1; perform public.resolve_arena_maintenance_failure(''clash_settlement'',v_row.id);');
 patched:=replace(patched,'null;  -- a single broken clash never blocks the rest of the batch',
   'perform public.record_arena_maintenance_failure(''clash_settlement'',v_row.id,sqlstate);');
 if patched=definition or position('record_arena_maintenance_failure' in patched)=0
   or position('pg_try_advisory_xact_lock' in patched)=0 then raise exception 'settlement batch anchor changed'; end if;
 execute patched;

 definition:=replace(pg_get_functiondef('public.transition_due_arena_rooms(integer)'::regprocedure),chr(13),'');
 patched:=replace(definition,E'begin\n  update public.arena_daily_topics',E'begin'||guard||E'\n  update public.arena_daily_topics');
 patched:=replace(patched,'exception when others then null; -- Retain existing per-room isolation.',
   E'perform public.resolve_arena_maintenance_failure(''room_transition'',r.id);\n    exception when others then perform public.record_arena_maintenance_failure(''room_transition'',r.id,sqlstate);');
 if patched=definition or position('record_arena_maintenance_failure' in patched)=0
   or position('pg_try_advisory_xact_lock' in patched)=0 then raise exception 'Room batch anchor changed'; end if;
 execute patched;

 definition:=replace(pg_get_functiondef('public.run_maintenance(integer)'::regprocedure),chr(13),'');
 patched:=replace(definition,E'begin\n  select public.settle_due_clashes',E'begin\n'
   ||E'  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(''arena-maintenance-batch'',0)) then\n'
   ||E'    return jsonb_build_object(''skipped'',true,''reason'',''maintenance_in_progress''); end if;\n'
   ||E'  perform set_config(''clash.maintenance_failures'',''0'',true);\n'
   ||E'  delete from public.arena_maintenance_failures where last_failed_at<clock_timestamp()-interval ''7 days'';\n'
   ||E'  update public.arena_maintenance_failures f set retry_status=''resolved'',resolved_at=clock_timestamp()\n'
   ||E'    where f.retry_status=''pending'' and ((f.operation=''clash_settlement'' and exists(select 1 from public.clashes c where c.id=f.item_id and c.status in(''settled'',''cancelled'')))\n'
   ||E'      or (f.operation=''room_transition'' and exists(select 1 from public.arena_rooms r where r.id=f.item_id and r.status in(''SETTLED'',''CANCELLED''))));\n'
   ||E'  select public.settle_due_clashes');
 patched:=replace(patched,E'  return jsonb_build_object(\n',
   E'  update public.arena_maintenance_failures f set retry_status=''resolved'',resolved_at=clock_timestamp()\n'
   ||E'    where f.retry_status=''pending'' and ((f.operation=''clash_settlement'' and exists(select 1 from public.clashes c where c.id=f.item_id and c.status in(''settled'',''cancelled'')))\n'
   ||E'      or (f.operation=''room_transition'' and exists(select 1 from public.arena_rooms r where r.id=f.item_id and r.status in(''SETTLED'',''CANCELLED''))));\n'
   ||E'  return jsonb_build_object(\n');
 patched:=replace(patched,'''clashes_settled'', v_clashes,',
   E'''clashes_settled'', v_clashes,\n'
   ||E'    ''maintenance_item_failures'', coalesce(nullif(current_setting(''clash.maintenance_failures'',true),''''),''0'')::integer,\n'
   ||E'    ''partial_failure'', coalesce(nullif(current_setting(''clash.maintenance_failures'',true),''''),''0'')::integer>0,\n'
   ||E'    ''pending_retry_items'', (select count(*) from public.arena_maintenance_failures where retry_status=''pending''),');
 if patched=definition or position('maintenance_item_failures' in patched)=0
   or position('maintenance_in_progress' in patched)=0 then raise exception 'maintenance summary anchor changed'; end if;
 execute patched;
end $patch$;
-- No additional public/client operation; existing batch EXECUTE grants retained.
notify pgrst,'reload schema';

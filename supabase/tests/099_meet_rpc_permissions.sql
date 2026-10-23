-- E3.4.3: effective ACLs on fresh and historically applied Meet schemas.
-- Run only in an authorized disposable database. All fixtures/roles roll back.
begin;
set local search_path = public, extensions;
set local statement_timeout = '15s';
do $$ begin
  if current_database() !~ '^clash_e325_[a-zA-Z0-9_]+$'
     or current_setting('test.e325_disposable', true) is distinct from 'on' then
    raise exception '099 requires an explicitly authorized disposable clash_e325_* database';
  end if;
end $$;
select no_plan();
reset role;
select set_config('request.jwt.claims', null, true);

-- Independent explicit inventory: do not derive cases from the corrective SQL.
create temporary table e343_rpc_cases(signature text, invocation text) on commit drop;
insert into e343_rpc_cases values
 ('public.ack_meet_video_safety()', 'public.ack_meet_video_safety()'),
 ('public.get_meet_ice_servers()', 'public.get_meet_ice_servers()'),
 ('public.has_meet_video_safety_ack()', 'public.has_meet_video_safety_ack()'),
 ('public.leave_meet_queue()', 'public.leave_meet_queue()'),
 ('public.next_meet(text,public.meet_match_mode,text,public.hood_id,text[],public.meet_channel)',
  $q$public.next_meet('e343-missing','ANYWHERE',null,null,'{}','TEXT')$q$),
 ('public.block_meet_peer(text)', $q$public.block_meet_peer('e343-missing')$q$),
 ('public.get_meet_session(text)', $q$public.get_meet_session('e343-missing')$q$),
 ('public.join_meet_queue(public.meet_match_mode,text,public.hood_id,text[],public.meet_channel)',
  $q$public.join_meet_queue('ANYWHERE',null,null,'{}','TEXT')$q$),
 ('public.leave_meet_session(text,text)', $q$public.leave_meet_session('e343-missing','next')$q$),
 ('public.list_meet_messages(text,integer,timestamptz)', $q$public.list_meet_messages('e343-missing',30,null)$q$),
 ('public.list_meet_signals(text,timestamptz)', $q$public.list_meet_signals('e343-missing',null)$q$),
 ('public.poll_meet_queue()', 'public.poll_meet_queue()'),
 ('public.publish_meet_signal(text,public.meet_signal_kind,jsonb)',
  $q$public.publish_meet_signal('e343-missing','ice','{}')$q$),
 ('public.report_meet_message(text,text,public.report_reason,text)',
  $q$public.report_meet_message('e343-missing','e343-message','other',null)$q$),
 ('public.report_meet_session(text,public.report_reason,text)',
  $q$public.report_meet_session('e343-missing','other',null)$q$),
 ('public.send_meet_message(text,text)', $q$public.send_meet_message('e343-missing','no write')$q$),
 ('public.touch_meet_session(text)', $q$public.touch_meet_session('e343-missing')$q$);

select is(count(*)::integer,17,'explicit inventory covers five legacy and twelve lifecycle RPCs') from e343_rpc_cases;
select is(has_function_privilege('anon',signature,'EXECUTE'),false,'anon denied: '||signature)
 from e343_rpc_cases order by signature;
select is(has_function_privilege('authenticated',signature,'EXECUTE'),true,'authenticated preserved: '||signature)
 from e343_rpc_cases order by signature;
select is(has_function_privilege('service_role',signature,'EXECUTE'),true,'trusted service grant preserved: '||signature)
 from e343_rpc_cases order by signature;
select ok(not exists(select 1 from pg_proc p,
 lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where p.oid=signature::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),
 'no inherited PUBLIC execute: '||signature) from e343_rpc_cases order by signature;

-- Catch permission checks before function-body guards, including guessed IDs.
create role e343_public_probe nologin noinherit;
grant usage on schema public to e343_public_probe;
grant select on e343_rpc_cases to anon, e343_public_probe;
set local role anon;
select throws_ok('select '||invocation, '42501',
 'permission denied for function '||split_part(split_part(signature,'.',2),'(',1),
 'actual anonymous execution rejected: '||signature) from e343_rpc_cases order by signature;
reset role;
set local role e343_public_probe;
select throws_ok('select '||invocation, '42501',
 'permission denied for function '||split_part(split_part(signature,'.',2),'(',1),
 'PUBLIC-only role execution rejected: '||signature) from e343_rpc_cases order by signature;
reset role;

-- Real authenticated legacy calls plus nested owner calls through next_meet.
insert into auth.users(id) values
 ('e3430000-0000-0000-0000-000000000001'),('e3430000-0000-0000-0000-000000000002');
update public.profiles set id='e343-'||case right(auth_user_id::text,1) when '1' then 'a' else 'b' end,
 handle='e343_'||right(auth_user_id::text,1),name='E343 fixture',public_country_code='IN'
 where auth_user_id::text like 'e3430000-0000-0000-0000-%';
insert into public.meet_sessions(id,mode,channel,expires_at)
 values('e343-live','ANYWHERE','TEXT',now()+interval '90 seconds');
insert into public.meet_participants(session_id,profile_id,seat,alias)
 values('e343-live','e343-a','A','A'),('e343-live','e343-b','B','B');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e3430000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is(public.has_meet_video_safety_ack(),false,'owner initially has no acknowledgement');
select is(public.ack_meet_video_safety()->>'acknowledged','true','authenticated safety acknowledgement writes successfully');
select is(public.has_meet_video_safety_ack(),true,'owner can read their acknowledgement');
select is(jsonb_typeof(public.get_meet_ice_servers()->'iceServers'),'array','eligible authenticated ICE retrieval still works');
select is(public.get_meet_session('e343-live')->>'sessionId','e343-live','participant reads their real session');
select is(public.leave_meet_queue()->>'left','true','authenticated legacy queue leave works');
select is(public.next_meet('e343-live','ANYWHERE',null,null,'{}','TEXT')->>'queued','true',
 'next_meet still invokes restricted leave/join RPCs as its trusted owner');
select is(public.get_meet_session('e343-live')->>'status','ended','ended session remains readable to its participant');
select is(public.leave_meet_queue()->>'left','true','new queued entry can be cancelled');
select throws_ok($$select public.moderate_meet_session('e343-live')$$,'42501','staff only','moderation remains staff-only');
select throws_ok($$select public.expire_stale_meet_sessions(1)$$,'42501',
 'permission denied for function expire_stale_meet_sessions','authenticated cannot execute internal sweeper');
reset role;
select is((select count(*)::integer from public.meet_queue where profile_id='e343-a' and status='waiting'),0,'queue cancellation persisted within fixture transaction');
select is((select count(*)::integer from public.meet_participants where session_id='e343-live' and left_at is null),0,'nested leave released both participant seats');

-- No interactive identity is required for trusted background operations.
select set_config('request.jwt.claims',null,true);
set local role service_role;
select lives_ok($$select public.expire_stale_meet_sessions(1)$$,'service sweeper works without an interactive user');
select lives_ok($$select public.cleanup_meet_signals(1)$$,'service cleanup works without an interactive user');
reset role;
select is(has_function_privilege('anon','public.moderate_meet_session(text)','EXECUTE'),false,'existing staff RPC remains anonymous-denied');
select is(has_function_privilege('authenticated','public.moderate_meet_session(text)','EXECUTE'),true,'existing staff RPC keeps authenticated execution');
select * from finish();
rollback;

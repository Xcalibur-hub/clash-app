-- E3.5.1 DRAFT, NOT EXECUTED: requires migration 20261023140000.
-- Real-role and adversarial policy tests, only in a newly authorized disposable DB.
begin;
set local search_path=public,extensions;
set local statement_timeout='15s';
do $$ begin
  if current_database() !~ '^clash_e351_[a-zA-Z0-9_]+$'
     or current_setting('test.e351_disposable',true) is distinct from 'on' then
    raise exception '100 requires an explicitly authorized disposable clash_e351_* database';
  end if;
end $$;
select no_plan();
insert into auth.users(id) values ('e3510000-0000-0000-0000-000000000001'),
 ('e3510000-0000-0000-0000-000000000002'),('e3510000-0000-0000-0000-000000000003');
update public.profiles set id='e351-'||right(auth_user_id::text,1),handle='e351_'||right(auth_user_id::text,1)
 where auth_user_id::text like 'e3510000-0000-0000-0000-%';
insert into public.meet_sessions(id,mode,channel,expires_at)
 values('e351-live','ANYWHERE','TEXT',now()+interval '90 seconds');
insert into public.meet_participants(session_id,profile_id,seat,alias)
 values('e351-live','e351-1','A','A'),('e351-live','e351-2','B','B');

select is(has_function_privilege('anon','public.get_meet_typing(text)','EXECUTE'),false,'anon cannot read typing RPC');
select is(has_function_privilege('anon','public.set_meet_typing(text,boolean)','EXECUTE'),false,'anon cannot write typing RPC');
select is(has_table_privilege('authenticated','public.meet_participants','UPDATE'),false,'cannot forge typing timestamp or sender');
select is((select count(*)::integer from pg_policies where schemaname='realtime' and tablename='messages'
 and policyname in ('meet typing read boundary','meet typing guest boundary','meet typing no client publication') and permissive='RESTRICTIVE'),3,
 'namespace boundaries are restrictive, not OR-able permits');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc
 where oid in ('public.meet_typing_allowed(text)'::regprocedure,'public.get_meet_typing(text)'::regprocedure,
 'public.set_meet_typing(text,boolean)'::regprocedure)),'typing definers pin empty search_path');

-- Intentionally permissive TEST policies prove a sibling policy cannot reopen
-- the namespace. They exist only in this rollback-guarded disposable suite.
create policy "e351 adversarial read" on realtime.messages for select to authenticated
 using (left(realtime.topic(),12)='meet-typing:');
create policy "e351 adversarial write" on realtime.messages for insert to authenticated
 with check (left(realtime.topic(),12)='meet-typing:');
select set_config('realtime.topic','meet-typing:e351-live',true);
insert into realtime.messages(topic,extension,event,payload,private) values
 ('meet-typing:e351-live','presence','e351-fixture','{"userId":"forged"}',true),
 ('meet-typing:e351-live','broadcast','e351-fixture','{}',true),
 ('meet-typing:e351-foreign','broadcast','e351-fixture','{}',true);
set local role anon;
select throws_ok($$select public.get_meet_typing('e351-live')$$,'42501',null,'actual anonymous read denied');
select throws_ok($$select public.set_meet_typing('e351-live',true)$$,'42501',null,'actual anonymous write denied');
reset role;
select set_config('request.jwt.claims','{"sub":"e3510000-0000-0000-0000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select is(public.meet_typing_allowed('e351-live'),false,'unrelated known-ID caller is not admitted');
select throws_ok($$select public.get_meet_typing('e351-live')$$,'42501','conversation unavailable','outsider read denied');
select throws_ok($$select public.set_meet_typing('e351-live',true)$$,'42501','conversation unavailable','outsider publish denied');
select throws_ok($$select public.get_meet_typing('e351-unknown')$$,'42501','conversation unavailable','unknown ID and private ID use same error');
select is((select count(*)::integer from realtime.messages where topic='meet-typing:e351-live'),0,'outsider cannot receive either extension');
reset role;
select set_config('request.jwt.claims','{"sub":"e3510000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(public.get_meet_typing('e351-live')->>'typing','false','own/idle state is not peer typing');
select lives_ok($$select public.set_meet_typing('e351-live',true)$$,'active participant writes server-owned typing');
select is(public.get_meet_typing('e351-live')->>'typing','false','writer does not count their own typing');
select is((select count(*)::integer from realtime.messages where topic='meet-typing:e351-live'
 and extension='presence' and event='e351-fixture'),0,'forged Presence is unreadable despite permissive test policy');
select is((select count(*)::integer from realtime.messages where topic='meet-typing:e351-live'
 and extension='broadcast' and event='e351-fixture'),1,'active participant can receive empty private hint');
select is((select count(*)::integer from realtime.messages where topic='meet-typing:e351-foreign'),0,
 'authorized request topic cannot expose a different topic row');
select throws_ok($$insert into realtime.messages(topic,extension,payload,private)
 values('meet-typing:e351-live','presence','{"userId":"peer"}',true)$$,'42501',null,'cannot spoof peer Presence');
select throws_ok($$insert into realtime.messages(topic,extension,payload,private)
 values('meet-typing:e351-live','broadcast','{"typing":true}',true)$$,'42501',null,'cannot publish client-supplied hints');
select throws_ok($$select public.set_meet_typing('e351-live',null)$$,'22023','typing state required','null state refused');
reset role;
select ok((select typing_until>now() and typing_until<=clock_timestamp()+interval '6 seconds'
 from public.meet_participants where session_id='e351-live' and profile_id='e351-1'),'server bounds typing TTL');
select is((select typing_until is null from public.meet_participants where session_id='e351-live' and profile_id='e351-2'),true,
 'writer cannot choose another participant');
select set_config('request.jwt.claims','{"sub":"e3510000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is(public.get_meet_typing('e351-live')->>'typing','true','other participant observes genuine peer state');
reset role;
update public.meet_participants set typing_until=now()-interval '1 second' where session_id='e351-live';
set local role authenticated;
select is(public.get_meet_typing('e351-live')->>'typing','false','stale typing clears without client disconnect');
reset role;
insert into public.blocks(blocker_id,blocked_id) values('e351-1','e351-2');
set local role authenticated;
select throws_ok($$select public.get_meet_typing('e351-live')$$,'42501',null,'block revokes subsequent authorized reads');
select throws_ok($$select public.set_meet_typing('e351-live',true)$$,'42501',null,'block revokes subsequent writes');
reset role;
delete from public.blocks where blocker_id='e351-1';
update public.meet_participants set left_at=now() where session_id='e351-live' and profile_id='e351-1';
set local role authenticated;
select throws_ok($$select public.get_meet_typing('e351-live')$$,'42501',null,'peer leaving denies reads even with an active session row');
reset role;
update public.meet_participants set left_at=null where session_id='e351-live';
update public.meet_sessions set expires_at=now()-interval '1 second' where id='e351-live';
set local role authenticated;
select throws_ok($$select public.get_meet_typing('e351-live')$$,'42501',null,'lease expiry denies reads before cron');
select throws_ok($$select public.set_meet_typing('e351-live',true)$$,'42501',null,'lease expiry cannot be renewed through typing');
reset role;
update public.meet_sessions set status='ended',expires_at=now()+interval '90 seconds' where id='e351-live';
set local role authenticated;
select throws_ok($$select public.set_meet_typing('e351-live',true)$$,'42501',null,'terminal state remains denied despite a future lease');
reset role;
select set_config('realtime.topic','meet-typing:e351-live:forged',true);
set local role authenticated;
select is((select count(*)::integer from realtime.messages where topic='meet-typing:e351-live'),0,'topic suffix cannot bypass canonical session binding');
reset role;
update public.meet_sessions set status='active',expires_at=now()+interval '90 seconds' where id='e351-live';
set local role authenticated;
select throws_ok($$do $rate$ begin for i in 1..61 loop perform public.set_meet_typing('e351-live',true); end loop; end $rate$;$$,
 'P0001',null,'direct clients cannot bypass server write rate limits');
reset role;
select * from finish();
rollback;

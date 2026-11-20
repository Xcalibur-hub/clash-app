-- Phase 6G.4: actual SET ROLE execution against final installed RPC bodies.
-- Owner creates fictional pre-existing sessions; all fixtures/helpers roll back.
begin;
select no_plan();
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('64000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated',
       'role6g4-'||i||'@example.invalid',now(),'{}','{}',now(),now()
from generate_series(1,6) i;
select id as a from public.profiles where auth_user_id='64000000-0000-4000-8000-000000000001' \gset
select id as b from public.profiles where auth_user_id='64000000-0000-4000-8000-000000000002' \gset
select id as c from public.profiles where auth_user_id='64000000-0000-4000-8000-000000000003' \gset
select id as d from public.profiles where auth_user_id='64000000-0000-4000-8000-000000000004' \gset
select id as e from public.profiles where auth_user_id='64000000-0000-4000-8000-000000000005' \gset
select id as f from public.profiles where auth_user_id='64000000-0000-4000-8000-000000000006' \gset
insert into public.meet_sessions(id,mode,channel,status,created_at,expires_at)
values ('ms_6g4_text','ANYWHERE','TEXT','active',now(),now()+interval '20 minutes'),
       ('ms_6g4_video','ANYWHERE','VIDEO','active',now(),now()+interval '20 minutes');
insert into public.meet_participants(session_id,profile_id,seat,alias)
values ('ms_6g4_text',:'a','A','Fictional A'),('ms_6g4_text',:'b','B','Fictional B'),
       ('ms_6g4_video',:'c','A','Fictional C'),('ms_6g4_video',:'d','B','Fictional D');
insert into public.meet_queue(id,profile_id,mode,channel,status)
values ('mq_6g4_e',:'e','ANYWHERE','TEXT','waiting'),('mq_6g4_f',:'f','ANYWHERE','TEXT','waiting');
insert into public.meet_queue(id,profile_id,mode,channel,status,matched_session_id)
values ('mq_6g4_a',:'a','ANYWHERE','TEXT','matched','ms_6g4_text');
insert into public.meet_video_acks(profile_id) values (:'e');
create temporary table baseline as select
 (select count(*) from public.meet_queue) queues,
 (select count(*) from public.meet_sessions) sessions,
 (select count(*) from public.meet_participants) participants,
 (select expires_at from public.meet_sessions where id='ms_6g4_text') text_deadline,
 (select row_to_json(s)::text from public.meet_sessions s where id='ms_6g4_video') other_session;
grant select on baseline to anon,authenticated,service_role;
create function pg_temp.definer_factory() returns text language sql security definer set search_path='' as $$
 select public.meet_create_session('fictional-a','fictional-b','ANYWHERE',null,null,null,'TEXT');
$$;

set local role anon;
select is(current_user::text,'anon','actual anon database role');
select throws_ok($$select public.join_meet_queue('ANYWHERE')$$,'42501',null,'anon default-argument join denied');
select throws_ok($$select public.poll_meet_queue()$$,'42501',null,'anon poll denied');
select ok(not exists(select 1 from unnest(array['meet_queue','meet_sessions','meet_participants']) t
 where has_table_privilege(current_user,'public.'||t,'INSERT') or has_table_privilege(current_user,'public.'||t,'UPDATE')),'anon has no admission-table INSERT/UPDATE grants');
reset role;
select set_config('request.jwt.claim.sub','64000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"64000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','actual authenticated database role');
select is(public.my_profile_id(),:'e','identity maps to fictional E');
select ok(not exists(select 1 from unnest(array['meet_queue','meet_sessions','meet_participants']) t
 where has_table_privilege(current_user,'public.'||t,'INSERT') or has_table_privilege(current_user,'public.'||t,'UPDATE')),'authenticated has no admission-table INSERT/UPDATE grants');
select throws_ok($$select public.join_meet_queue('ANYWHERE')$$,'P0006',null,'default-argument TEXT admission denied');
select throws_ok($$select public.join_meet_queue('ANYWHERE',null,null,'{}','VIDEO')$$,'P0006',null,'eligible acknowledged VIDEO admission denied');
select throws_ok($$select public.next_meet('ms_6g4_text','ANYWHERE')$$,'P0006',null,'default-argument Next cannot admit');
select is(public.poll_meet_queue()->>'matched','false','actual authenticated poll cannot match waiting peers');
select throws_ok($$select public.try_meet_match('mq_6g4_e')$$,'42501',null,'authenticated cannot call internal matcher');
select throws_ok($$select pg_temp.definer_factory()$$,'P0006',null,'owner SECURITY DEFINER wrapper cannot bypass factory gate');
select throws_ok($$insert into public.meet_queue(profile_id,mode) values ('fictional','ANYWHERE')$$,'42501',null,'authenticated direct queue INSERT denied');
select throws_ok($$update public.meet_sessions set status='ended' where id='ms_6g4_text'$$,'42501',null,'authenticated direct session UPDATE denied');
select throws_ok($$select public.get_meet_session('ms_6g4_text')$$,'P0002',null,'foreign session remains hidden');
select throws_ok($$select public.set_meet_typing('ms_6g4_text',true)$$,'42501',null,'foreign typing denied');
select is(public.cancel_meet_search('mq_6g4_e')->>'outcome','cancelled_waiting','authenticated search cancellation preserved');
reset role;
select is((select count(*) from public.meet_queue),(select queues from baseline),'denials created no queues');
select is((select count(*) from public.meet_sessions),(select sessions from baseline),'denials created no sessions');
select is((select count(*) from public.meet_participants),(select participants from baseline),'denials created no participants');

set local role service_role;
select is(current_user::text,'service_role','actual service_role database role');
select throws_ok($$select public.join_meet_queue('ANYWHERE')$$,'P0006',null,'service-role join RPC still gated');
select is(public.try_meet_match('mq_6g4_f')->>'reason','admission_deferred','service-role matcher cannot create');
select throws_ok($$select public.meet_create_session('a','b','ANYWHERE',null,null,null,'VIDEO')$$,'P0006',null,'service-role factory cannot create');
select throws_ok($$select public.assert_meet_new_admission()$$,'42501',null,'service role cannot invoke private policy helper');
select ok(has_table_privilege(current_user,'public.meet_sessions','INSERT'),'trust boundary: privileged direct INSERT remains granted');
reset role;

select set_config('request.jwt.claim.sub','64000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"64000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(public.get_meet_session('ms_6g4_text')->>'sessionId','ms_6g4_text','participant active session read');
select is(public.join_meet_queue('ANYWHERE')->>'alreadyActive','true','already admitted participant can resume');
select is(public.poll_meet_queue()->'session'->>'sessionId','ms_6g4_text','poll preserves existing-session read');
select throws_ok($$select public.next_meet('ms_6g4_text','ANYWHERE')$$,'P0006',null,'Next denies before leaving an authorized active session');
select is(public.touch_meet_session('ms_6g4_text')->>'active','true','heartbeat remains available');
select lives_ok($$select public.send_meet_message('ms_6g4_text','Fictional QA 6G4 continuation')$$,'existing participant message publication');
select is(jsonb_array_length(public.list_meet_messages('ms_6g4_text')->'items'),1,'permitted message read/history');
select lives_ok($$select public.set_meet_typing('ms_6g4_text',true)$$,'existing participant typing state write');
reset role;
select is((select expires_at from public.meet_sessions where id='ms_6g4_text'),(select text_deadline from baseline),'continuation did not change a healthy lease');
select is((select status::text from public.meet_sessions where id='ms_6g4_text'),'active','blocked Next and reads did not force close');
select set_config('request.jwt.claim.sub','64000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is(public.get_meet_typing('ms_6g4_text')->>'typing','true','authorized peer sees stored typing state');
reset role;
select set_config('request.jwt.claim.sub','64000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.set_meet_typing('ms_6g4_text',false)$$,'typing idle clears');
select is(public.cancel_meet_search('mq_6g4_a')->>'outcome','ended_session','matched-session cancellation remains available under the gate');
select lives_ok($$select public.report_meet_session('ms_6g4_text','harassment','Fictional QA 6G4 report')$$,'report remains available');
select lives_ok($$select public.block_meet_peer('ms_6g4_text')$$,'block remains available');
select is(public.get_meet_session('ms_6g4_text')->>'status','ended','blocked session terminated');
select is(jsonb_array_length(public.list_meet_messages('ms_6g4_text')->'items'),1,'authorized history readable after end');
select throws_ok($$select public.set_meet_typing('ms_6g4_text',true)$$,'42501',null,'ended session typing denied');
reset role;
select is((select status::text from public.meet_queue where id='mq_6g4_a'),'cancelled','matched cancellation fenced its queue');
select is((select count(*) from public.meet_participants where session_id='ms_6g4_text' and left_at is null),0::bigint,'matched cancellation released both participants');
select is((select row_to_json(s)::text from public.meet_sessions s where id='ms_6g4_video'),(select other_session from baseline),'A safety/continuation operations did not mutate unrelated C/D session');

select set_config('request.jwt.claim.sub','64000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select lives_ok($$select public.publish_meet_signal('ms_6g4_video','offer','{"sdp":"fictional QA only"}')$$,'existing video offer signalling remains available');
reset role;
select set_config('request.jwt.claim.sub','64000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select is(jsonb_array_length(public.list_meet_signals('ms_6g4_video')->'items'),1,'authorized peer reads offer');
select lives_ok($$select public.leave_meet_session('ms_6g4_video','leave')$$,'existing participant explicit exit');
reset role;
select set_config('request.jwt.claim.sub','64000000-0000-4000-8000-000000000006',true);
set local role authenticated;
select lives_ok($$select public.leave_meet_queue()$$,'legacy queue leave remains available');
reset role;
select is((select status::text from public.meet_queue where id='mq_6g4_f'),'cancelled','legacy queue leave actually cancelled own waiting row');
select is((select count(*) from public.meet_sessions),(select sessions from baseline),'no new session created by any RPC');
select is((select count(*) from public.meet_participants),(select participants from baseline),'no new participant created by any RPC');
select * from finish();
rollback;

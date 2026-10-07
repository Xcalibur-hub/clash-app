-- Committed fixtures on independent connections: genuinely concurrent RPCs.
-- No fixture in the outer rollback transaction is relied on by remote sessions.
begin;
select no_plan();
create extension if not exists dblink with schema extensions;
-- Supabase's local postgres role is not a superuser; dblink requires TCP
-- password authentication even for local connections. These are CLI dev creds.
select extensions.dblink_connect('p1-c1','host=127.0.0.1 port=5432 user=postgres password=postgres dbname='||current_database());
select extensions.dblink_connect('p1-c2','host=127.0.0.1 port=5432 user=postgres password=postgres dbname='||current_database());
select extensions.dblink_exec('p1-c1',$remote$
 do $fixture$ begin
 delete from public.takes where id='p1-con-take';
 delete from public.arena_daily_topics where title='Concurrent retry proposition';
 delete from public.rate_limit_events where actor_id in('p1-con-a','p1-con-b','p1-con-s');
 delete from public.profiles where id in('p1-con-a','p1-con-b','p1-con-s');
 delete from auth.users where id in('00000000-0000-0000-0000-00000000f201','00000000-0000-0000-0000-00000000f202','00000000-0000-0000-0000-00000000f203');
 insert into auth.users(id) values
 ('00000000-0000-0000-0000-00000000f201'),
 ('00000000-0000-0000-0000-00000000f202'),
 ('00000000-0000-0000-0000-00000000f203');
 update public.profiles set id='p1-con-a',handle='p1_con_a',name='Concurrent A' where auth_user_id='00000000-0000-0000-0000-00000000f201';
 update public.profiles set id='p1-con-b',handle='p1_con_b',name='Concurrent B' where auth_user_id='00000000-0000-0000-0000-00000000f202';
 update public.profiles set id='p1-con-s',handle='p1_con_s',name='Concurrent Spectator' where auth_user_id='00000000-0000-0000-0000-00000000f203';
 insert into public.takes(id,author_id,hood,text) values('p1-con-take','p1-con-a','techtakes','Concurrent retry proposition');
 end $fixture$;
$remote$);
-- Hold the first transaction's advisory key lock while the second request runs.
select extensions.dblink_exec('p1-c1','begin');
create temporary table p1_first as select payload from extensions.dblink('p1-c1',
 $$select public.create_arena_duel('p1-con-take','p1-con-b','00000000-0000-0000-0000-00000000f210')$$) as x(payload jsonb);
select is(extensions.dblink_send_query('p1-c2',
 $$select public.create_arena_duel('p1-con-take','p1-con-b','00000000-0000-0000-0000-00000000f210')$$),1,'second retry starts concurrently');
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('p1-c2'),1,'concurrent retry waits on uncommitted creation');
select extensions.dblink_exec('p1-c1','commit');
create temporary table p1_second as select payload from extensions.dblink_get_result('p1-c2') as x(payload jsonb);
select is((select payload->>'roomId' from p1_second),(select payload->>'roomId' from p1_first),'concurrent retry receives same canonical room');
select is((select payload->>'created' from p1_second),'false','concurrent retry creates nothing');
-- Drain the asynchronous command's final empty result before reusing connection.
select * from extensions.dblink_get_result('p1-c2') as x(payload jsonb);
select is((select count(*)::integer from public.clashes where take_id='p1-con-take'),1,'one Clash after concurrent retry');
select is((select count(*)::integer from public.arena_rooms where clash_id=(select payload->>'clashId' from p1_first)),1,'one Room after concurrent retry');
select is((select count(*)::integer from public.arena_room_participants where room_id=(select payload->>'roomId' from p1_first)),2,'two memberships after concurrent retry');
-- Different idempotency keys must also serialize on the Take lock.
select extensions.dblink_exec('p1-c1',$$update public.clashes set status='cancelled' where take_id='p1-con-take';
 update public.arena_rooms set status='CANCELLED' where clash_id in(select id from public.clashes where take_id='p1-con-take')$$);
select extensions.dblink_exec('p1-c1','begin');
select * from extensions.dblink('p1-c1',
 $$select public.create_arena_duel('p1-con-take','p1-con-b','00000000-0000-0000-0000-00000000f211')$$) as x(payload jsonb);
-- Capture expected conflict as data so a remote exception cannot abort the test.
select extensions.dblink_exec('p1-c2',$remote$
 create function pg_temp.p1_try_duplicate() returns text language plpgsql as $fn$
 begin
 perform public.create_arena_duel('p1-con-take','p1-con-b','00000000-0000-0000-0000-00000000f212');
 return 'unexpected success';
 exception when others then return sqlstate; end $fn$;
$remote$);
select is(extensions.dblink_send_query('p1-c2','select pg_temp.p1_try_duplicate()'),1,'different-key creation starts concurrently');
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('p1-c2'),1,'different key waits on source Take');
select extensions.dblink_exec('p1-c1','commit');
select is((select code from extensions.dblink_get_result('p1-c2') as x(code text)),'P0006','second active pair rejected after first commits');
select * from extensions.dblink_get_result('p1-c2') as x(code text);
select is((select count(*)::integer from public.clashes where take_id='p1-con-take' and status='open'),1,'only one active duel despite different concurrent keys');
-- A ballot admitted before close must survive concurrent Room settlement.
select extensions.dblink_exec('p1-c1',$remote$
 do $clock$ declare v_close timestamptz := clock_timestamp()+interval '5 seconds'; begin
 update public.clashes set opens_at=now()-interval '1 hour',closes_at=v_close where take_id='p1-con-take' and status='open';
 update public.arena_rooms set opens_at=now()-interval '1 hour',closes_at=v_close,status='JUDGING'
  where clash_id in(select id from public.clashes where take_id='p1-con-take' and status='open');
 update public.arena_daily_topics set opens_at=now()-interval '1 hour',final_arguments_at=now()-interval '30 minutes',judging_at=now()-interval '5 minutes',closes_at=v_close
  where id in(select topic_id from public.arena_rooms where clash_id in(select id from public.clashes where take_id='p1-con-take' and status='open'));
 end $clock$;
$remote$);
select extensions.dblink_exec('p1-c1','begin');
select extensions.dblink_exec('p1-c1',$remote$
 do $ballot$ begin
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f203","role":"authenticated"}',true);
 perform public.submit_judgement((select id from public.clashes where take_id='p1-con-take' and status='open'),'A');
 end $ballot$;
$remote$);
select pg_sleep(greatest(0,extract(epoch from (select closes_at from public.clashes where take_id='p1-con-take' and status='open')-clock_timestamp()))+0.1);
select is(extensions.dblink_send_query('p1-c2',
 $$select public.settle_arena_room((select id from public.arena_rooms where clash_id in(select id from public.clashes where take_id='p1-con-take' and status='open')))$$),1,'Room settlement starts concurrently with admitted ballot');
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('p1-c2'),1,'settlement waits on ballot Clash lock');
select extensions.dblink_exec('p1-c1','commit');
create temporary table p1_con_verdict as select payload from extensions.dblink_get_result('p1-c2') as x(payload jsonb);
select * from extensions.dblink_get_result('p1-c2') as x(payload jsonb);
select is((select payload->>'winner_side' from p1_con_verdict),'A','concurrent settlement includes admitted ballot');
select is((select payload->>'jury_size' from p1_con_verdict),'1','accepted ballot counted exactly once');
select is((select count(*)::integer from public.verdicts where clash_id in(select id from public.clashes where take_id='p1-con-take')),1,'concurrent path writes one canonical verdict');
select is((select count(*)::integer from public.arena_room_results where room_id in(select id from public.arena_rooms where clash_id in(select id from public.clashes where take_id='p1-con-take'))),0,'concurrent Room settlement cannot write group outcome');
-- Cleanup committed fixtures via a remote transaction; Take cascades graph.
select extensions.dblink_exec('p1-c1',$$delete from public.takes where id='p1-con-take';
 delete from public.rate_limit_events where actor_id in('p1-con-a','p1-con-b','p1-con-s');
 delete from public.arena_daily_topics where title='Concurrent retry proposition';
 delete from public.profiles where id in('p1-con-a','p1-con-b','p1-con-s');
 delete from auth.users where id in('00000000-0000-0000-0000-00000000f201','00000000-0000-0000-0000-00000000f202','00000000-0000-0000-0000-00000000f203')$$);
select extensions.dblink_disconnect('p1-c1');
select extensions.dblink_disconnect('p1-c2');
select * from finish();
rollback;

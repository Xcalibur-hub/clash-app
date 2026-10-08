-- Independent committed connections prove retry, quota and close serialization.
begin;
select no_plan();
create extension if not exists dblink with schema extensions;
select extensions.dblink_connect('crowd-c1','host=127.0.0.1 port=5432 user=postgres password=postgres dbname='||current_database());
select extensions.dblink_connect('crowd-c2','host=127.0.0.1 port=5432 user=postgres password=postgres dbname='||current_database());
select extensions.dblink_exec('crowd-c1',$remote$
do $fixture$ declare d jsonb; begin
 insert into auth.users(id) values ('00000000-0000-0000-0000-000000003901'),('00000000-0000-0000-0000-000000003902'),('00000000-0000-0000-0000-000000003903');
 update public.profiles set id='crowd-race-a',handle='crowd_race_a' where auth_user_id='00000000-0000-0000-0000-000000003901';
 update public.profiles set id='crowd-race-b',handle='crowd_race_b' where auth_user_id='00000000-0000-0000-0000-000000003902';
 update public.profiles set id='crowd-race-s',handle='crowd_race_s' where auth_user_id='00000000-0000-0000-0000-000000003903';
 insert into public.takes(id,author_id,hood,text) values('crowd-race-take','crowd-race-a','techtakes','Crowd concurrency fixture');
 d:=public.create_arena_duel('crowd-race-take','crowd-race-b','00000000-0000-0000-0000-000000003910');
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000003903","role":"authenticated"}',true);
 perform public.watch_arena_room(d->>'roomId');
end $fixture$;
$remote$);
select * from extensions.dblink('crowd-c1',$$select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000003903","role":"authenticated"}',false)$$) as x(claims text);
select * from extensions.dblink('crowd-c2',$$select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000003903","role":"authenticated"}',false)$$) as x(claims text);
select extensions.dblink_exec('crowd-c1','set role authenticated');
select extensions.dblink_exec('crowd-c2','set role authenticated');
select extensions.dblink_exec('crowd-c1',$remote$
 create function pg_temp.room() returns text language sql as $fn$ select r.id from public.arena_rooms r join public.clashes c on c.id=r.clash_id where c.take_id='crowd-race-take' $fn$;
$remote$);
select extensions.dblink_exec('crowd-c2',$remote$
 create function pg_temp.room() returns text language sql as $fn$ select r.id from public.arena_rooms r join public.clashes c on c.id=r.clash_id where c.take_id='crowd-race-take' $fn$;
 create function pg_temp.attempt(p_key uuid) returns text language plpgsql as $fn$
 begin perform public.post_arena_crowd_message(pg_temp.room(),'Race message',p_key); return 'ok';
 exception when others then return sqlstate; end $fn$;
$remote$);
select extensions.dblink_exec('crowd-c1','begin');
create temporary table crowd_race_first as select payload from extensions.dblink('crowd-c1',
 $$select public.post_arena_crowd_message(pg_temp.room(),'Race message','00000000-0000-0000-0000-000000003920')$$) as x(payload jsonb);
select is(extensions.dblink_send_query('crowd-c2',
 $$select public.post_arena_crowd_message(pg_temp.room(),'Race message','00000000-0000-0000-0000-000000003920')$$),1,'retry starts concurrently');
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('crowd-c2'),1,'retry waits for original transaction');
select extensions.dblink_exec('crowd-c1','commit');
create temporary table crowd_race_retry as select payload from extensions.dblink_get_result('crowd-c2') as x(payload jsonb);
select * from extensions.dblink_get_result('crowd-c2') as x(payload jsonb);
select is((select payload->>'id' from crowd_race_retry),(select payload->>'id' from crowd_race_first),'concurrent retry returns same message');
select is((select count(*)::integer from public.arena_crowd_messages where author_id='crowd-race-s'),1,'only one concurrent retry row');
select is((select count(*)::integer from public.rate_limit_events where actor_id='crowd-race-s' and action='arena_crowd_message'),1,'one quota charge');
select * from extensions.dblink('crowd-c1',$$select public.post_arena_crowd_message(pg_temp.room(),'Race message',gen_random_uuid()) from generate_series(1,3)$$) as x(payload jsonb);
select extensions.dblink_exec('crowd-c1','begin');
select * from extensions.dblink('crowd-c1',$$select public.post_arena_crowd_message(pg_temp.room(),'Race message',gen_random_uuid())$$) as x(payload jsonb);
select is(extensions.dblink_send_query('crowd-c2',$$select pg_temp.attempt(gen_random_uuid())$$),1,'quota contender starts');
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('crowd-c2'),1,'quota contender waits');
select extensions.dblink_exec('crowd-c1','commit');
select is((select code from extensions.dblink_get_result('crowd-c2') as x(code text)),'P0001','concurrent sixth send rejected');
select * from extensions.dblink_get_result('crowd-c2') as x(code text);
select is((select count(*)::integer from public.arena_crowd_messages where author_id='crowd-race-s'),5,'burst remains bounded under concurrency');

-- A queued send observes a cancelled state committed by the exclusive holder.
select extensions.dblink_exec('crowd-c1','reset role');
select extensions.dblink_exec('crowd-c1','begin');
select extensions.dblink_exec('crowd-c1',$$update public.clashes set status='cancelled' where take_id='crowd-race-take';
 update public.arena_rooms set status='CANCELLED' where clash_id in(select id from public.clashes where take_id='crowd-race-take')$$);
select is(extensions.dblink_send_query('crowd-c2',$$select pg_temp.attempt(gen_random_uuid())$$),1,'send races cancellation');
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('crowd-c2'),1,'send waits on canonical Clash lock');
select extensions.dblink_exec('crowd-c1','commit');
select is((select code from extensions.dblink_get_result('crowd-c2') as x(code text)),'42501','waiting send sees cancelled Clash');
select * from extensions.dblink_get_result('crowd-c2') as x(code text);
select is((select count(*)::integer from public.arena_crowd_messages where author_id='crowd-race-s'),5,'closing race creates no late message');
select extensions.dblink_exec('crowd-c1',$$delete from public.takes where id='crowd-race-take';
 delete from public.arena_daily_topics where title='Crowd concurrency fixture';
 delete from public.rate_limit_events where actor_id in('crowd-race-a','crowd-race-b','crowd-race-s');
 delete from public.profiles where id in('crowd-race-a','crowd-race-b','crowd-race-s');
 delete from auth.users where id in('00000000-0000-0000-0000-000000003901','00000000-0000-0000-0000-000000003902','00000000-0000-0000-0000-000000003903')$$);
select extensions.dblink_disconnect('crowd-c1');
select extensions.dblink_disconnect('crowd-c2');
select * from finish();
rollback;

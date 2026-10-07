begin;
select no_plan();
create extension if not exists dblink with schema extensions;
select extensions.dblink_connect('p2-c1','host=127.0.0.1 port=5432 user=postgres password=postgres dbname='||current_database());
select extensions.dblink_connect('p2-c2','host=127.0.0.1 port=5432 user=postgres password=postgres dbname='||current_database());
select extensions.dblink_exec('p2-c1',$remote$
do $fixture$ begin
 delete from public.takes where id in('p2-race-1','p2-race-2');
 delete from public.arena_daily_topics where title='Phase 2 concurrent proposition';
 delete from public.rate_limit_events where actor_id in('p2-race-a','p2-race-b','p2-race-c');
 delete from public.profiles where id in('p2-race-a','p2-race-b','p2-race-c');
 delete from auth.users where id in('00000000-0000-0000-0000-00000000f401','00000000-0000-0000-0000-00000000f402','00000000-0000-0000-0000-00000000f403');
 insert into auth.users(id) values('00000000-0000-0000-0000-00000000f401'),('00000000-0000-0000-0000-00000000f402'),('00000000-0000-0000-0000-00000000f403');
 update public.profiles set id='p2-race-a',handle='p2_race_a',name='Race author' where auth_user_id='00000000-0000-0000-0000-00000000f401';
 update public.profiles set id='p2-race-b',handle='p2_race_b',name='Race challenger' where auth_user_id='00000000-0000-0000-0000-00000000f402';
 update public.profiles set id='p2-race-c',handle='p2_race_c',name='Race competitor' where auth_user_id='00000000-0000-0000-0000-00000000f403';
 insert into public.takes(id,author_id,hood,text) values('p2-race-1','p2-race-a','techtakes','Phase 2 concurrent proposition'),('p2-race-2','p2-race-a','techtakes','Phase 2 concurrent proposition');
end $fixture$;
$remote$);
select * from extensions.dblink('p2-c1',$$select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f402","role":"authenticated"}',false)$$) as x(claims text);
select * from extensions.dblink('p2-c2',$$select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f402","role":"authenticated"}',false)$$) as x(claims text);
select extensions.dblink_exec('p2-c1','set role authenticated');
select extensions.dblink_exec('p2-c2','set role authenticated');
select extensions.dblink_exec('p2-c1','begin');
create temporary table p2_race_first as select payload from extensions.dblink('p2-c1',
 $$select public.create_arena_challenge('p2-race-1','A thoughtful counter-position for concurrent creation.')$$) as x(payload jsonb);
select is(extensions.dblink_send_query('p2-c2',
 $$select public.create_arena_challenge('p2-race-1','A thoughtful counter-position for concurrent creation.')$$),1,'double create starts on independent connection');
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('p2-c2'),1,'double create waits on uncommitted Take transaction');
select extensions.dblink_exec('p2-c1','commit');
create temporary table p2_race_retry as select payload from extensions.dblink_get_result('p2-c2') as x(payload jsonb);
select * from extensions.dblink_get_result('p2-c2') as x(payload jsonb);
select is((select payload->>'id' from p2_race_retry),(select payload->>'id' from p2_race_first),'double create returns same Challenge');
select is((select payload->>'created' from p2_race_retry),'false','retry creates nothing');
select is((select count(*)::integer from public.arena_challenges where take_id='p2-race-1'),1,'one logical pending Challenge');
select is((select count(*)::integer from public.notifications where recipient_id='p2-race-a' and kind='challenge_received'),1,'one received notification');
select is((select count(*)::integer from public.rate_limit_events where actor_id='p2-race-b' and action='arena_challenge_create'),1,'one throttle event');

-- Two Accept taps on the same committed offer, with the first held uncommitted.
select * from extensions.dblink('p2-c1',$$select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f401","role":"authenticated"}',false)$$) as x(claims text);
select * from extensions.dblink('p2-c2',$$select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f401","role":"authenticated"}',false)$$) as x(claims text);
select extensions.dblink_exec('p2-c1','begin');
create temporary table p2_race_accept as select payload from extensions.dblink('p2-c1',
 format('select public.resolve_arena_challenge(%L::uuid,''ACCEPT'')',(select payload->>'id' from p2_race_first))) as x(payload jsonb);
select is(extensions.dblink_send_query('p2-c2',
 format('select public.resolve_arena_challenge(%L::uuid,''ACCEPT'')',(select payload->>'id' from p2_race_first))),1,'double accept starts concurrently');
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('p2-c2'),1,'second accept waits on first transaction');
select extensions.dblink_exec('p2-c1','commit');
create temporary table p2_race_accept_retry as select payload from extensions.dblink_get_result('p2-c2') as x(payload jsonb);
select * from extensions.dblink_get_result('p2-c2') as x(payload jsonb);
select is((select payload->>'roomId' from p2_race_accept_retry),(select payload->>'roomId' from p2_race_accept),'same Room under double accept');
select is((select payload->>'created' from p2_race_accept_retry),'false','accept retry creates nothing');
select is((select count(*)::integer from public.clashes where take_id='p2-race-1'),1,'one Clash under double accept');
select is((select count(*)::integer from public.arena_rooms where clash_id=(select payload->>'clashId' from p2_race_accept)),1,'one Room under double accept');
select is((select count(*)::integer from public.arena_room_participants where room_id=(select payload->>'roomId' from p2_race_accept) and role='debater'),2,'two fighters under double accept');
select is((select count(*)::integer from public.notifications where recipient_id='p2-race-b' and kind='challenge_accepted'),1,'one accepted notification under double accept');

-- Different challengers accepted concurrently against one Take.
select * from extensions.dblink('p2-c1',$$select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f402","role":"authenticated"}',false)$$) as x(claims text);
create temporary table p2_competing_b as select payload from extensions.dblink('p2-c1',
 $$select public.create_arena_challenge('p2-race-2','The first competing challenger offers this counter-position.')$$) as x(payload jsonb);
select * from extensions.dblink('p2-c1',$$select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f403","role":"authenticated"}',false)$$) as x(claims text);
create temporary table p2_competing_c as select payload from extensions.dblink('p2-c1',
 $$select public.create_arena_challenge('p2-race-2','The other competing challenger offers a counter-position.')$$) as x(payload jsonb);
select * from extensions.dblink('p2-c1',$$select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f401","role":"authenticated"}',false)$$) as x(claims text);
select extensions.dblink_exec('p2-c1','begin');
create temporary table p2_competing_winner as select payload from extensions.dblink('p2-c1',
 format('select public.resolve_arena_challenge(%L::uuid,''ACCEPT'')',(select payload->>'id' from p2_competing_b))) as x(payload jsonb);
select is(extensions.dblink_send_query('p2-c2',
 format('select public.resolve_arena_challenge(%L::uuid,''ACCEPT'')',(select payload->>'id' from p2_competing_c))),1,'competing accept starts concurrently');
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('p2-c2'),1,'competing accept waits on shared Take');
select extensions.dblink_exec('p2-c1','commit');
create temporary table p2_competing_loser as select payload from extensions.dblink_get_result('p2-c2') as x(payload jsonb);
select * from extensions.dblink_get_result('p2-c2') as x(payload jsonb);
select is((select payload->>'status' from p2_competing_winner),'ACCEPTED','one winning Challenge');
select is((select payload->>'status' from p2_competing_loser),'CANCELLED','losing Challenge terminal');
select ok((select payload->>'roomId' is null from p2_competing_loser),'loser has no phantom Room');
select is((select count(*)::integer from public.clashes where take_id='p2-race-2' and status='open'),1,'only one active canonical duel per Take');
select is((select count(*)::integer from public.arena_challenges where take_id='p2-race-2' and status='PENDING'),0,'no incompatible actionable offers');
select is((select count(*)::integer from public.arena_challenges where take_id='p2-race-2' and status='ACCEPTED'),1,'exactly one accepted offer');
select is((select count(*)::integer from public.notifications where kind='challenge_accepted' and recipient_id in('p2-race-b','p2-race-c')),2,'one accepted notification per actual duel');
select is((select count(*)::integer from public.clashes c left join public.arena_rooms r on r.clash_id=c.id where c.take_id in('p2-race-1','p2-race-2') and r.id is null),0,'no orphan Clash');
select is((select count(*)::integer from public.arena_rooms r join public.clashes c on c.id=r.clash_id where c.take_id in('p2-race-1','p2-race-2')),2,'no extra or orphan Rooms');
select extensions.dblink_exec('p2-c1','reset role');
select extensions.dblink_exec('p2-c1',$$delete from public.takes where id in('p2-race-1','p2-race-2');
 delete from public.arena_daily_topics where title='Phase 2 concurrent proposition';
 delete from public.rate_limit_events where actor_id in('p2-race-a','p2-race-b','p2-race-c');
 delete from public.profiles where id in('p2-race-a','p2-race-b','p2-race-c');
 delete from auth.users where id in('00000000-0000-0000-0000-00000000f401','00000000-0000-0000-0000-00000000f402','00000000-0000-0000-0000-00000000f403')$$);
select extensions.dblink_disconnect('p2-c1');
select extensions.dblink_disconnect('p2-c2');
select * from finish();
rollback;

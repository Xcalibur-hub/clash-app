begin;
select no_plan();
create extension if not exists dblink with schema extensions;
select extensions.dblink_connect('question-one','host=127.0.0.1 port=5432 user=postgres password=postgres dbname='||current_database());
select extensions.dblink_connect('question-two','host=127.0.0.1 port=5432 user=postgres password=postgres dbname='||current_database());
select extensions.dblink_exec('question-one',$setup$
do $fixture$ begin
 if exists(select 1 from profiles where id in('question-race-a','question-race-b')) then raise exception 'Owned concurrency fixture already exists; inspect before cleanup'; end if;
 insert into auth.users(id) values('00000000-0000-0000-0000-00000000a781'),('00000000-0000-0000-0000-00000000a782');
 update profiles set id='question-race-a',handle='question_race_a' where auth_user_id='00000000-0000-0000-0000-00000000a781';
 update profiles set id='question-race-b',handle='question_race_b' where auth_user_id='00000000-0000-0000-0000-00000000a782';
 insert into takes(id,author_id,hood,text,question_a,question_b,question_origin,question_review_status,is_runtime_fixture)
 values('question-race-take','question-race-a','techtakes','Owned concurrency fixture','Yes','No','human','not_required',true);
end $fixture$;
$setup$);
select * from extensions.dblink('question-one',$$select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a781","role":"authenticated"}',false)$$) as x(value text);
select * from extensions.dblink('question-two',$$select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a781","role":"authenticated"}',false)$$) as x(value text);
select extensions.dblink_exec('question-one','set role authenticated');
select extensions.dblink_exec('question-two','set role authenticated');
select extensions.dblink_exec('question-one','begin');
create temporary table question_first as select payload from extensions.dblink('question-one',$$select vote_arena_question('question-race-take','A',0)$$) as x(payload jsonb);
select is(extensions.dblink_send_query('question-two',$$select vote_arena_question('question-race-take','A',0)$$),1,'concurrent same-choice retry started');
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('question-two'),1,'retry waits for first vote transaction');
select extensions.dblink_exec('question-one','commit');
create temporary table question_retry as select payload from extensions.dblink_get_result('question-two') as x(payload jsonb);
select * from extensions.dblink_get_result('question-two') as x(payload jsonb);
select is((select payload->>'revision' from question_retry),'1','concurrent retry returns one original revision');
select is((select count(*)::int from arena_question_votes where take_id='question-race-take'),1,'same-identity race leaves one vote');
select is((select count(*)::int from rate_limit_events where actor_id='question-race-a' and action='arena_question_vote'),1,'same-side race charges one quota');
-- Different identities serialize totals without losing either choice.
select * from extensions.dblink('question-two',$$select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a782","role":"authenticated"}',false)$$) as x(value text);
select extensions.dblink_exec('question-one','begin');
select * from extensions.dblink('question-one',$$select vote_arena_question('question-race-take','B',1)$$) as x(payload jsonb);
select extensions.dblink_send_query('question-two',$$select vote_arena_question('question-race-take','A',0)$$);
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('question-two'),1,'different-identity vote waits on authoritative source lock');
select extensions.dblink_exec('question-one','commit');
create temporary table question_both as select payload from extensions.dblink_get_result('question-two') as x(payload jsonb);
select * from extensions.dblink_get_result('question-two') as x(payload jsonb);
select is((select payload->>'total' from question_both),'2','concurrent identities retain total two');
select is((select payload->>'countA' from question_both),(select payload->>'countB' from question_both),'concurrent genuine tie preserved');
-- Conflicting same-revision intent must not silently overwrite a later choice.
select * from extensions.dblink('question-two',$$select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a781","role":"authenticated"}',false)$$) as x(value text);
select extensions.dblink_exec('question-one','begin');
select * from extensions.dblink('question-one',$$select vote_arena_question('question-race-take','A',2)$$) as x(payload jsonb);
select extensions.dblink_send_query('question-two',$$select vote_arena_question('question-race-take','B',2)$$);
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('question-two'),1,'opposite-choice stale revision genuinely overlaps');
select extensions.dblink_exec('question-one','commit');
select * from extensions.dblink_get_result('question-two',false) as x(payload jsonb);
select ok(position('Vote changed.' in extensions.dblink_error_message('question-two'))>0,'stale concurrent choice fails with conflict');
select * from extensions.dblink_get_result('question-two',false) as x(payload jsonb);
select is((select side from arena_question_votes where take_id='question-race-take' and voter_id='question-race-a'),'A','conflict cannot overwrite committed vote');
select is((select count(*)::int from rate_limit_events where actor_id='question-race-a' and action='arena_question_vote'),3,'conflict does not charge quota');
-- A removal committed during lock wait is rechecked before any write.
select extensions.dblink_exec('question-one','reset role');
select extensions.dblink_exec('question-one','begin');
select extensions.dblink_exec('question-one',$$update takes set status='removed' where id='question-race-take'$$);
select extensions.dblink_send_query('question-two',$$select vote_arena_question('question-race-take','B',3)$$);
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('question-two'),1,'vote waits for in-progress source moderation');
select extensions.dblink_exec('question-one','commit');
select * from extensions.dblink_get_result('question-two',false) as x(payload jsonb);
select ok(position('Question unavailable' in extensions.dblink_error_message('question-two'))>0,'removed source denied after lock wait');
select * from extensions.dblink_get_result('question-two',false) as x(payload jsonb);
select is((select side from arena_question_votes where take_id='question-race-take' and voter_id='question-race-a'),'A','removed source wait leaves vote unchanged');
select extensions.dblink_exec('question-one',$cleanup$
delete from takes where id='question-race-take' and author_id='question-race-a' and is_runtime_fixture;
delete from rate_limit_events where actor_id in('question-race-a','question-race-b');
delete from profiles where id in('question-race-a','question-race-b');
delete from auth.users where id in('00000000-0000-0000-0000-00000000a781','00000000-0000-0000-0000-00000000a782');
$cleanup$);
select extensions.dblink_disconnect('question-one');
select extensions.dblink_disconnect('question-two');
select * from finish();
rollback;

begin;
select no_plan();
create extension if not exists dblink with schema extensions;
select extensions.dblink_connect('editorial-one','host=127.0.0.1 port=5432 user=postgres password=postgres dbname='||current_database());
select extensions.dblink_connect('editorial-two','host=127.0.0.1 port=5432 user=postgres password=postgres dbname='||current_database());
select extensions.dblink_exec('editorial-one',$setup$
do $guard$ begin
 if exists(select 1 from profiles where id='ed-race-admin') or exists(select 1 from arena_editorial_sources where id='ed-race-source') then raise exception 'Owned editorial concurrency fixtures already exist; inspect before cleanup'; end if;
end $guard$;
create temporary table ed_saved_config as select * from arena_editorial_config;
insert into auth.users(id) values('00000000-0000-0000-0000-00000000e801');
update profiles set id='ed-race-admin',role='admin' where auth_user_id='00000000-0000-0000-0000-00000000e801';
update arena_editorial_config set mode='REVIEW_ONLY',paused=false,publisher_id='ed-race-admin',daily_cap=6,category_cap=5;
insert into arena_editorial_sources(id,adapter,feed_url,link_host,publisher_group,category,credibility,enabled) values('ed-race-source','json','https://race.example.org/feed','race.example.org','race-owner','technology',0.9,true);
insert into arena_trend_candidates(id,topic_key,tokens,title,summary,category,status,generation_version,approved_by,approved_version,is_runtime_fixture)
 select ('00000000-0000-0000-0000-00000000e81'||n)::uuid,'ed-race-'||n,array['editorial','concurrency','fixture'],'Owned editorial concurrency fixture '||n,'Owned rollback/race context','technology','approved',1,'ed-race-admin',1,true from generate_series(1,2) n;
insert into arena_trend_observations(candidate_id,source_id,url,title,summary,published_at) select id,'ed-race-source','https://race.example.org/'||id,title,summary,clock_timestamp() from arena_trend_candidates where topic_key in('ed-race-1','ed-race-2');
insert into arena_editorial_drafts(candidate_id,version,question,side_a,side_b,context,confidence,needs_human,blocked,kind,source_urls,provider,model,prompt_version)
 select id,1,'Owned editorial concurrency fixture '||right(topic_key,1)||'?','Choice A','Choice B',summary,0.98,true,false,'editorial',array['https://race.example.org/'||id],'mock','mock','test-1' from arena_trend_candidates where topic_key in('ed-race-1','ed-race-2');
$setup$);
select * from extensions.dblink('editorial-one',$$select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e801","role":"authenticated"}',false)$$) as x(value text);
select * from extensions.dblink('editorial-two',$$select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e801","role":"authenticated"}',false)$$) as x(value text);
select * from extensions.dblink('editorial-one',$$select set_config('ed.obs',(select id::text from arena_trend_observations where candidate_id='00000000-0000-0000-0000-00000000e811'),false)$$) as x(value text);
select extensions.dblink_exec('editorial-one','set role authenticated');
select extensions.dblink_exec('editorial-two','set role authenticated');
select extensions.dblink_exec('editorial-one','begin');
create temporary table ed_first as select payload from extensions.dblink('editorial-one',$$select publish_arena_editorial('00000000-0000-0000-0000-00000000e811',1)$$) as x(payload jsonb);
select is(extensions.dblink_send_query('editorial-two',$$select publish_arena_editorial('00000000-0000-0000-0000-00000000e811',1)$$),1,'second publication request overlaps first');
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('editorial-two'),1,'concurrent publisher waits for config/source transaction');
select extensions.dblink_exec('editorial-one','commit');
create temporary table ed_retry as select payload from extensions.dblink_get_result('editorial-two') as x(payload jsonb);
select * from extensions.dblink_get_result('editorial-two') as x(payload jsonb);
select is((select payload->>'takeId' from ed_retry),(select payload->>'takeId' from ed_first),'concurrent retry returns same Take');
select is((select payload->>'duplicate' from ed_retry),'true','concurrent retry is acknowledged as duplicate');
select is((select count(*)::int from takes where author_id='ed-race-admin'),1,'concurrent publication creates exactly one Take');
select is((select count(*)::int from rate_limit_events where actor_id='ed-race-admin' and action='take_create'),1,'concurrent retry does not double-charge existing Take quota');
select ok((select is_runtime_fixture from takes where author_id='ed-race-admin'),'concurrency fixture stays excluded from ordinary discovery');
-- Withdrawal is serialized with retry; no replacement or reopening is possible.
select extensions.dblink_exec('editorial-one','begin');
select * from extensions.dblink('editorial-one',$$select arena_editorial_admin('withdraw_source',jsonb_build_object('observationId',current_setting('ed.obs')::bigint))$$) as x(payload jsonb);
select extensions.dblink_send_query('editorial-two',$$select publish_arena_editorial('00000000-0000-0000-0000-00000000e811',1)$$);
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('editorial-two'),1,'retry waits for in-progress source withdrawal');
select extensions.dblink_exec('editorial-one','commit');
create temporary table ed_removed as select payload from extensions.dblink_get_result('editorial-two') as x(payload jsonb);
select * from extensions.dblink_get_result('editorial-two') as x(payload jsonb);
select is((select payload->>'status' from ed_removed),'removed','retry truthfully returns removed status');
select is((select count(*)::int from takes where author_id='ed-race-admin'),1,'source withdrawal retry cannot create replacement');
-- Kill switch committed while a fresh publication waits must be rechecked.
select extensions.dblink_exec('editorial-one','begin');
select * from extensions.dblink('editorial-one',$$select arena_editorial_admin('configure','{"mode":"OFF","paused":true}')$$) as x(payload jsonb);
select extensions.dblink_send_query('editorial-two',$$select publish_arena_editorial('00000000-0000-0000-0000-00000000e812',1)$$);
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('editorial-two'),1,'fresh publication overlaps pause transaction');
select extensions.dblink_exec('editorial-one','commit');
select * from extensions.dblink_get_result('editorial-two',false) as x(payload jsonb);
select ok(position('Publication disabled' in extensions.dblink_error_message('editorial-two'))>0,'kill switch revalidated after lock wait');
select * from extensions.dblink_get_result('editorial-two',false) as x(payload jsonb);
select is((select published_take_id from arena_trend_candidates where id='00000000-0000-0000-0000-00000000e812'),null,'paused overlapping publication leaves no Take');
select extensions.dblink_exec('editorial-one','reset role');
select extensions.dblink_exec('editorial-one',$cleanup$
delete from arena_editorial_events where candidate_id in('00000000-0000-0000-0000-00000000e811','00000000-0000-0000-0000-00000000e812') or actor_id='ed-race-admin';
delete from arena_editorial_drafts where candidate_id in('00000000-0000-0000-0000-00000000e811','00000000-0000-0000-0000-00000000e812');
delete from arena_trend_observations where source_id='ed-race-source';
delete from arena_trend_candidates where id in('00000000-0000-0000-0000-00000000e811','00000000-0000-0000-0000-00000000e812') and is_runtime_fixture;
delete from takes where author_id='ed-race-admin' and is_runtime_fixture and id='take_ed_0000000000000000000000000000e811';
delete from arena_editorial_sources where id='ed-race-source';
update arena_editorial_config c set mode=s.mode,paused=s.paused,publisher_id=s.publisher_id,daily_cap=s.daily_cap,category_cap=s.category_cap,generation_cap=s.generation_cap,max_age_hours=s.max_age_hours,run_id=s.run_id,lease_until=s.lease_until from ed_saved_config s where c.id=s.id;
delete from rate_limit_events where actor_id='ed-race-admin';
delete from profiles where id='ed-race-admin' and auth_user_id='00000000-0000-0000-0000-00000000e801';
delete from auth.users where id='00000000-0000-0000-0000-00000000e801';
$cleanup$);
select extensions.dblink_disconnect('editorial-one');
select extensions.dblink_disconnect('editorial-two');
select * from finish();
rollback;

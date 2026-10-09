-- World Phase 1B: direct SELECT must not bypass RPC discovery privacy.
begin;
select no_plan();
reset role;
select set_config('request.jwt.claims', null, true);

insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000009101'),
 ('00000000-0000-0000-0000-000000009102');

update public.profiles set id='world-1b-a',handle='world_1b_a',name='World 1B A'
 where auth_user_id='00000000-0000-0000-0000-000000009101';
update public.profiles set id='world-1b-b',handle='world_1b_b',name='World 1B B'
 where auth_user_id='00000000-0000-0000-0000-000000009102';

insert into public.media_objects
 (id,owner_id,bucket,storage_path,media_kind,mime_type,visibility,status)
values ('world-1b-media','world-1b-a','public-media',
 'world-1b-a/world-1b-media/a.png','image','image/png','public','ready');

insert into public.world_missions(id,title,description,prompt,status,starts_at,ends_at) values('world-1b-mission','Rollback privacy test','Isolated SQL fixture','Test','ACTIVE',now()-interval '1 hour',now()+interval '1 day');
select ok(has_function_privilege('anon','public.world_drop_readable(text)','execute'),
 'guest can use caller-scoped World visibility');
select ok(not has_function_privilege('authenticated','public.world_author_hidden(text,text)','execute'),
 'arbitrary viewer relationship helper remains private');

select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-0000-0000-000000009101","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.world_1b_drop',
 public.create_world_drop('world-1b-mission','world-1b-media','Public test drop',15.4987,73.8278),true);
select is(
 (select count(*)::integer from public.world_drops
   where id=current_setting('test.world_1b_drop')),
 1,'author sees own published World Drop');
reset role;

select set_config('request.jwt.claims', null, true);
set local role anon;
select is(
 (select count(*)::integer from public.world_drops
   where id=current_setting('test.world_1b_drop')),
 1,'anonymous reader sees public ready media');
select ok(public.world_drop_view(current_setting('test.world_1b_drop')) is not null,
 'guest detail sees public World Drop');
select is((select count(*)::integer from jsonb_array_elements(public.world_nearby(15.4987,73.8278,25,50)) item where item->>'id'=current_setting('test.world_1b_drop')),1,'public ready media visible in nearby');
select is((select count(*)::integer from jsonb_array_elements(public.world_mission_drops('world-1b-mission',50)) item where item->>'id'=current_setting('test.world_1b_drop')),1,'public ready media visible in mission');

reset role;

select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-0000-0000-000000009102","role":"authenticated"}',true);
set local role authenticated;
select is(
 (select count(*)::integer from public.world_drops
   where id=current_setting('test.world_1b_drop')),
 1,'other account sees public World Drop before block');
select lives_ok($$ select public.block_profile('world-1b-a') $$,'B blocks A');
select is(
 (select count(*)::integer from public.world_drops
   where id=current_setting('test.world_1b_drop')),
 0,'raw SELECT cannot bypass block');
select is(public.world_drop_view(current_setting('test.world_1b_drop')),null::jsonb,
 'detail RPC cannot bypass block');
select is(public.world_drop_readable(current_setting('test.world_1b_drop')),false,
 'caller-scoped World visibility denies blocked author');
select is(
 (select count(*)::integer
 from jsonb_array_elements(public.world_recent(50)) item
 where item->>'id'=current_setting('test.world_1b_drop')),
 0,'recent RPC excludes blocked author');
select is((select count(*)::integer from jsonb_array_elements(public.world_nearby(15.4987,73.8278,25,50)) item where item->>'id'=current_setting('test.world_1b_drop')),0,'blocked author absent from nearby');
select is((select count(*)::integer from jsonb_array_elements(public.world_mission_drops('world-1b-mission',50)) item where item->>'id'=current_setting('test.world_1b_drop')),0,'blocked author absent from mission');

reset role;

-- Media becomes private/removed after publication: no public discovery.
update public.media_objects set visibility='private', bucket='private-media' where id='world-1b-media';
select set_config('request.jwt.claims', null, true);
set local role anon;
select is(
 (select count(*)::integer from public.world_drops
   where id=current_setting('test.world_1b_drop')),
 0,'raw SELECT excludes newly private media');
select is(public.world_drop_view(current_setting('test.world_1b_drop')),null::jsonb,
 'detail RPC excludes newly private media');
select is(
 (select count(*)::integer
 from jsonb_array_elements(public.world_recent(50)) item
 where item->>'id'=current_setting('test.world_1b_drop')),
 0,'recent RPC excludes newly private media');
select is((select count(*)::integer from jsonb_array_elements(public.world_nearby(15.4987,73.8278,25,50)) item where item->>'id'=current_setting('test.world_1b_drop')),0,'private media absent from nearby');
select is((select count(*)::integer from jsonb_array_elements(public.world_mission_drops('world-1b-mission',50)) item where item->>'id'=current_setting('test.world_1b_drop')),0,'private media absent from mission');

reset role;

reset role;
update public.media_objects set visibility='public',bucket='public-media',deleted_at=now() where id='world-1b-media';
select set_config('request.jwt.claims',null,true);
set local role anon;
select is((select count(*)::int from public.world_drops where id=current_setting('test.world_1b_drop')),0,'deleted media absent from raw SELECT');
select is(public.world_drop_view(current_setting('test.world_1b_drop')),null::jsonb,'deleted media absent from detail');
select is((select count(*)::integer from jsonb_array_elements(public.world_recent(50)) item where item->>'id'=current_setting('test.world_1b_drop')),0,'deleted media absent from recent');
select is((select count(*)::integer from jsonb_array_elements(public.world_nearby(15.4987,73.8278,25,50)) item where item->>'id'=current_setting('test.world_1b_drop')),0,'deleted media absent from nearby');
select is((select count(*)::integer from jsonb_array_elements(public.world_mission_drops('world-1b-mission',50)) item where item->>'id'=current_setting('test.world_1b_drop')),0,'deleted media absent from mission');
reset role;
update public.media_objects set deleted_at=null,status='uploading' where id='world-1b-media';
select set_config('request.jwt.claims',null,true);
set local role anon;
select is((select count(*)::int from public.world_drops where id=current_setting('test.world_1b_drop')),0,'unready media absent from raw SELECT');
select is(public.world_drop_view(current_setting('test.world_1b_drop')),null::jsonb,'unready media absent from detail');
select is((select count(*)::integer from jsonb_array_elements(public.world_recent(50)) item where item->>'id'=current_setting('test.world_1b_drop')),0,'unready media absent from recent');
select is((select count(*)::integer from jsonb_array_elements(public.world_nearby(15.4987,73.8278,25,50)) item where item->>'id'=current_setting('test.world_1b_drop')),0,'unready media absent from nearby');
select is((select count(*)::integer from jsonb_array_elements(public.world_mission_drops('world-1b-mission',50)) item where item->>'id'=current_setting('test.world_1b_drop')),0,'unready media absent from mission');

-- Owners retain the ability to inspect their own published/draft rows.
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-0000-0000-000000009101","role":"authenticated"}',true);
set local role authenticated;
select is(
 (select count(*)::integer from public.world_drops
   where id=current_setting('test.world_1b_drop')),
 1,'author retains own raw row access for management');
reset role;
select * from finish();
rollback;

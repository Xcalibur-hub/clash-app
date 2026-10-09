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

select ok(has_function_privilege('anon','public.world_drop_readable(text)','execute'),
 'guest can use caller-scoped World visibility');
select ok(not has_function_privilege('authenticated','public.world_author_hidden(text,text)','execute'),
 'arbitrary viewer relationship helper remains private');

select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-0000-0000-000000009101","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.world_1b_drop',
 public.create_world_drop(null,'world-1b-media','Public test drop',15.4987,73.8278),true);
select is(
 (select count(*)::integer from public.world_drops
   where id=current_setting('test.world_1b_drop')),
 1,'author sees own published World Drop');
reset role;

set local role anon;
select is(
 (select count(*)::integer from public.world_drops
   where id=current_setting('test.world_1b_drop')),
 1,'anonymous reader sees public ready media');
select ok(public.world_drop_view(current_setting('test.world_1b_drop')) is not null,
 'guest detail sees public World Drop');
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
reset role;

-- Media becomes private/removed after publication: no public discovery.
update public.media_objects set visibility='private' where id='world-1b-media';
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
reset role;

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

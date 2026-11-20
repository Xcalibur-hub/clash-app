begin;
select plan(15);
insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000003201'),
 ('00000000-0000-0000-0000-000000003202'),
 ('00000000-0000-0000-0000-000000003203');
update public.profiles set id='sign-a' where auth_user_id='00000000-0000-0000-0000-000000003201';
update public.profiles set id='sign-b' where auth_user_id='00000000-0000-0000-0000-000000003202';
update public.profiles set id='sign-c' where auth_user_id='00000000-0000-0000-0000-000000003203';
insert into public.takes(id,author_id,hood,text) values('sign-take','sign-a','techtakes','Private assist media authorization');
create temp table sign_duel as select public.create_arena_duel('sign-take','sign-b',gen_random_uuid()) payload;
insert into public.media_objects(id,owner_id,bucket,storage_path,media_kind,mime_type,status,visibility)
 values('sign-media','sign-c','private-media','sign-c/sign-media/image.png','image','image/png','ready','private');
insert into public.arena_private_assists(id,room_id,sender_id,fighter_id,body,media_object_id)
 values('00000000-0000-0000-0000-000000003211',(select payload->>'roomId' from sign_duel),'sign-c','sign-a','Attachment','sign-media');
create function pg_temp.sign_login(n text) returns void language plpgsql as $$begin
 perform set_config('request.jwt.claims',json_build_object('sub','00000000-0000-0000-0000-00000000320'||n,'role','authenticated')::text,true);
end$$;
select ok(not has_function_privilege('anon','public.arena_private_assist_media_target(uuid)','execute'),'guest cannot execute media target');
select ok(not has_function_privilege('service_role','public.arena_private_assist_media_target(uuid)','execute'),'server does not substitute service identity for caller');
select is((select count(*)::integer from pg_policies where schemaname='storage' and policyname='selected fighter may read private assist media'),0,'no assist Storage policy installed');
select pg_temp.sign_login('2');set local role authenticated;
select is(public.arena_private_assist_media_target('00000000-0000-0000-0000-000000003211'),null::jsonb,'other fighter known ID denied');
select pg_temp.sign_login('3');
select is(public.arena_private_assist_media_target('00000000-0000-0000-0000-000000003211'),null::jsonb,'sender cannot access recipient signing API');
select pg_temp.sign_login('1');
select is(public.arena_private_assist_media_target('00000000-0000-0000-0000-000000003211')->>'path','sign-c/sign-media/image.png','selected fighter receives exact private object');
select is(public.arena_private_assist_media_target('00000000-0000-0000-0000-000000003299'),null::jsonb,'unknown ID returns no target');
select public.block_profile('sign-c');
select is(public.arena_private_assist_media_target('00000000-0000-0000-0000-000000003211'),null::jsonb,'block revokes target');
select public.unblock_profile('sign-c');select public.mute_profile('sign-c');
select is(public.arena_private_assist_media_target('00000000-0000-0000-0000-000000003211'),null::jsonb,'mute revokes target');
select public.unmute_profile('sign-c');reset role;
update public.arena_private_assists set status='REJECTED';
set local role authenticated;
select is(public.arena_private_assist_media_target('00000000-0000-0000-0000-000000003211'),null::jsonb,'rejected assist cannot sign');
reset role;update public.arena_private_assists set status='ACCEPTED',hidden_at=now();set local role authenticated;
select is(public.arena_private_assist_media_target('00000000-0000-0000-0000-000000003211'),null::jsonb,'moderation hides target');
reset role;update public.arena_private_assists set hidden_at=null;update public.media_objects set status='deleted' where id='sign-media';set local role authenticated;
select is(public.arena_private_assist_media_target('00000000-0000-0000-0000-000000003211'),null::jsonb,'deleted media cannot sign');
reset role;update public.media_objects set status='ready' where id='sign-media';update public.takes set status='removed' where id='sign-take';set local role authenticated;
select is(public.arena_private_assist_media_target('00000000-0000-0000-0000-000000003211'),null::jsonb,'removed source cannot sign');
reset role;update public.takes set status='active' where id='sign-take';update public.media_objects set owner_id='sign-b' where id='sign-media';set local role authenticated;
select is(public.arena_private_assist_media_target('00000000-0000-0000-0000-000000003211'),null::jsonb,'changed media ownership cannot sign');
reset role;
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid='public.arena_private_assist_media_target(uuid)'::regprocedure),'target has fixed empty search path');
select * from finish();
rollback;

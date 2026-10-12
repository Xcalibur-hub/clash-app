-- Isolated, rolled-back fixtures only. No migration or persistent user changes.
begin;
select no_plan();
insert into auth.users(id) values
 ('cf110004-0000-4000-8000-000000000001'),
 ('cf110004-0000-4000-8000-000000000002'),
 ('cf110004-0000-4000-8000-000000000003');
update public.profiles set id='safety-settings-a',handle='safety_settings_a',name='Safety A' where auth_user_id='cf110004-0000-4000-8000-000000000001';
update public.profiles set id='safety-settings-b',handle='safety_settings_b',name='Safety B' where auth_user_id='cf110004-0000-4000-8000-000000000002';
update public.profiles set id='safety-settings-c',handle='safety_settings_c',name='Safety C' where auth_user_id='cf110004-0000-4000-8000-000000000003';

select ok(not has_function_privilege('anon', 'public.' || n || '(text)', 'execute'), n || ' denies anonymous EXECUTE')
from unnest(array['block_profile','unblock_profile','mute_profile','unmute_profile']) n;
select ok(p.prosecdef and p.proconfig @> array['search_path=""'] and pg_get_function_arguments(p.oid)='p_target_id text', p.proname || ' derives actor and pins search_path')
from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
where ns.nspname='public' and p.proname in ('block_profile','unblock_profile','mute_profile','unmute_profile');
select ok(not has_table_privilege('authenticated','public.blocks','INSERT,UPDATE,DELETE'),'block table DML unavailable');
select ok(not has_table_privilege('authenticated','public.mutes','INSERT,UPDATE,DELETE'),'mute table DML unavailable');

set local role anon;
select throws_ok($$select public.block_profile('safety-settings-b')$$,'42501',null,'guest cannot block');
select throws_ok($$select public.unblock_profile('safety-settings-b')$$,'42501',null,'guest cannot unblock');
select throws_ok($$select public.mute_profile('safety-settings-b')$$,'42501',null,'guest cannot mute');
select throws_ok($$select public.unmute_profile('safety-settings-b')$$,'42501',null,'guest cannot unmute');
reset role;
select set_config('request.jwt.claims','{"sub":"cf110004-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select lives_ok($$select public.block_profile('safety-settings-b')$$,'block succeeds');
select lives_ok($$select public.block_profile('safety-settings-b')$$,'repeated block succeeds idempotently');
select results_eq($$select blocked_id from public.blocks where blocker_id=public.my_profile_id() order by blocked_id limit 51$$,$$values ('safety-settings-b'::text)$$,'own blocked list has one target');
select lives_ok($$select public.mute_profile('safety-settings-b')$$,'mute succeeds');
select lives_ok($$select public.mute_profile('safety-settings-b')$$,'repeated mute succeeds idempotently');
select results_eq($$select muted_id from public.mutes where muter_id=public.my_profile_id() order by muted_id limit 51$$,$$values ('safety-settings-b'::text)$$,'own muted list has one target');
select results_eq($$select id,name,handle from public.profiles where id='safety-settings-b'$$,$$values ('safety-settings-b'::text,'Safety B'::text,'safety_settings_b'::text)$$,'minimal public identity remains available for safety management');
select throws_ok($$select auth_user_id from public.profiles where id='safety-settings-b'$$,'42501',null,'identity projection cannot expose account linkage');
select throws_ok($$insert into public.mutes(muter_id,muted_id) values ('safety-settings-c','safety-settings-a')$$,'42501',null,'cannot forge another owner relationship');
reset role;
select set_config('request.jwt.claims','{"sub":"cf110004-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select is_empty($$select * from public.blocks where blocker_id='safety-settings-a'$$,'unrelated account cannot probe blocked list');
select is_empty($$select * from public.mutes where muter_id='safety-settings-a'$$,'unrelated account cannot probe muted list');
select lives_ok($$select public.unblock_profile('safety-settings-b')$$,'other account unblock is a no-op');
select lives_ok($$select public.unmute_profile('safety-settings-b')$$,'other account unmute is a no-op');
reset role;
select set_config('request.jwt.claims','{"sub":"cf110004-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.blocks where blocker_id=public.my_profile_id()),1::bigint,'other account cannot remove block');
select is((select count(*) from public.mutes where muter_id=public.my_profile_id()),1::bigint,'other account cannot remove mute');
select lives_ok($$select public.unblock_profile('safety-settings-b')$$,'owner unblocks');
select lives_ok($$select public.unblock_profile('safety-settings-b')$$,'repeat unblock is safe');
select is_empty($$select * from public.blocks where blocker_id=public.my_profile_id()$$,'unblocked target removed from list');
select lives_ok($$select public.unmute_profile('safety-settings-b')$$,'owner unmutes');
select lives_ok($$select public.unmute_profile('safety-settings-b')$$,'repeat unmute is safe');
select is_empty($$select * from public.mutes where muter_id=public.my_profile_id()$$,'unmuted target removed from list');
reset role;
select * from finish();
rollback;

begin;
select no_plan();
insert into auth.users(id) values ('00000000-0000-0000-0000-000000006401'),('00000000-0000-0000-0000-000000006402'),('00000000-0000-0000-0000-000000006403');
update public.profiles set id='discovery-a' where auth_user_id='00000000-0000-0000-0000-000000006401';
update public.profiles set id='discovery-b' where auth_user_id='00000000-0000-0000-0000-000000006402';
update public.profiles set id='discovery-outsider' where auth_user_id='00000000-0000-0000-0000-000000006403';
insert into public.takes(id,author_id,hood,text) select 'discovery-'||n,'discovery-a','techtakes','Discovery regression source' from generate_series(1,7) n;
insert into public.clashes(id,take_id,challenger_id,status,opens_at,closes_at) values
 ('discovery-live','discovery-1','discovery-b','open',now()-interval '1 minute',now()+interval '30 minutes'),
 ('discovery-upcoming','discovery-2','discovery-b','open',now()+interval '10 minutes',now()+interval '40 minutes'),
 ('discovery-closed','discovery-3','discovery-b','open',now()-interval '40 minutes',now()-interval '10 minutes'),
 ('discovery-cancelled','discovery-4','discovery-b','cancelled',now()-interval '1 minute',now()+interval '30 minutes'),
 ('discovery-fixture','discovery-5','discovery-b','open',now()-interval '1 minute',now()+interval '30 minutes'),
 ('discovery-removed','discovery-6','discovery-b','open',now()-interval '1 minute',now()+interval '30 minutes');
update public.takes set is_runtime_fixture=true where id='discovery-5';
update public.takes set status='removed' where id='discovery-6';
select ok(not has_function_privilege('anon','public.list_arena_clash_discovery()','execute'),'anonymous discovery RPC denied');
select ok(not has_column_privilege('authenticated','public.takes','is_runtime_fixture','update'),'fixture flag is server controlled');
select ok(not (select prosecdef from pg_proc where oid='public.list_arena_clash_discovery()'::regprocedure),'discovery uses caller table RLS');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000006402","role":"authenticated"}',true);
set local role authenticated;
select lives_ok($$select public.create_arena_challenge('discovery-7','This is a legitimate pending counter-position.')$$,'pending created without duel');
select is((select e->>'state' from jsonb_array_elements(public.list_arena_clash_discovery()) e where e->>'id'='discovery-live'),'LIVE','live clock on server');
select is((select e->>'state' from jsonb_array_elements(public.list_arena_clash_discovery()) e where e->>'id'='discovery-upcoming'),'UPCOMING','future opening remains upcoming');
select is((select e->>'state' from jsonb_array_elements(public.list_arena_clash_discovery()) e where e->>'id'='discovery-closed'),'COMPLETED','elapsed unsettled Clash is not live');
select is((select e->>'state' from jsonb_array_elements(public.list_arena_clash_discovery()) e where e->>'id'='discovery-cancelled'),'COMPLETED','cancelled never live');
select is((select count(*)::integer from jsonb_array_elements(public.list_arena_clash_discovery()) e where e->>'id' in ('discovery-fixture','discovery-removed')),0,'fixtures and removed source excluded');
select is((select e->>'state' from jsonb_array_elements(public.list_arena_clash_discovery()) e where e->>'takeId'='discovery-7'),'PENDING','party sees pending under Pending');
select ok((select e->>'roomId' is null from jsonb_array_elements(public.list_arena_clash_discovery()) e where e->>'takeId'='discovery-7'),'pending has no Room');
select ok(public.clash_view('discovery-fixture') is not null,'fixture still available directly for verification');
select throws_ok($$update public.takes set is_runtime_fixture=false where id='discovery-5'$$,'42501',null,'client cannot republish fixture');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000006403","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from jsonb_array_elements(public.list_arena_clash_discovery()) e where e->>'takeId'='discovery-7'),0,'account switch loses unrelated pending access');
reset role;
insert into public.blocks(blocker_id,blocked_id) values('discovery-outsider','discovery-a');
set local role authenticated;
select is((select count(*)::integer from jsonb_array_elements(public.list_arena_clash_discovery()) e where e->>'id' like 'discovery-%'),0,'blocked author filtered by caller RLS');
reset role;
select * from finish();
rollback;

begin;
select no_plan();
create extension if not exists dblink with schema extensions;
select extensions.dblink_connect('interest-c1','host=127.0.0.1 port=5432 user=postgres password=postgres dbname='||current_database());
select extensions.dblink_connect('interest-c2','host=127.0.0.1 port=5432 user=postgres password=postgres dbname='||current_database());
-- This UUID belongs exclusively to this test. Refuse to overwrite a leftover.
select extensions.dblink_exec('interest-c1',$$insert into auth.users(id) values('00000000-0000-0000-0000-000000006701')$$);
select extensions.dblink_exec('interest-c1',$$do $b$ begin perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000006701","role":"authenticated"}',false);end $b$;set role authenticated;begin;$$);
select extensions.dblink_exec('interest-c2',$$do $b$ begin perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000006701","role":"authenticated"}',false);end $b$;set role authenticated;
create function pg_temp.try_interest_save() returns text language plpgsql as $fn$
begin perform public.save_my_arena_interests(array['business','gaming','education'],false,0);return 'unexpected';exception when others then return sqlstate;end $fn$;$$);
select * from extensions.dblink('interest-c1',$$select public.save_my_arena_interests(array['technology','film','sport'],false,0)$$) as x(payload jsonb);
select is(extensions.dblink_send_query('interest-c2','select pg_temp.try_interest_save()'),1,'parallel first save starts');
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('interest-c2'),1,'second session waits for first transaction');
select extensions.dblink_exec('interest-c1','commit');
select is((select code from extensions.dblink_get_result('interest-c2') as x(code text)),'PT409','parallel stale save rejected');
select * from extensions.dblink_get_result('interest-c2') as x(code text);
select is((select count(*)::integer from public.arena_interest_preferences where auth_user_id='00000000-0000-0000-0000-000000006701'),1,'one durable owner row');
select is((select revision::integer from public.arena_interest_preferences where auth_user_id='00000000-0000-0000-0000-000000006701'),1,'losing save cannot advance revision');
select is((select cardinality(topic_ids) from public.arena_interest_preferences where auth_user_id='00000000-0000-0000-0000-000000006701'),3,'no partial replacement');
select extensions.dblink_exec('interest-c1','begin');
select * from extensions.dblink('interest-c1',$$select public.save_my_arena_interests(array['technology','education','business'],false,1)$$) as x(payload jsonb);
select extensions.dblink_exec('interest-c2',$$create or replace function pg_temp.try_interest_save() returns text language plpgsql as $fn$
begin perform public.save_my_arena_interests('{}',true,1);return 'unexpected';exception when others then return sqlstate;end $fn$;$$);
select is(extensions.dblink_send_query('interest-c2','select pg_temp.try_interest_save()'),1,'parallel replacement starts');
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('interest-c2'),1,'existing preference replacements serialize');
select extensions.dblink_exec('interest-c1','commit');
select is((select code from extensions.dblink_get_result('interest-c2') as x(code text)),'PT409','losing replacement receives HTTP409 conflict');
select * from extensions.dblink_get_result('interest-c2') as x(code text);
select is((select revision::integer from public.arena_interest_preferences where auth_user_id='00000000-0000-0000-0000-000000006701'),2,'only winning replacement advances revision');
-- Remove only the auth/profile/preference fixture this test just created.
select extensions.dblink_exec('interest-c1',$$reset role;delete from public.profiles where auth_user_id='00000000-0000-0000-0000-000000006701';delete from auth.users where id='00000000-0000-0000-0000-000000006701';$$);
select extensions.dblink_disconnect('interest-c1');
select extensions.dblink_disconnect('interest-c2');
select * from finish();
rollback;

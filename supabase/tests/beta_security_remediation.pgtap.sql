-- Disposable PostgreSQL only. Entire fixture graph and all effects roll back.
begin;
select no_plan();
insert into auth.users(id) values
 ('00000000-0000-0000-0000-00000000b101'),('00000000-0000-0000-0000-00000000b102');
update public.profiles set id='beta-a',handle='beta_a' where auth_user_id='00000000-0000-0000-0000-00000000b101';
update public.profiles set id='beta-b',handle='beta_b' where auth_user_id='00000000-0000-0000-0000-00000000b102';
insert into public.takes(id,author_id,hood,text) values
 ('beta-free','beta-a','techtakes','An editable unbound proposition'),
 ('beta-bound','beta-a','techtakes','The original protected proposition'),
 ('beta-expired-offer','beta-a','techtakes','An expired offer may be edited'),
 ('beta-hidden','beta-a','techtakes','A blocked actor is unavailable'),
 ('beta-fixture','beta-a','techtakes','An internal fixture'),
 ('beta-historical','beta-a','techtakes','An intentionally readable historical Take'),
 ('beta-removed','beta-a','techtakes','Removed content remains hidden');
update public.takes set is_runtime_fixture=true where id='beta-fixture';
update public.takes set status='expired',created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id='beta-historical';
update public.takes set status='removed' where id='beta-removed';
create function pg_temp.beta_login(who text) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-0000-0000-00000000b10'||who,'role','authenticated')::text,true)::text;
$$;
create temp table beta_result(payload jsonb);
grant all on beta_result to authenticated;
select pg_temp.beta_login('1');
set local role authenticated;
select is(current_user::text,'authenticated','real ordinary role');
select lives_ok($$update public.takes set text='Edited before any offer' where id='beta-free'$$,'owner edits an unbound Take');
select is((select text from public.takes where id='beta-free'),'Edited before any offer','owner edit persisted within transaction');
select lives_ok($$update public.takes set text=text where id='beta-free'$$,'identity-preserving update allowed');
select pg_temp.beta_login('2');
select lives_ok($$update public.takes set text='Forged edit' where id='beta-free'$$,'RLS silently filters another author');
select is((select text from public.takes where id='beta-free'),'Edited before any offer','challenger cannot rewrite source');
insert into beta_result select public.create_arena_challenge('beta-bound','A different conclusion supported by careful evidence.');
select is((select payload->>'status' from beta_result),'PENDING','canonical challenge still creates pending offer');
select is(public.create_arena_challenge('beta-bound','Do not replace the original counter-position.')->>'created','false','duplicate challenge is idempotent');
select throws_ok($$select public.resolve_arena_challenge((select (payload->>'id')::uuid from beta_result),'ACCEPT')$$,'42501',null,'challenger cannot impersonate author consent');
select pg_temp.beta_login('1');
select throws_ok($$update public.takes set text='Switched proposition' where id='beta-bound'$$,'23514',null,'pending challenge freezes proposition');
select throws_ok($$update public.takes set hood='movies' where id='beta-bound'$$,'23514',null,'pending challenge freezes Hood context');
select lives_ok($$update public.takes set text=text where id='beta-bound'$$,'unchanged bound identity allowed');
update beta_result set payload=public.resolve_arena_challenge((payload->>'id')::uuid,'ACCEPT');
select is((select payload->>'status' from beta_result),'ACCEPTED','author consent creates canonical duel');
select ok((select payload->>'roomId' is not null from beta_result),'server returns real canonical Room');
select lives_ok($$select public.get_arena_room((select payload->>'roomId' from beta_result))$$,'canonical Room read remains usable');
select throws_ok($$update public.takes set text='Changed after acceptance' where id='beta-bound'$$,'23514',null,'accepted duel freezes source');
select is(public.resolve_arena_challenge((select (payload->>'id')::uuid from beta_result),'ACCEPT')->>'roomId',(select payload->>'roomId' from beta_result),'acceptance replay preserves canonical Room');
select pg_temp.beta_login('2');
select throws_ok($$select public.create_arena_challenge('beta-bound','A second invitation must not create another duel.')$$,'P0006',null,'active duel cannot be duplicated');
select throws_ok($$select public.create_arena_challenge('beta-fixture','A fixture must not accept a real challenge.')$$,'P0003',null,'runtime fixture admission denied');
select throws_ok($$select public.start_clash('beta-free',null,'STANDARD')$$,'42501',null,'ordinary actor cannot use consent-free legacy mutation');
reset role;
select lives_ok($$update public.takes set is_runtime_fixture=true where id='beta-bound'$$,'trusted fixture classification is not debate identity');
select lives_ok($$update public.takes set is_runtime_fixture=false where id='beta-bound'$$,'trusted classification can be restored without rewriting content');
select ok(not has_column_privilege('authenticated','public.takes','is_runtime_fixture','UPDATE'),'ordinary owner cannot relabel fixtures');
select throws_ok($$select public.start_clash('beta-free',null,'STANDARD')$$,'42501',null,'owner/DEFINER calls cannot bypass retired body');
select is((select count(*)::integer from public.clashes where take_id='beta-free'),0,'legacy denial leaves no competition');
update public.clashes set status='settled' where id=(select payload->>'clashId' from beta_result);
update public.takes set status='expired' where id='beta-bound';
select pg_temp.beta_login('1');
set local role authenticated;
select throws_ok($$update public.takes set text='Rewrite settled history' where id='beta-bound'$$,'23514',null,'settled historical proposition remains immutable');
select is((select text from public.takes where id='beta-bound'),'The original protected proposition','history retains original proposition');
reset role;
insert into public.arena_challenges(take_id,challenger_id,challenged_id,counter_position,expires_at,created_at)
 values('beta-expired-offer','beta-b','beta-a','A past invitation does not bind a future edited proposition.',now()-interval '1 minute',now()-interval '2 hours');
select pg_temp.beta_login('1');
set local role authenticated;
select lives_ok($$update public.takes set text='Edited after unaccepted offer expired' where id='beta-expired-offer'$$,'expired unaccepted offer releases edit boundary');
select throws_ok($$update public.takes set media_url='https://example.invalid/new.png' where id='beta-free'$$,'42501',null,'direct REST media admission closed');
select throws_ok($$select public.create_take('techtakes','Media rejected',null,'https://example.invalid/new.png')$$,'42501',null,'shared Take API gates media only');
select lives_ok($$select public.create_take('techtakes','A supported public text Take')$$,'supported text creation remains functional');
select lives_ok($$select public.create_comment('beta-free','A supported text discussion reply')$$,'supported discussion remains functional');
select lives_ok($$select public.vault_storefront('beta-a')$$,'Vault read journey still callable');
select lives_ok($$select public.get_my_arena_interests()$$,'onboarding read still callable');
reset role;
insert into public.blocks(blocker_id,blocked_id) values('beta-a','beta-b');
select pg_temp.beta_login('2');
set local role authenticated;
select throws_ok($$select public.create_arena_challenge('beta-hidden','A blocked actor must not send an invitation.')$$,'42501',null,'canonical hidden-actor check preserved');
select is((select count(*)::integer from public.takes where id='beta-hidden'),0,'blocked author hidden');
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select is(current_user::text,'anon','real anonymous role');
select is((select count(*)::integer from public.takes where id='beta-fixture'),0,'fixture hidden from anonymous raw reads');
select is((select count(*)::integer from public.takes where id='beta-removed'),0,'removed Take remains hidden');
select is((select count(*)::integer from public.takes where id='beta-historical'),1,'historical public semantics retained pending product decision');
select is(public.arena_take_readable('beta-fixture'),false,'DEFINER visibility helper also hides fixture');
select throws_ok($$select public.create_arena_challenge('beta-free','Anonymous actor cannot send an invitation.')$$,'42501',null,'anonymous canonical admission denied');
select throws_ok($$select public.start_clash('beta-free')$$,'42501',null,'default-argument legacy invocation denied');
reset role;
select pg_temp.beta_login('1');
set local role authenticated;
select is((select count(*)::integer from public.takes where id='beta-fixture'),0,'fixture hidden even from ordinary owner');
select is((select count(*)::integer from public.takes where id='beta-historical'),1,'authorized owner history retained');
reset role;
select * from finish();
rollback;

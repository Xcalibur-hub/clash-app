begin;
select no_plan();
reset role;
select set_config('request.jwt.claims', null, true);
insert into auth.users(id) values
 ('00000000-0000-0000-0000-00000000f101'),
 ('00000000-0000-0000-0000-00000000f102'),
 ('00000000-0000-0000-0000-00000000f103'),
 ('00000000-0000-0000-0000-00000000f104');
update public.profiles set id='p1-a',handle='p1_a',name='Fighter A' where auth_user_id='00000000-0000-0000-0000-00000000f101';
update public.profiles set id='p1-b',handle='p1_b',name='Fighter B' where auth_user_id='00000000-0000-0000-0000-00000000f102';
update public.profiles set id='p1-s',handle='p1_s',name='Spectator' where auth_user_id='00000000-0000-0000-0000-00000000f103';
update public.profiles set id='p1-mod',handle='p1_mod',name='Moderator',role='moderator' where auth_user_id='00000000-0000-0000-0000-00000000f104';
insert into public.takes(id,author_id,hood,text) values ('p1-take','p1-a','techtakes','Canonical proposition');
insert into public.arena_daily_topics(id,title,status,opens_at,final_arguments_at,judging_at,closes_at)
 values('p1-group-topic','Legacy group compatibility','live',now()-interval '1 hour',now()+interval '20 minutes',now()+interval '25 minutes',now()+interval '30 minutes');
insert into public.arena_rooms(id,topic_id,capacity,opens_at,closes_at)
 values('p1-group-room','p1-group-topic',40,now()-interval '1 hour',now()+interval '30 minutes');
select is(public.get_arena_room('p1-group-room')->>'roomMode','GROUP','legacy group room remains valid');
select is((select capacity from public.arena_rooms where id='p1-group-room'),40,'group capacity remains forty');
select throws_ok($$select public.create_arena_duel('p1-take','p1-a','00000000-0000-0000-0000-00000000f110')$$,'P0001',null,'self duel rejected');
select throws_ok($$select public.create_arena_duel('missing','p1-b','00000000-0000-0000-0000-00000000f110')$$,'P0002',null,'invalid Take rejected');
select throws_ok($$select public.create_arena_duel('p1-take','missing','00000000-0000-0000-0000-00000000f110')$$,'P0002',null,'invalid Fighter B rejected');
insert into public.blocks(blocker_id,blocked_id) values('p1-b','p1-a');
select throws_ok($$select public.create_arena_duel('p1-take','p1-b','00000000-0000-0000-0000-00000000f110')$$,'42501',null,'reverse block prevents creation');
delete from public.blocks where blocker_id='p1-b';
insert into public.mutes(muter_id,muted_id) values('p1-a','p1-b');
select throws_ok($$select public.create_arena_duel('p1-take','p1-b','00000000-0000-0000-0000-00000000f110')$$,'42501',null,'mute prevents creation');
delete from public.mutes where muter_id='p1-a';
create temporary table p1_created as select public.create_arena_duel('p1-take','p1-b','00000000-0000-0000-0000-00000000f110') payload;
grant select on p1_created to authenticated;
create function pg_temp.duel_room() returns text language sql as $$select payload->>'roomId' from p1_created$$;
create function pg_temp.duel_clash() returns text language sql as $$select payload->>'clashId' from p1_created$$;
select is((select count(*)::integer from public.arena_rooms where clash_id=pg_temp.duel_clash()),1,'one canonical room');
select is((select count(*)::integer from public.arena_room_participants where room_id=pg_temp.duel_room() and role='debater'),2,'exactly two fighters');
select ok((select array_agg(profile_id order by profile_id)=array['p1-a','p1-b'] from public.arena_room_participants where room_id=pg_temp.duel_room()),'canonical A and B membership');
select is(public.create_arena_duel('p1-take','p1-b','00000000-0000-0000-0000-00000000f110')->>'roomId',pg_temp.duel_room(),'retry returns same room');
select is(public.create_arena_duel('p1-take','p1-b','00000000-0000-0000-0000-00000000f110')->>'created','false','retry is not creation');
select is((select count(*)::integer from public.rate_limit_events where actor_id='p1-a' and action='arena_duel_create'),1,'retry consumes no additional throttle');
-- Inject a last-step failure; the RPC must roll back Clash, Room and throttles.
insert into public.takes(id,author_id,hood,text) values('p1-failure-take','p1-a','techtakes','Atomic failure proposition');
create function pg_temp.reject_fighter_b() returns trigger language plpgsql as $$begin raise exception 'injected membership failure' using errcode='P0001'; end$$;
create trigger p1_injected_failure before insert on public.arena_room_participants
 for each row when(new.profile_id='p1-b') execute function pg_temp.reject_fighter_b();
select throws_ok($$select public.create_arena_duel('p1-failure-take','p1-b','00000000-0000-0000-0000-00000000f120')$$,'P0001',null,'last membership failure aborts entire creation');
select is((select count(*)::integer from public.clashes where take_id='p1-failure-take'),0,'failed creation leaves no orphan Clash');
select is((select count(*)::integer from public.arena_daily_topics where title='Atomic failure proposition'),0,'failed creation leaves no topic or room infrastructure');
select is((select count(*)::integer from public.rate_limit_events where actor_id='p1-a' and action='arena_duel_create'),1,'failed creation rolls back rate events too');
drop trigger p1_injected_failure on public.arena_room_participants;
select throws_ok($$select public.create_arena_duel('p1-take','p1-s','00000000-0000-0000-0000-00000000f110')$$,'P0006',null,'key cannot be reused for another matchup');
select throws_ok($$select public.create_arena_duel('p1-take','p1-b','00000000-0000-0000-0000-00000000f111')$$,'P0006',null,'different key cannot duplicate active pair');
select lives_ok('set constraints all immediate','complete creation satisfies deferred invariants');
set constraints all deferred;
select throws_ok($$do $x$ begin delete from public.arena_room_participants where room_id=pg_temp.duel_room() and profile_id='p1-a'; set constraints all immediate; end $x$ $$,'23514',null,'partial fighter deletion cannot commit');
select throws_ok($$do $x$ begin insert into public.clashes(id,take_id,challenger_id,duel_key,closes_at) values('p1-missing-room','p1-take','p1-s','00000000-0000-0000-0000-00000000f130',now()+interval '30 minutes'); set constraints all immediate; end $x$ $$,'23514',null,'duel Clash without a Room cannot commit');
select throws_ok($$update public.arena_rooms set clash_id=null where id=pg_temp.duel_room()$$,'23514',null,'canonical link cannot be detached');
select throws_ok($$update public.clashes set challenger_id='p1-s' where id=pg_temp.duel_clash()$$,'23514',null,'Fighter B cannot be replaced');
select throws_ok($$update public.takes set author_id='p1-b' where id='p1-take'$$,'23514',null,'Fighter A cannot become Fighter B');
select throws_ok($$insert into public.arena_rooms(id,topic_id,clash_id,capacity,participant_count,opens_at,closes_at)
 select 'p1-duplicate',topic_id,clash_id,2,2,opens_at,closes_at from public.arena_rooms where id=pg_temp.duel_room()$$,'23505',null,'second room for one Clash rejected');
select throws_ok($$insert into public.arena_rooms(id,topic_id,clash_id,capacity,participant_count,opens_at,closes_at)
 select 'p1-orphan','p1-group-topic','missing',2,2,opens_at,closes_at from public.arena_rooms where id=pg_temp.duel_room()$$,'23503',null,'orphan room FK rejected');
select throws_ok($$insert into public.arena_room_participants(room_id,topic_id,profile_id,role,initial_stance)
 select id,topic_id,'p1-s','debater','AGREE' from public.arena_rooms where id=pg_temp.duel_room()$$,'42501',null,'privileged participant insertion cannot add a third fighter');
select ok(not has_function_privilege('authenticated','public.create_arena_duel(text,text,uuid)','execute'),'creation service only');
select ok(has_function_privilege('service_role','public.create_arena_duel(text,text,uuid)','execute'),'service may create');
select ok(not has_function_privilege('authenticated','public.settle_clash_legacy(text)','execute'),'private settlement cannot bypass bridge');
select ok(not has_function_privilege('anon','public.assert_arena_duel_integrity(text)','execute'),'integrity helper private');
select ok(not has_column_privilege('authenticated','public.arena_rooms','clash_id','update'),'relationship has no client update grant');
select ok(not has_column_privilege('authenticated','public.clashes','duel_key','select'),'retry key is not exposed to clients');
select ok((select relrowsecurity from pg_class where oid='public.arena_rooms'::regclass),'room RLS retained');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}',true);
select lives_ok($$select public.post_arena_room_message(pg_temp.duel_room(),'Argument A')$$,'Fighter A may publish');
select is(public.get_arena_room(pg_temp.duel_room())#>>'{duel,viewerRelationship}','fighter_a','compact view identifies Fighter A');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f102","role":"authenticated"}',true);
select lives_ok($$select public.post_arena_room_message(pg_temp.duel_room(),'Argument B')$$,'Fighter B may publish');
select lives_ok($$select public.submit_arena_evidence(pg_temp.duel_room(),'link','Fighter B citation','https://example.com/duel')$$,'Fighter B may publish evidence through existing RPC');
select is(public.get_arena_room(pg_temp.duel_room())#>>'{duel,fighterA,id}','p1-a','view derives A from Take');
select is(public.get_arena_room(pg_temp.duel_room())#>>'{duel,fighterB,id}','p1-b','view derives B from Clash');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f103","role":"authenticated"}',true);
select lives_ok($$select public.watch_arena_room(pg_temp.duel_room())$$,'spectator watches existing infrastructure');
select throws_ok($$select public.post_arena_room_message(pg_temp.duel_room(),'Impersonation')$$,'42501',null,'spectator cannot publish');
select throws_ok($$select public.submit_arena_evidence(pg_temp.duel_room(),'link','Spectator citation','https://example.com/duel')$$,'42501',null,'spectator cannot publish competitive evidence');
select throws_ok($$select public.upgrade_arena_spectator(pg_temp.duel_room(),'AGREE')$$,'P0009',null,'spectator cannot upgrade a full duel');
select throws_ok($$select public.join_arena_topic((select topic_id from public.arena_rooms where id=pg_temp.duel_room()),'AGREE','debater')$$,'42501',null,'topic joining cannot allocate third fighter');
select throws_ok($$select public.submit_judgement(pg_temp.duel_clash(),'A')$$,'P0003',null,'no premature duel ballot');
-- Real authenticated role, not only JWT simulation: protected writes fail.
set local role authenticated;
select throws_ok($$update public.arena_rooms set clash_id=null where id=pg_temp.duel_room()$$,'42501',null,'authenticated direct link mutation denied');
select throws_ok($$update public.arena_room_participants set role='debater',initial_stance='AGREE' where room_id=pg_temp.duel_room() and profile_id='p1-s'$$,'42501',null,'authenticated participant promotion denied');
select throws_ok($$insert into public.arena_room_messages(id,room_id,author_id,body) values('p1-forged',pg_temp.duel_room(),'p1-a','Forged')$$,'42501',null,'random client cannot impersonate A');
select throws_ok($$select public.create_arena_duel('p1-take','p1-b','00000000-0000-0000-0000-00000000f110')$$,'42501',null,'client cannot execute service creation');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f104","role":"authenticated"}',true);
select is(public.get_arena_room(pg_temp.duel_room())#>>'{duel,viewerRelationship}','staff','compact view identifies moderator');
select lives_ok($$update public.arena_room_messages set hidden_at=now() where room_id=pg_temp.duel_room() and author_id='p1-b'$$,'trusted moderation invalidation remains available');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f103","role":"authenticated"}',true);
select is(cardinality(public.get_arena_room_message_visibility(pg_temp.duel_room(),array(select id from public.arena_room_messages where room_id=pg_temp.duel_room() and author_id='p1-b'))),0,'hidden duel argument disappears via Phase 0 reconciliation');
-- Set all shared opening times into the past atomically; no device clock.
update public.clashes set opens_at=now()-interval '1 hour' where id=pg_temp.duel_clash();
update public.arena_rooms set opens_at=now()-interval '1 hour',status='JUDGING' where id=pg_temp.duel_room();
update public.arena_daily_topics set opens_at=now()-interval '1 hour',final_arguments_at=now()-interval '30 minutes',judging_at=now()-interval '5 minutes'
 where id=(select topic_id from public.arena_rooms where id=pg_temp.duel_room());
select lives_ok($$select public.submit_judgement(pg_temp.duel_clash(),'A')$$,'public spectator judgement accepted');
select lives_ok($$select public.submit_judgement(pg_temp.duel_clash(),'A')$$,'ballot retry is idempotent');
select is((select count(*)::integer from public.judgements where clash_id=pg_temp.duel_clash()),1,'one public ballot per juror');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000f101","role":"authenticated"}',true);
select throws_ok($$select public.submit_judgement(pg_temp.duel_clash(),'B')$$,'P0005',null,'fighter cannot judge own duel');
select throws_ok($$select public.post_arena_room_message(pg_temp.duel_room(),'Late argument')$$,'P0003',null,'judging rejects further arguments');
select throws_ok($$select public.submit_arena_side_vote(pg_temp.duel_room(),'AGREE')$$,'42501',null,'group side ballot cannot create alternate winner');
select set_config('request.jwt.claims',null,true);
select throws_ok($$insert into public.arena_room_messages(id,room_id,author_id,body) values('p1-server-forged',pg_temp.duel_room(),'p1-s','Forged')$$,'42501',null,'all definer publication paths require canonical fighter');
-- Close shared clocks and settle through the Room bridge.
update public.clashes set closes_at=now()-interval '1 minute' where id=pg_temp.duel_clash();
update public.arena_rooms set closes_at=now()-interval '1 minute' where id=pg_temp.duel_room();
update public.arena_daily_topics set closes_at=now()-interval '1 minute' where id=(select topic_id from public.arena_rooms where id=pg_temp.duel_room());
update public.arena_rooms set status='OPEN' where id=pg_temp.duel_room();
select is(public.get_arena_room(pg_temp.duel_room())->>'status','JUDGING','expired duel never presents an open composer while scheduler lags');
create temporary table p1_outcome as select public.settle_arena_room(pg_temp.duel_room()) payload;
select is((select winner_side::text from public.verdicts where clash_id=pg_temp.duel_clash()),'A','Clash verdict owns the outcome');
select is((select status::text from public.arena_rooms where id=pg_temp.duel_room()),'SETTLED','Room follows Clash settlement');
select is((select count(*)::integer from public.arena_room_results where room_id=pg_temp.duel_room()),0,'no parallel Room result');
select is(public.settle_clash(pg_temp.duel_clash()),(select payload from p1_outcome),'settlement idempotent across both APIs');
select is(public.get_arena_room(pg_temp.duel_room())#>>'{duel,verdict,winnerSide}','A','room view exposes authoritative verdict');
select is(public.get_arena_room(pg_temp.duel_room())->'result','null'::jsonb,'duel suppresses group result');
select throws_ok($$do $x$ begin delete from public.verdicts where clash_id=pg_temp.duel_clash(); set constraints all immediate; end $x$ $$,'23514',null,'settled duel cannot lose its authoritative verdict');
select lives_ok('set constraints all immediate','settled graph remains consistent');
set constraints all deferred;
create function pg_temp.shift_duel_clock(p_clash text,p_close timestamptz) returns void language plpgsql as $$
begin
 update public.clashes set opens_at=now()-interval '1 hour',closes_at=p_close where id=p_clash;
 update public.arena_rooms set opens_at=now()-interval '1 hour',closes_at=p_close where clash_id=p_clash;
 update public.arena_daily_topics set opens_at=now()-interval '1 hour',final_arguments_at=now()-interval '30 minutes',judging_at=now()-interval '5 minutes',closes_at=p_close
  where id=(select topic_id from public.arena_rooms where clash_id=p_clash);
end$$;
create temporary table p1_cancel as select public.create_arena_duel('p1-take','p1-b','00000000-0000-0000-0000-00000000f140') payload;
select pg_temp.shift_duel_clock((select payload->>'clashId' from p1_cancel),now()-interval '1 minute');
select lives_ok($$select public.transition_due_arena_rooms(500)$$,'existing scheduler settles linked duel');
select is((select status::text from public.clashes where id=(select payload->>'clashId' from p1_cancel)),'cancelled','zero ballots cancel the Clash');
select is((select status::text from public.arena_rooms where id=(select payload->>'roomId' from p1_cancel)),'CANCELLED','zero ballots cancel the Room');
select is(public.settle_arena_room((select payload->>'roomId' from p1_cancel))->>'status','cancelled','cancelled settlement is idempotent');
create temporary table p1_draw as select public.create_arena_duel('p1-take','p1-b','00000000-0000-0000-0000-00000000f150') payload;
select pg_temp.shift_duel_clock((select payload->>'clashId' from p1_draw),now()+interval '15 minutes');
insert into public.judgements(clash_id,juror_id,side) select payload->>'clashId','p1-s','A' from p1_draw;
insert into public.judgements(clash_id,juror_id,side) select payload->>'clashId','p1-mod','B' from p1_draw;
select pg_temp.shift_duel_clock((select payload->>'clashId' from p1_draw),now()-interval '1 minute');
select is(public.settle_clash((select payload->>'clashId' from p1_draw))->>'winner_side','DRAW','duel preserves canonical draws');
select is((select count(*)::integer from public.arena_room_results where room_id in(select id from public.arena_rooms where clash_id is not null)),0,'win draw and cancellation produce no group results');
select is((select count(*)::integer from public.reputation_events where arena_room_id in(select id from public.arena_rooms where clash_id is not null)),0,'duels do not receive duplicate group rewards');
select lives_ok('set constraints all immediate','all terminal duel graphs satisfy deferred invariants');
select * from finish();
rollback;

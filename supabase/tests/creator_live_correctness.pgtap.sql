-- LIVE-CONNECT-B2. NOT EXECUTED in source-only phase.
-- Requires an explicitly approved disposable writable PostgreSQL target with
-- the full migration chain including creator_live_correctness and pgTAP.
-- Owner fixture writes represent independently evidenced EXISTING sessions;
-- never run against preserved QA, shared, staging or production databases.
begin;
set local search_path=public,extensions;
select no_plan();
reset role;
select set_config('request.jwt.claims','{}',true);
do $$ begin
  if exists(select 1 from public.profiles where id like 'b2live-%')
     or exists(select 1 from auth.users where id in (
       '71000000-0000-0000-0000-000000000001',
       '71000000-0000-0000-0000-000000000002',
       '71000000-0000-0000-0000-000000000003',
       '71000000-0000-0000-0000-000000000004')) then
    raise exception 'fixture collision: refuse reuse';
  end if;
end $$;
insert into auth.users(id) values
 ('71000000-0000-0000-0000-000000000001'),
 ('71000000-0000-0000-0000-000000000002'),
 ('71000000-0000-0000-0000-000000000003'),
 ('71000000-0000-0000-0000-000000000004');
update public.profiles set id='b2live-host',handle='b2live_host',name='Fictional B2 Host',role='creator'
 where auth_user_id='71000000-0000-0000-0000-000000000001';
update public.profiles set id='b2live-a',handle='b2live_a',name='Fictional B2 A',role='viewer'
 where auth_user_id='71000000-0000-0000-0000-000000000002';
update public.profiles set id='b2live-b',handle='b2live_b',name='Fictional B2 B',role='viewer'
 where auth_user_id='71000000-0000-0000-0000-000000000003';
update public.profiles set id='b2live-staff',handle='b2live_staff',name='Fictional B3 Moderator',role='moderator'
 where auth_user_id='71000000-0000-0000-0000-000000000004';
insert into public.creator_vaults(id,creator_id,title,status)
 values('b2live-vault','b2live-host','Fictional B2 Vault','active');
insert into public.creator_live_sessions(id,creator_id,vault_id,title,status,access,started_at)
 values('b2live-session','b2live-host','b2live-vault','Fictional retained session','LIVE','FREE',now()),
 ('b2live-scheduled','b2live-host','b2live-vault','Fictional scheduled session','SCHEDULED','FREE',null),
 ('b2live-staff-session','b2live-host','b2live-vault','Fictional staff cleanup session','LIVE','FREE',now());
insert into public.creator_live_interactions(id,session_id,creator_id,type,prompt,options,status,closes_at)
 select 'b2live-'||n,'b2live-session','b2live-host','CHOICE','Fictional choice',
 '[{"id":"a","label":"A"},{"id":"b","label":"B"}]'::jsonb,'OPEN',clock_timestamp()+interval '10 minutes'
 from unnest(array['round','empty','expired','winner']) n;
update public.creator_live_interactions set closes_at=clock_timestamp()-interval '1 second' where id='b2live-expired';

select is((select count(*) from public.creator_live_continuation_approvals),0::bigint,
 'installation did not backfill approvals from existing sessions');
select is(has_table_privilege('authenticated','public.creator_live_continuation_approvals','INSERT'),false,'clients cannot approve themselves');
select is(has_table_privilege('service_role','public.creator_live_continuation_approvals','INSERT'),false,'service role has no approval grant');
select is(has_function_privilege('authenticated','public.assert_creator_live_continuation(text,text,text)','EXECUTE'),false,'continuation assertion is internal');
select is(has_function_privilege('anon','public.submit_creator_live_vote(text,text)','EXECUTE'),false,'anon cannot vote');
select is(has_table_privilege('authenticated','public.creator_live_votes','INSERT'),false,'no direct ballot inserts');
select is(has_table_privilege('authenticated','public.creator_live_sessions','INSERT'),false,'no direct hosting inserts');

set local role anon;
select set_config('request.jwt.claims','{}',true);
select throws_ok($q$select public.create_creator_live_session('Anonymous denied hosting')$q$,'42501',null,'actual anonymous hosting is denied');
select throws_ok($q$select public.submit_creator_live_vote('b2live-round','a')$q$,'42501',null,'actual anonymous vote is denied');
select is(public.get_creator_live_snapshot('b2live-session')->'session'->>'canParticipate','false','anonymous public snapshot never implies admission');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is(current_user::text,'authenticated','host executes as actual authenticated role');
select throws_ok($q$select public.create_creator_live_session('Fictional denied hosting')$q$,'P0006',null,'new hosting is closed');
select throws_ok($q$select public.start_creator_live_session('b2live-scheduled')$q$,'P0006',null,'new start is closed');
select lives_ok($q$select public.start_creator_live_session('b2live-session')$q$,'already-LIVE start replay is effect-free');
select throws_ok($q$select public.create_creator_live_interaction('b2live-session','CHOICE','Denied','[{"id":"a","label":"A"},{"id":"b","label":"B"}]')$q$,'P0006',null,'owner has no inferred continuation approval');
select set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is(public.get_creator_live_session('b2live-session')->>'viewerAccess','true','visibility remains allowed');
select is(public.get_creator_live_session('b2live-session')->>'canParticipate','false','visibility is not admission');
select throws_ok($q$select * from public.creator_live_continuation_approvals$q$,'42501',null,'ordinary viewer cannot read private continuation evidence');
select throws_ok($q$select public.touch_creator_live_viewer('b2live-session')$q$,'P0006',null,'page heartbeat cannot admit viewer');
select throws_ok($q$select public.submit_creator_live_vote('b2live-round','a')$q$,'P0006',null,'new voter is denied');
reset role;
select is((select count(*) from public.creator_live_votes where interaction_id like 'b2live-%'),0::bigint,'denial left no ballots');
select is((select count(*) from public.creator_live_viewers where session_id='b2live-session'),0::bigint,'denial left no presence');
select is((select count(*) from public.creator_live_events where session_id='b2live-session'),0::bigint,'denial left no events');
-- Presence or a previous ballot MUST NOT become admission evidence.
insert into public.creator_live_viewers(session_id,profile_id) values('b2live-session','b2live-a');
insert into public.creator_live_votes(interaction_id,profile_id,option_id) values('b2live-empty','b2live-a','a');
set local role authenticated;
select throws_ok($q$select public.submit_creator_live_vote('b2live-empty','a')$q$,'P0006',null,'existing ballot cannot bootstrap approval');
reset role;
delete from public.creator_live_votes where interaction_id='b2live-empty';
delete from public.creator_live_viewers where session_id='b2live-session';
-- Explicit test-owner evidence, never a migration backfill or public admission API.
insert into public.creator_live_continuation_approvals(session_id,profile_id,capability,evidence_ref,expires_at)
 values('b2live-session','b2live-host','HOST','rollback-only reviewed fixture',clock_timestamp()+interval '1 hour'),
 ('b2live-session','b2live-a','VIEWER','rollback-only reviewed fixture',clock_timestamp()+interval '1 hour'),
 ('b2live-session','b2live-b','VIEWER','rollback-only reviewed fixture',clock_timestamp()+interval '1 hour');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is(public.get_creator_live_session('b2live-session')->>'canParticipate','true','approved visible viewer can continue');
select lives_ok($q$select public.touch_creator_live_viewer('b2live-session')$q$,'approved heartbeat works');
select throws_ok($q$select public.end_creator_live_session('b2live-session')$q$,'P0001',null,'viewer cannot end host session');
select throws_ok($q$select public.close_creator_live_interaction('b2live-round')$q$,'P0001',null,'viewer cannot close round');
select throws_ok($q$select public.submit_creator_live_vote('b2live-expired','a')$q$,'P0004',null,'expired round rejects new vote');
select is(public.submit_creator_live_vote('b2live-round','a')->>'accepted','true','approved viewer submits once');
select is(public.submit_creator_live_vote('b2live-round','a')->>'alreadyVoted','true','same vote replays');
select is(public.submit_creator_live_vote('b2live-round','b')->>'myVote','a','different replay returns actual stored option');
select is(public.submit_creator_live_vote('b2live-round','b')->>'accepted','false','different replay cannot replace ballot');
reset role;
insert into public.blocks(blocker_id,blocked_id) values('b2live-host','b2live-a');
set local role authenticated;
select throws_ok($q$select public.submit_creator_live_vote('b2live-round','a')$q$,'P0001',null,'blocked ballot replay cannot disclose aggregate');
select is((select count(*) from public.creator_live_interactions where id='b2live-round'),0::bigint,'blocked direct table reads cannot expose round aggregate');
select is((select count(*) from public.creator_live_votes where interaction_id='b2live-round'),1::bigint,'blocked caller retains own ballot account-data read');
select is(public.get_creator_live_snapshot('b2live-session'),null::jsonb,'blocked snapshot is unavailable');
reset role;
delete from public.blocks where blocker_id='b2live-host' and blocked_id='b2live-a';
update public.creator_live_sessions set access='SUBSCRIBER' where id='b2live-session';
set local role authenticated;
select throws_ok($q$select public.submit_creator_live_vote('b2live-round','a')$q$,'P0001',null,'loss of subscription eligibility denies aggregate replay');
reset role;
update public.creator_live_sessions set access='FREE' where id='b2live-session';
update public.creator_live_continuation_approvals set revoked_at=clock_timestamp() where profile_id='b2live-a';
set local role authenticated;
select throws_ok($q$select public.submit_creator_live_vote('b2live-round','a')$q$,'P0006',null,'revoked continuation rejects replay');
select is(public.get_creator_live_snapshot('b2live-session','b2live-round')->'interactions'->0->>'myVote','a','authorized own history remains readable after admission revocation');
select set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select is(public.submit_creator_live_vote('b2live-round','b')->>'accepted','true','second approved viewer records independent vote');
select is((select count(*) from public.creator_live_votes where interaction_id='b2live-round' and profile_id='b2live-a'),0::bigint,'viewer cannot directly read another ballot');
select is(public.submit_creator_live_vote('b2live-winner','a')->>'accepted','true','one-ballot result fixture uses supported vote RPC');
select is(public.report_creator_live_session('b2live-session','spam','Fictional rollback-only safety test') like 'rpt_%',true,'authorized safety reporting remains usable');
reset role;
select is((select count(*) from public.creator_live_votes where interaction_id='b2live-round'),2::bigint,'exactly two authoritative ballots');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($q$select public.create_creator_live_interaction('b2live-session','CHOICE','Approved continuation','[{"id":"a","label":"A"},{"id":"b","label":"B"}]',null,null,120)$q$,'approved existing host can open a round');
select is((public.close_creator_live_interaction('b2live-round')).result->>'outcome','TIE','tie is explicit');
select is((public.close_creator_live_interaction('b2live-round')).result->>'winner',null::text,'tie has no selected winner');
select is((public.close_creator_live_interaction('b2live-empty')).result->>'outcome','NO_BALLOTS','zero ballots is explicit');
select is((public.close_creator_live_interaction('b2live-empty')).result->>'winner',null::text,'zero ballots has no winner');
select is((public.close_creator_live_interaction('b2live-winner')).result->>'outcome','WINNER','single ballot has a numerical winner');
select is((public.close_creator_live_interaction('b2live-winner')).result->>'winner','a','actual ballot determines winner');
reset role;
-- Retained threshold fixture: finalization must never refire its action.
insert into public.creator_live_interactions
 (id,session_id,creator_id,type,prompt,action_kind,threshold,status,trigger_count,triggered_at,total_votes)
 values('b2live-triggered','b2live-session','b2live-host','CROWD_ACTION','Retained fictional action',
 'LIGHTS_OFF',2,'TRIGGERED',1,now(),2);
insert into public.creator_live_votes(interaction_id,profile_id,option_id)
 values('b2live-triggered','b2live-a',null),('b2live-triggered','b2live-b',null);
insert into public.creator_live_events(id,session_id,interaction_id,kind,action_kind)
 values('b2live-triggered-event','b2live-session','b2live-triggered','ACTION_TRIGGERED','LIGHTS_OFF');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select is(current_user::text,'authenticated','moderator uses actual ordinary authenticated role');
select is((public.close_creator_live_interaction('b2live-triggered')).result->>'supports','2','staff finalizes retained TRIGGERED row from authoritative votes');
select is((public.close_creator_live_interaction('b2live-triggered')).trigger_count,1,'repeat close cannot trigger again');
select is((public.end_creator_live_session('b2live-staff-session')).status::text,'ENDED','staff can end another creator session without continuation approval');
select is((public.end_creator_live_session('b2live-staff-session')).status::text,'ENDED','staff terminal cleanup is idempotent');
reset role;
select is((select count(*) from public.creator_live_continuation_approvals where profile_id='b2live-staff'),0::bigint,'staff cleanup did not create admission evidence');
select is((select count(*) from public.creator_live_events where interaction_id='b2live-triggered' and kind='ACTION_TRIGGERED'),1::bigint,'finalization does not refire retained action');
select is((select count(*) from public.creator_live_events where interaction_id='b2live-triggered' and kind='INTERACTION_CLOSED'),1::bigint,'TRIGGERED finalization emits one close event');
select is((select closed_at is not null from public.creator_live_interactions where id='b2live-triggered'),true,'TRIGGERED finalization records closed_at');
select is((select count(*) from public.creator_live_events where session_id='b2live-staff-session' and kind='SESSION_ENDED'),1::bigint,'staff replay emits one terminal event');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($q$select public.end_creator_live_session('b2live-session')$q$,'owner can safely end without new hosting');
select lives_ok($q$select public.end_creator_live_session('b2live-session')$q$,'terminal end is idempotent');
select is(public.get_creator_live_snapshot('b2live-session')->'session'->>'status','ENDED','snapshot restores terminal state');
select throws_ok($q$select public.create_creator_live_interaction('b2live-session','CHOICE','After end','[{"id":"a","label":"A"},{"id":"b","label":"B"}]')$q$,'P0004',null,'no new round under ended session');
reset role;
select is((select count(*) from public.creator_live_events where session_id='b2live-session' and kind='SESSION_ENDED'),1::bigint,'end replay emits no duplicate terminal event');
select is((select count(*) from public.creator_live_events where interaction_id='b2live-round' and kind='INTERACTION_CLOSED'),1::bigint,'close replay emits no duplicate result');
select is((select count(*) from public.creator_live_interactions where session_id='b2live-session' and status='OPEN'),0::bigint,'end closes all OPEN rounds');
select is((select count(*) from public.creator_live_sessions where id like 'b2live-%'),3::bigint,'no additional sessions admitted');
select has_function('public','report_creator_live_session',array['text','report_reason','text'],'report signature retained');
select is(has_function_privilege('authenticated','public.report_creator_live_session(text,public.report_reason,text)','EXECUTE'),true,'report permission retained');
select * from finish();
rollback;

-- E3.2.5: executable safety/lifecycle contracts, NOT evidence of execution.
-- DISPOSABLE DATABASE ONLY. See docs/evidence/explore-e325/REPORT.md.
-- dblink commits only its namespaced fixtures; abort => destroy the instance.
begin;
set local search_path = public, extensions;
set local statement_timeout = '15s';
do $$ begin
  if current_database() !~ '^clash_e325_[a-zA-Z0-9_]+$'
     or current_setting('test.e325_disposable', true) is distinct from 'on' then
    raise exception '097 requires an explicitly authorized disposable clash_e325_* database';
  end if;
end $$;
select no_plan();
reset role;
select set_config('request.jwt.claims', null, true);

-- Catalog assertions exercise installed definitions, not a client simulation.
select has_function('public', 'touch_meet_session', array['text'], 'heartbeat exists');
select has_function('public', 'report_meet_message', array['text','text','report_reason','text'], 'message report exists');
select has_function('public', 'expire_stale_meet_sessions', array['integer'], 'sweeper exists');
select has_table('public', 'meet_moderation_reads', 'moderation read audit exists');
select ok((select relrowsecurity from pg_class where oid='public.meet_moderation_reads'::regclass), 'audit RLS enabled');
select is(has_table_privilege('authenticated','public.meet_participants','INSERT'), false, 'cannot forge participant rows');
select is(has_table_privilege('authenticated','public.meet_sessions','UPDATE'), false, 'cannot forge lease');
select is(has_table_privilege('authenticated','public.meet_moderation_reads','INSERT'), false, 'cannot forge staff audit');
select is(has_function_privilege('anon','public.touch_meet_session(text)','EXECUTE'), false, 'anonymous cannot heartbeat');
select is(has_function_privilege('authenticated','public.expire_stale_meet_sessions(integer)','EXECUTE'), false, 'client cannot sweep');
select is(has_function_privilege('authenticated','public.release_stale_meet_participation()','EXECUTE'), false, 'trigger is not an RPC');
select is((select indisunique from pg_index where indexrelid='public.meet_participants_active_one_idx'::regclass), true, 'active seat index remains unique');
select matches((select pg_get_expr(indpred,indrelid) from pg_index where indexrelid='public.meet_participants_active_one_idx'::regclass), 'left_at IS NULL', 'seat uniqueness is partial');
select ok(exists(select 1 from pg_trigger where tgrelid='public.meet_participants'::regclass
  and tgname='meet_participants_release_stale' and (tgtype & 7)=7 and tgenabled <> 'D'), 'row BEFORE INSERT release trigger enabled');

insert into auth.users(id) select ('e3250000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,7) n;
update public.profiles set id='e325-'||case right(auth_user_id::text,1)
    when '1' then 'a' when '2' then 'b' when '3' then 'c' when '4' then 'd'
    when '5' then 'staff' when '6' then 'outsider' else 'cap' end,
  handle='e325_'||right(auth_user_id::text,1), name='E325 fixture', public_country_code='IN'
where auth_user_id::text like 'e3250000-0000-0000-0000-%';
update public.profiles set role='moderator' where id='e325-staff';

insert into public.meet_sessions(id,mode,channel,expires_at) values
 ('e325-stale','ANYWHERE','TEXT',now()-interval '1 minute'),
 ('e325-live','ANYWHERE','TEXT',now()+interval '30 seconds'),
 ('e325-video','ANYWHERE','VIDEO',now()+interval '90 seconds'),
 ('e325-other','ANYWHERE','TEXT',now()+interval '90 seconds'),
 ('e325-cap','ANYWHERE','TEXT',now()+interval '30 seconds');
update public.meet_sessions set created_at=now()-interval '6 hours 1 minute' where id='e325-cap';
insert into public.meet_participants(session_id,profile_id,seat,alias) values
 ('e325-stale','e325-a','A','Old A'),('e325-stale','e325-b','B','Old B');
-- Assumption 1: real INSERT must succeed despite old indexed, unreleased seats.
select lives_ok($$insert into public.meet_participants(session_id,profile_id,seat,alias)
 values('e325-live','e325-a','A','A'),('e325-live','e325-b','B','B')$$,
 'BEFORE INSERT releases both stale seats before the partial index check');
select is((select count(*)::int from public.meet_participants where session_id='e325-stale' and left_at is not null),2,'both stale seats released');
select throws_ok($$insert into public.meet_participants(session_id,profile_id,seat,alias)
 values('e325-other','e325-a','A','Forged duplicate')$$,'23505',null,'a genuinely live seat still prevents another session');
insert into public.meet_participants(session_id,profile_id,seat,alias) values
 ('e325-video','e325-c','A','C'),('e325-video','e325-d','B','D'),('e325-cap','e325-cap','A','Cap');
insert into public.meet_messages(id,session_id,sender_id,body) values
 ('e325-ma','e325-live','e325-a','own evidence'),
 ('e325-mb','e325-live','e325-b','peer evidence'),
 ('e325-foreign','e325-other','e325-c','FOREIGN_EVIDENCE_MARKER');
insert into public.meet_signals(session_id,sender_id,kind,payload)
 values('e325-video','e325-c','ice','{"candidate":"NETWORK_ADDRESS_MARKER"}');
insert into public.reports(id,reporter_id,target_kind,target_id,reason,detail)
 values('e325-foreign-report','e325-c','meet_session','e325-other','other','FOREIGN_REPORT_MARKER');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e3250000-0000-0000-0000-000000000006","role":"authenticated"}',true);
select throws_ok($$select public.moderate_meet_session('e325-live')$$,'42501','staff only','ordinary user cannot read report evidence');
select throws_ok($$select public.touch_meet_session('e325-live')$$,'P0002','session not found','outsider cannot renew another lease');
select throws_ok($$select public.touch_meet_session('e325-missing')$$,'P0002','session not found','heartbeat existence oracle is closed');
select throws_ok($$select public.block_meet_peer('e325-live')$$,'P0002','session not found','outsider cannot block participants or end their session');
select throws_ok($$select public.report_meet_session('e325-live','harassment',null)$$,'42501','not a participant','outsider cannot report a guessed session');
select throws_ok($$select public.report_meet_message('e325-live','e325-mb','harassment',null)$$,'42501','not a participant','outsider cannot report guessed messages');
select throws_ok($$select public.list_meet_messages('e325-live',40,null)$$,'42501','not a participant','outsider cannot read transcript');
select throws_ok($$insert into public.meet_participants(session_id,profile_id,seat,alias)
 values('e325-other','e325-outsider','A','Forged')$$,'42501',null,'direct forged participant insert denied');
select throws_ok($$update public.meet_sessions set expires_at=now()+interval '1 year' where id='e325-live'$$,'42501',null,'client cannot extend lease directly');
select is((select count(*)::int from public.meet_moderation_reads),0,'audit RLS hides staff reads from ordinary users');
select is((select count(*)::int from public.reports where target_id in ('e325-live','e325-mb')),0,'outsider cannot read others reports');

select set_config('request.jwt.claims','{"sub":"e3250000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select ok((public.touch_meet_session('e325-live')->>'active')::boolean,'participant renews a live lease');
reset role;
select is((select expires_at from public.meet_sessions where id='e325-live'),now()+interval '90 seconds','lease duration is chosen by server');
select ok((select last_heartbeat_at=now() from public.meet_participants where session_id='e325-live' and profile_id='e325-a'),'participant heartbeat recorded');
set local role authenticated;
select ok((public.touch_meet_session('e325-live')->>'active')::boolean,'repeat heartbeat remains valid');
select throws_ok($$select public.report_meet_message('e325-live','e325-ma','harassment',null)$$,'P0002','message not found','own message is not a report target');
select throws_ok($$select public.report_meet_message('e325-live','e325-foreign','harassment',null)$$,'P0002','message not found','cross-session evidence injection denied');
select throws_ok($$select public.report_meet_message('e325-live','e325-unknown','harassment',null)$$,'P0002','message not found','missing target has the same response');
select throws_ok($$select public.report_meet_session('e325-live','other',repeat('x',501))$$,'P0004','detail too long','oversized report detail rejected');
select ok((public.report_meet_message('e325-live','e325-mb','child_safety','peer message')->>'reported')::boolean,'peer child-safety message report accepted');
select ok((public.report_meet_session('e325-live','harassment','session evidence')->>'reported')::boolean,'participant session report accepted');
reset role;
select is((select status::text from public.meet_sessions where id='e325-live'),'active','reporting does not end session');
select ok(public.meet_session_under_review('e325-live'),'open message/session reports pin evidence');
update public.reports set status='resolved' where target_kind='meet_session' and target_id='e325-live';
select ok(public.meet_session_under_review('e325-live'),'message report alone pins its session');
update public.reports set status='open' where target_kind='meet_session' and target_id='e325-live';
select is(public.meet_session_under_review('e325-stale'),false,'unreported session is not pinned by another report');
select is((select expires_at from public.meet_sessions where id='e325-live'),now()+interval '90 seconds','repeat heartbeat did not stack lease extensions');

-- Assumption 4: expiry is effective before the sweeper changes status.
update public.meet_sessions set expires_at=now()-interval '1 second' where id in ('e325-live','e325-video');
set local role authenticated;
select is(public.get_meet_session('e325-live')->>'status','ended','expired active row is presented as ended');
select is(public.get_meet_session('e325-live')->>'endReason','expired','expired reason is explicit');
select is((public.touch_meet_session('e325-live')->>'active')::boolean,false,'heartbeat cannot resurrect expired lease');
select throws_ok($$select public.send_meet_message('e325-live','late message')$$,'P0003','session closed','expired active session rejects message writes');
select lives_ok($$select public.list_meet_messages('e325-live',40,null)$$,'expired participant retains intentional history access');
select set_config('request.jwt.claims','{"sub":"e3250000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.publish_meet_signal('e325-video','ice','{"candidate":"late"}')$$,'P0003','session ended','expired active video rejects signals');
select is((public.list_meet_signals('e325-video',null)->>'active')::boolean,false,'expired signal poll reports inactive');
select is(jsonb_array_length(public.list_meet_signals('e325-video',null)->'items'),0,'expired signal poll discloses no candidates');
select is((public.poll_meet_queue()->>'matched')::boolean,false,'poll does not return expired active session as matched');
select ok((public.join_meet_queue('ANYWHERE')->>'queued')::boolean,'expired active session does not prevent a fresh queue entry');
select lives_ok($$select public.leave_meet_queue()$$,'cancel fixture requeue');
select set_config('request.jwt.claims','{"sub":"e3250000-0000-0000-0000-000000000007","role":"authenticated"}',true);
select is((public.touch_meet_session('e325-cap')->>'active')::boolean,false,'heartbeat cannot extend beyond six-hour ceiling');
reset role;
select ok((select expires_at<=created_at+interval '6 hours' from public.meet_sessions where id='e325-cap'),'six-hour bound is persisted');

-- Rate-limit boundary: a real final heartbeat succeeds, then the next is denied.
delete from public.rate_limit_events where actor_id='e325-a' and action='meet_touch';
insert into public.rate_limit_events(actor_id,action) select 'e325-a','meet_touch' from generate_series(1,119);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e3250000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.touch_meet_session('e325-live')$$,'heartbeat number 120 reaches the RPC');
select throws_ok($$select public.touch_meet_session('e325-live')$$,'P0001',null,'heartbeat number 121 is rate limited');
select throws_ok($$delete from public.rate_limit_events where actor_id='e325-a'$$,'42501',null,'client cannot clear its abuse ledger');
reset role;
delete from public.rate_limit_events where actor_id='e325-a' and action='meet_report';
insert into public.rate_limit_events(actor_id,action) select 'e325-a','meet_report' from generate_series(1,9);
set local role authenticated;
select lives_ok($$select public.report_meet_session('e325-stale','harassment',null)$$,'final shared report allowance succeeds for past participation');
select throws_ok($$select public.report_meet_message('e325-live','e325-mb','harassment',null)$$,'P0001',null,'session and message reports share one budget');
reset role;

-- Each remaining RPC must enforce its configured budget, not just a helper test.
insert into public.rate_limit_events(actor_id,action)
select 'e325-a',b.action from (values ('meet_join',20),('meet_poll',240),
 ('meet_session_read',300),('meet_message',40),('meet_message_read',240),
 ('meet_leave',60),('meet_block',20),('meet_signal',120),('meet_signal_read',900)) b(action,budget)
cross join lateral generate_series(1,b.budget);
set local role authenticated;
select throws_ok($$select public.join_meet_queue('ANYWHERE')$$,'P0001',null,'join budget enforced');
select throws_ok($$select public.poll_meet_queue()$$,'P0001',null,'poll budget enforced');
select throws_ok($$select public.get_meet_session('e325-live')$$,'P0001',null,'session read budget enforced');
select throws_ok($$select public.send_meet_message('e325-live','x')$$,'P0001',null,'send budget enforced');
select throws_ok($$select public.list_meet_messages('e325-live',40,null)$$,'P0001',null,'history budget enforced');
select throws_ok($$select public.leave_meet_session('e325-live','leave')$$,'P0001',null,'leave budget enforced');
select throws_ok($$select public.block_meet_peer('e325-live')$$,'P0001',null,'block budget enforced');
select throws_ok($$select public.publish_meet_signal('e325-video','ice','{"candidate":"x"}')$$,'P0001',null,'signal write budget enforced');
select throws_ok($$select public.list_meet_signals('e325-video',null)$$,'P0001',null,'signal read budget enforced');
reset role;

-- Authorized evidence reads are audited; foreign messages/reports and SDP/ICE
-- must never appear in a session-scoped evidence bundle.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e3250000-0000-0000-0000-000000000005","role":"authenticated"}',true);
select set_config('test.e325_bundle',public.moderate_meet_session('e325-live')::text,true);
select is(jsonb_array_length(current_setting('test.e325_bundle')::jsonb->'messages'),2,'staff sees only this session transcript');
select is(jsonb_array_length(current_setting('test.e325_bundle')::jsonb->'reports'),2,'staff sees only this session report targets');
select is(position('FOREIGN_EVIDENCE_MARKER' in current_setting('test.e325_bundle')),0,'foreign evidence excluded');
select is(position('FOREIGN_REPORT_MARKER' in current_setting('test.e325_bundle')),0,'foreign report evidence excluded');
select is(current_setting('test.e325_bundle')::jsonb ? 'signals',false,'signaling is excluded from moderation payload');
select is(position('NETWORK_ADDRESS_MARKER' in public.moderate_meet_session('e325-video')::text),0,'staff bundle excludes actual stored ICE payload');
select throws_ok($$select public.moderate_meet_session('e325-missing')$$,'P0002','session not found','missing staff read fails');
reset role;
select is((select count(*)::int from public.meet_moderation_reads where session_id='e325-live'),1,'successful staff read persisted exactly one audit row');
select is((select count(*)::int from public.meet_moderation_reads where session_id='e325-missing'),0,'failed staff read has no fabricated audit');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e3250000-0000-0000-0000-000000000006","role":"authenticated"}',true);
select is((select count(*)::int from public.meet_moderation_reads),0,'ordinary user cannot see populated moderation audit');
select is((select count(*)::int from public.reports where target_id in ('e325-live','e325-mb')),0,'ordinary user cannot read populated peer reports');
reset role;
insert into public.rate_limit_events(actor_id,action) select 'e325-staff','meet_moderate_read' from generate_series(1,60);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e3250000-0000-0000-0000-000000000005","role":"authenticated"}',true);
select throws_ok($$select public.moderate_meet_session('e325-live')$$,'P0001',null,'staff evidence reads are rate limited');
reset role;

-- Assumption 3: simulate permitted future retention deletion only after reports
-- are closed. This is a fixture deletion, not a claim that E3.7 exists.
update public.reports set status='resolved' where target_id in ('e325-live','e325-mb');
select is(public.meet_session_under_review('e325-live'),false,'resolved evidence is no longer pinned');
delete from public.meet_sessions where id='e325-live';
select is((select count(*)::int from public.meet_messages where session_id='e325-live'),0,'session deletion cascades transcript');
select is((select count(*)::int from public.meet_moderation_reads where session_id='e325-live'),1,'moderation read audit survives permitted session deletion');

-- Idempotent expiry must preserve the first end timestamp and release seats.
select lives_ok($$select public.expire_stale_meet_sessions(1000)$$,'sweep closes expired fixtures');
select is((select status::text from public.meet_sessions where id='e325-video'),'ended','sweep persists end state');
select is((select count(*)::int from public.meet_participants where session_id='e325-video' and left_at is null),0,'sweep releases both seats');
select set_config('test.e325_end',(select ended_at::text from public.meet_sessions where id='e325-video'),true);
select is(public.expire_stale_meet_sessions(1000),0,'second sweep is a no-op');
select is((select ended_at::text from public.meet_sessions where id='e325-video'),current_setting('test.e325_end'),'repeated sweep preserves end timestamp');

-- Assumption 2: REAL second-backend locks, not regex assertions about SKIP LOCKED.
-- The socket-only connection targets this disposable database, never a URL.
create extension if not exists dblink with schema extensions;
select dblink_connect('e325_locker',format('host=/var/run/postgresql dbname=%L user=postgres connect_timeout=3 application_name=e325_locker',current_database()));
select dblink_connect('e325_worker',format('host=/var/run/postgresql dbname=%L user=postgres connect_timeout=3 application_name=e325_worker',current_database()));
select dblink_exec('e325_worker',$remote$set statement_timeout='3s'$remote$);
select dblink_exec('e325_locker',$remote$
 insert into auth.users(id) values
 ('e3250000-0000-0000-0000-000000000011'),('e3250000-0000-0000-0000-000000000012'),
 ('e3250000-0000-0000-0000-000000000013'),('e3250000-0000-0000-0000-000000000014');
 update public.profiles set id='e325-lock-'||right(auth_user_id::text,2),handle='e325_lock_'||right(auth_user_id::text,2),name='E325 lock fixture'
 where auth_user_id::text like 'e3250000-0000-0000-0000-00000000001%';
 insert into public.meet_sessions(id,mode,expires_at) values
 ('e325-lock-1','ANYWHERE',now()-interval '3 minutes'),
 ('e325-lock-2','ANYWHERE',now()-interval '2 minutes'),
 ('e325-lock-3','ANYWHERE',now()-interval '1 minute');
 insert into public.meet_queue(id,profile_id,mode,queued_at) values
 ('e325-lock-q1','e325-lock-11','ANYWHERE',now()-interval '4 minutes'),
 ('e325-lock-q2','e325-lock-12','ANYWHERE',now()-interval '3 minutes'),
 ('e325-lock-q3','e325-lock-13','ANYWHERE',now()-interval '2 minutes'),
 ('e325-lock-q4','e325-lock-14','ANYWHERE',now()-interval '1 minute');
 $remote$);
select dblink_exec('e325_locker','begin');
select id from dblink('e325_locker',$remote$select id from public.meet_sessions where id='e325-lock-1' for update$remote$) as t(id text);
select is((select n from dblink('e325_worker','select public.expire_stale_meet_sessions(1)') as t(n integer)),1,'contending sweep skips locked oldest row and drains another');
select is((select status from dblink('e325_worker',$remote$select status::text from public.meet_sessions where id='e325-lock-1'$remote$) as t(status text)),'active','locked row remains untouched');
select is((select n from dblink('e325_worker','select public.expire_stale_meet_sessions(1)') as t(n integer)),1,'second batch drains remaining unlocked backlog');
select is((select n from dblink('e325_worker','select public.expire_stale_meet_sessions(1)') as t(n integer)),0,'only locked backlog remains');
select dblink_exec('e325_locker','commit');
select is((select n from dblink('e325_worker','select public.expire_stale_meet_sessions(1)') as t(n integer)),1,'released oldest row drains on next sweep');
select is((select n from dblink('e325_worker','select public.expire_stale_meet_sessions(1)') as t(n integer)),0,'drained backlog does not loop');

select dblink_exec('e325_locker','begin');
select id from dblink('e325_locker',$remote$select id from public.meet_queue where id='e325-lock-q1' for update$remote$) as t(id text);
select ok((select (payload->>'matched')::boolean from dblink('e325_worker',$remote$select public.try_meet_match('e325-lock-q2')$remote$) as t(payload jsonb)),'matching skips a locked candidate and matches another');
select is((select status from dblink('e325_worker',$remote$select status::text from public.meet_queue where id='e325-lock-q1'$remote$) as t(status text)),'waiting','locked candidate is not stolen');
select is((select n from dblink('e325_worker',$remote$select count(distinct matched_session_id)::integer from public.meet_queue where id in ('e325-lock-q2','e325-lock-q3') and status='matched'$remote$) as t(n integer)),1,'both unlocked peers share one committed session');
select dblink_exec('e325_locker','commit');
select ok((select (payload->>'matched')::boolean from dblink('e325_worker',$remote$select public.try_meet_match('e325-lock-q1')$remote$) as t(payload jsonb)),'released candidate can match later instead of starving');
select is((select n from dblink('e325_worker',$remote$select count(*)::integer from (select profile_id from public.meet_participants where profile_id like 'e325-lock-%' and left_at is null group by profile_id having count(*)>1) duplicates$remote$) as t(n integer)),0,'contended matching does not duplicate active seats');
select dblink_exec('e325_worker',$remote$
 delete from public.meet_sessions where id like 'e325-lock-%'
   or id in (select matched_session_id from public.meet_queue where id like 'e325-lock-%');
 delete from auth.users where id::text like 'e3250000-0000-0000-0000-00000000001%';
 $remote$);
select dblink_disconnect('e325_locker');
select dblink_disconnect('e325_worker');
select finish();
rollback;

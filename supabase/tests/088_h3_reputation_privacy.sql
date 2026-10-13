-- PREPARED ONLY in Step 4E: no execution authorized. Requires applied H3
-- migration and an independently authorized pgTAP environment. Fixture-only,
-- transaction rollback, consistent with existing role-context test conventions.
begin;
select no_plan();
reset role;
select set_config('request.jwt.claims', null, true);

select ok((select relrowsecurity from pg_class where oid='public.reputation_events'::regclass), 'ledger RLS enabled');
select is(has_table_privilege('anon','public.reputation_events','SELECT'),false,'anon has no table SELECT, including inherited grants');
select is(has_any_column_privilege('anon','public.reputation_events','SELECT'),false,'anon has no column SELECT, including PUBLIC/inherited grants');
select is(has_table_privilege('authenticated','public.reputation_events','SELECT'),false,'authenticated has no table-wide SELECT bypass');
select ok((select bool_and(has_column_privilege('authenticated','public.reputation_events',column_name,'SELECT'))
  from information_schema.columns where table_schema='public' and table_name='reputation_events'
  and column_name in ('id','profile_id','clash_id','arena_room_id','kind','reputation_delta','coins_delta','created_at')), 'owner history columns granted');
select is((select count(*)::int from pg_attribute a where a.attrelid='public.reputation_events'::regclass
  and a.attnum>0 and not a.attisdropped and a.attname <> all(array['id','profile_id','clash_id','arena_room_id','kind','reputation_delta','coins_delta','created_at'])
  and has_column_privilege('authenticated',a.attrelid,a.attnum,'SELECT')),0,'no unapproved effective column grants');
select is((select count(*)::int from pg_policy where polrelid='public.reputation_events'::regclass
  and polname='reputation events are readable by everyone'),0,'public permissive policy removed');
select ok(exists(select 1 from pg_policy where polrelid='public.reputation_events'::regclass
  and polname='reputation history owner boundary' and not polpermissive and polcmd='r'),'restrictive owner gate prevents permissive-policy overlap');
select is(has_table_privilege('authenticated','public.reputation_events','INSERT'),false,'client cannot forge rewards');
select ok(has_table_privilege('service_role','public.reputation_events','INSERT'),'service INSERT retained');
select is((select count(*)::int from pg_roles where rolname in ('anon','authenticated') and (rolbypassrls or rolsuper)),0,'client roles cannot bypass RLS');
select ok(has_table_privilege('service_role','public.reputation_events','SELECT'),'service SELECT retained');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
  where oid='public.my_profile_id()'::regprocedure),'caller identity helper remains trusted with empty search path');

insert into auth.users(id) values
 ('00000000-0000-0000-0000-00000000e881'),('00000000-0000-0000-0000-00000000e882'),
 ('00000000-0000-0000-0000-00000000e883'),('00000000-0000-0000-0000-00000000e884'),
 ('00000000-0000-0000-0000-00000000e885'),('00000000-0000-0000-0000-00000000e886');
update public.profiles set id='h3-author',handle='h3_author',name='H3 author',reputation=0,coins=0,streak=0,role='viewer' where auth_user_id='00000000-0000-0000-0000-00000000e881';
update public.profiles set id='h3-challenger',handle='h3_challenger',name='H3 challenger',reputation=0,coins=0,streak=0,role='viewer' where auth_user_id='00000000-0000-0000-0000-00000000e882';
update public.profiles set id='h3-owner',handle='h3_owner',name='H3 owner',reputation=0,coins=0,streak=0,role='viewer' where auth_user_id='00000000-0000-0000-0000-00000000e883';
update public.profiles set id='h3-other',handle='h3_other',name='H3 other',reputation=0,coins=0,streak=0,role='viewer' where auth_user_id='00000000-0000-0000-0000-00000000e884';
update public.profiles set id='h3-juror',handle='h3_juror',name='H3 juror',reputation=0,coins=0,streak=0,role='viewer' where auth_user_id='00000000-0000-0000-0000-00000000e885';
update public.profiles set id='h3-staff',handle='h3_staff',name='H3 staff',reputation=0,coins=0,streak=0,role='admin' where auth_user_id='00000000-0000-0000-0000-00000000e886';

-- Trusted insert exercises the unmodified facet trigger. It is a fixture event,
-- not an invented public competition; everything in this file rolls back.
set local role service_role;
select lives_ok($$insert into public.reputation_events(id,profile_id,kind,reputation_delta,coins_delta,created_at)
  values('h3-history','h3-owner','clash_participation',7,3,'2026-10-11T00:00:00.123456Z')$$,'trusted ledger insert still works');
reset role;
select is((select score from public.profile_reputation_facets where profile_id='h3-owner' and facet='DEBATE'),7,'trusted insert synchronizes facet');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select id from public.reputation_events$$,'42501',null,'guest known-column SELECT denied');
select throws_ok($$select coins_delta,created_at from public.reputation_events where id='h3-history'$$,'42501',null,'guest known-ID reward metadata denied');
select lives_ok($$select reputation,rank from public.profiles where id='h3-owner'$$,'public reputation and rank accessible');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e883","role":"authenticated"}',true);
select is((select count(*)::int from public.reputation_events where id='h3-history'),1,'owner can read own known event');
select is((select coins_delta from public.reputation_events where id='h3-history'),3,'owner coin delta intact');
select is((select created_at::text from public.reputation_events where id='h3-history'),timestamptz '2026-10-11T00:00:00.123456Z'::text,'owner timestamp precision intact');
select is((select reputation_delta from public.reputation_events where id='h3-history'),7,'owner reputation delta intact');
select is((select kind::text from public.reputation_events where id='h3-history'),'clash_participation','owner event kind intact');
select lives_ok($$select id,profile_id,clash_id,arena_room_id,kind,reputation_delta,coins_delta,created_at from public.reputation_events$$,'approved complete owner projection works');
select is(public.get_my_arena_reputation()->>'profileId','h3-owner','own Arena reputation RPC retained');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e884","role":"authenticated"}',true);
select is((select count(*)::int from public.reputation_events where id='h3-history'),0,'unrelated known-ID event denied');
select is((select count(*)::int from public.reputation_events where profile_id='h3-owner'),0,'unrelated owner history empty');
select is((select count(coins_delta)::int from public.reputation_events where id='h3-history'),0,'column grant cannot bypass RLS');
select lives_ok($$select reputation,rank from public.profiles where id='h3-owner'$$,'unrelated public totals/rank remain');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e886","role":"authenticated"}',true);
select is((select count(*)::int from public.reputation_events where id='h3-history'),0,'staff receives no blanket ledger exception');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select is((select count(*)::int from public.reputation_events),0,'authenticated role without an identity cannot read history');
reset role;

-- Legacy start/judge/settle API call chain, no reward function rewrites.
insert into public.takes(id,author_id,hood,text,status,expires_at)
 values('h3-take','h3-author','techtakes','H3 rollback-only fixture','active',now()+interval '24 hours');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e882","role":"authenticated"}',true);
select lives_ok($$select public.start_clash('h3-take')$$,'legacy Clash creation retained');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e883","role":"authenticated"}',true);
select lives_ok($$select public.submit_judgement((select id from public.clashes where take_id='h3-take'),'A')$$,'owner juror votes A');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e884","role":"authenticated"}',true);
select lives_ok($$select public.submit_judgement((select id from public.clashes where take_id='h3-take'),'B')$$,'minority juror votes B');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e885","role":"authenticated"}',true);
select lives_ok($$select public.submit_judgement((select id from public.clashes where take_id='h3-take'),'A')$$,'second majority juror votes A');
reset role;
update public.clashes set opens_at=now()-interval '2 hours',closes_at=now()-interval '1 hour' where take_id='h3-take';
set local role service_role;
select set_config('request.jwt.claims',null,true);
select lives_ok($$select public.settle_clash((select id from public.clashes where take_id='h3-take'))$$,'trusted background settlement requires no interactive user');
reset role;
select is((select reputation from public.profiles where id='h3-owner'),120,'majority juror reputation unchanged');
select is((select coins from public.profiles where id='h3-owner'),40,'majority juror coins unchanged');
select is((select reputation from public.profiles where id='h3-other'),25,'dissent juror reputation unchanged');
select is((select coins from public.profiles where id='h3-other'),18,'dissent juror coins unchanged');
select is((select count(*)::int from public.reputation_events where clash_id=(select id from public.clashes where take_id='h3-take')),6,'six legacy reward events');
select is((select score from public.profile_reputation_facets where profile_id='h3-owner' and facet='DEBATE'),127,'settlement still synchronizes facets');
create temporary table h3_snapshot as select
 (select count(*) from public.notifications where recipient_id like 'h3-%') as notifications,
 (select sum(reputation) from public.profiles where id like 'h3-%') as reputation;
set local role service_role;
select lives_ok($$select public.settle_clash((select id from public.clashes where take_id='h3-take'))$$,'legacy settlement retry succeeds');
reset role;
select is((select count(*)::int from public.verdicts where clash_id=(select id from public.clashes where take_id='h3-take')),1,'retry keeps one verdict');
select is((select count(*)::int from public.reputation_events where clash_id=(select id from public.clashes where take_id='h3-take')),6,'retry keeps six rewards');
select is((select sum(reputation) from public.profiles where id like 'h3-%'),(select reputation from h3_snapshot),'retry cannot award reputation twice');
select is((select count(*) from public.notifications where recipient_id like 'h3-%'),(select notifications from h3_snapshot),'retry cannot duplicate notifications');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e883","role":"authenticated"}',true);
select is((select count(*)::int from public.reputation_events where clash_id=(select id from public.clashes where take_id='h3-take')),2,'juror sees only own settled reward events');
select is((select count(*)::int from public.judgements where clash_id=(select id from public.clashes where take_id='h3-take')),1,'juror sees only own settled ballot');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e881","role":"authenticated"}',true);
select is((select count(*)::int from public.reputation_events where clash_id=(select id from public.clashes where take_id='h3-take')),0,'fighter cannot join identified juror rewards to verdict');
select is((select count(*)::int from public.judgements where clash_id=(select id from public.clashes where take_id='h3-take')),0,'settlement does not publish individual ballots');
reset role;

-- GROUP fixture exercises all four original award categories through the trusted
-- wrapper. Existing canonical/zero-vote/DRAW suites must also run later.
insert into public.arena_daily_topics(id,title,hood,status,opens_at,final_arguments_at,judging_at,closes_at)
 values('h3-topic','H3 rollback GROUP','techtakes','closed',now()-interval '4 hours',now()-interval '3 hours',now()-interval '2 hours',now()-interval '1 hour');
insert into public.arena_rooms(id,topic_id,status,capacity,participant_count,opens_at,closes_at)
 values('h3-room','h3-topic','JUDGING',40,4,now()-interval '4 hours',now()-interval '1 hour');
insert into public.arena_room_participants(room_id,topic_id,profile_id,initial_stance,role)
 select 'h3-room','h3-topic',p,'AGREE','debater' from unnest(array['h3-owner','h3-other','h3-juror','h3-author']) p;
insert into public.arena_room_messages(id,room_id,author_id,body) values('h3-message','h3-room','h3-owner','Fixture argument');
insert into public.arena_room_evidence(id,room_id,topic_id,author_id,kind,title,source_url,useful_count)
 values('h3-evidence','h3-room','h3-topic','h3-owner','link','Fixture evidence','https://example.com/h3',3);
insert into public.arena_room_side_votes(room_id,profile_id,side) values('h3-room','h3-owner','AGREE'),('h3-room','h3-other','DISAGREE'),('h3-room','h3-juror','AGREE');
insert into public.arena_room_argument_votes(room_id,profile_id,message_id) values('h3-room','h3-other','h3-message');
set local role service_role;
select set_config('request.jwt.claims',null,true);
select is(public.settle_arena_room('h3-room')->>'winningSide','AGREE','trusted GROUP settlement retained');
select lives_ok($$select public.settle_arena_room('h3-room')$$,'GROUP settlement retry succeeds');
reset role;
select is((select count(*)::int from public.reputation_events where arena_room_id='h3-room'),8,'GROUP retry pays each award once');
select is((select sum(reputation_delta)::int from public.reputation_events where arena_room_id='h3-room' and profile_id='h3-owner'),90,'GROUP owner rewards unchanged: 10+25+40+15');
select is((select sum(reputation_delta)::int from public.reputation_events where arena_room_id='h3-room' and profile_id='h3-other'),10,'GROUP losing side participation unchanged');
select is((select sum(coins_delta)::int from public.reputation_events where arena_room_id='h3-room'),0,'GROUP pays no coins');
select is((select count(*)::int from public.arena_room_results where room_id='h3-room'),1,'GROUP result idempotent');
select is((select score from public.profile_reputation_facets where profile_id='h3-owner' and facet='EVIDENCE'),15,'GROUP evidence facet synchronization retained');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e884","role":"authenticated"}',true);
select is((select count(*)::int from public.reputation_events where arena_room_id='h3-room' and profile_id='h3-owner'),0,'GROUP member cannot inspect another reward ledger');
select is((select count(*)::int from public.arena_room_side_votes where room_id='h3-room'),1,'GROUP ballots remain private');
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is((select winning_side::text from public.arena_room_results where room_id='h3-room'),'AGREE','public GROUP result remains accessible');
select lives_ok($$select public.reputation_facet_json('h3-owner'),public.arena_standing_for('h3-owner')$$,'existing public aggregate RPCs unchanged (differencing risk remains)');
reset role;
select finish();
rollback;

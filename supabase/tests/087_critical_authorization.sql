-- Transaction-only fixtures; requires the Step 4C migration on an authorized test DB.
begin;
select no_plan();
reset role;
select set_config('request.jwt.claims', null, true);
insert into auth.users(id) values
 ('cf11000c-0000-4000-8000-000000000001'),
 ('cf11000c-0000-4000-8000-000000000002'),
 ('cf11000c-0000-4000-8000-000000000003');
update public.profiles set id='hard-creator',handle='hard_creator',role='creator'
 where auth_user_id='cf11000c-0000-4000-8000-000000000001';
update public.profiles set id='hard-fan',handle='hard_fan'
 where auth_user_id='cf11000c-0000-4000-8000-000000000002';
update public.profiles set id='hard-other',handle='hard_other'
 where auth_user_id='cf11000c-0000-4000-8000-000000000003';
insert into public.creator_vaults(id,creator_id,title,status)
 values('hard-vault','hard-creator','Rolled back vault','active');
insert into public.media_objects(id,owner_id,bucket,storage_path,media_kind,mime_type,status,visibility)
 values('hard-media','hard-creator','private-media','hard-creator/test.mp4','video','video/mp4','ready','private');
insert into public.creator_courses(id,creator_id,title,access_type,status)
 values('hard-course','hard-creator','Rolled back course','subscriber','published');
insert into public.course_lessons(id,course_id,title,position,body_text,media_object_id,content_type,access_type,status)
 values('hard-lesson','hard-course','Locked',1,'PRIVATE BODY','hard-media','video','subscriber','published');
insert into public.course_lessons(id,course_id,title,position,body_text,access_type,status,preview_allowed) values
 ('hard-free','hard-course','Free',2,'FREE BODY','free','published',false),
 ('hard-preview','hard-course','Preview',3,'PREVIEW BODY','subscriber','published',true),
 ('hard-paid','hard-course','Paid',4,'PAID BODY','paid','published',false);

select ok(not has_function_privilege('anon','public.clash_notify(text,text,public.notification_kind,text)','EXECUTE'),'anon effective helper execution denied');
select ok(not has_function_privilege('authenticated','public.clash_notify(text,text,public.notification_kind,text)','EXECUTE'),'authenticated effective helper execution denied');
select ok(not has_function_privilege('service_role','public.clash_notify(text,text,public.notification_kind,text)','EXECUTE'),'unused service-role helper execution denied');
select ok(has_table_privilege('service_role','public.course_lessons','SELECT'),'trusted service table access preserved');
set local role anon;
select throws_ok($$select public.clash_notify('hard-creator','hard-other','clash_result','forged')$$,'42501',null,'guest cannot forge recipient and actor');
select throws_ok($$select body_text from public.course_lessons where id='hard-lesson'$$,'42501',null,'guest known-ID body read denied');
select throws_ok($$select media_object_id from public.course_lessons where id='hard-lesson'$$,'42501',null,'guest media ID read denied');
select throws_ok($$select * from public.course_lessons$$,'42501',null,'guest wildcard cannot bypass column grants');
select is((select count(id) from public.course_lessons where course_id='hard-course'),4::bigint,'guest catalogue counts preserved');
select is((public.course_lesson_card('hard-lesson')->>'bodyText'),'','guest locked card masks body');
select is((public.course_lesson_card('hard-paid')->>'bodyText'),'','guest paid card masks body');
select is((public.course_lesson_card('hard-free')->>'bodyText'),'FREE BODY','guest free card works');
select is((public.course_lesson_card('hard-preview')->>'bodyText'),'PREVIEW BODY','approved guest preview works');
reset role;
select set_config('request.jwt.claims','{"sub":"cf11000c-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.clash_notify('hard-fan','hard-creator','reputation','forged')$$,'42501',null,'authenticated arbitrary notification forgery denied');
select throws_ok($$select body_text from public.course_lessons where id='hard-lesson'$$,'42501',null,'unrelated body SELECT denied');
select throws_ok($$select media_object_id from public.course_lessons where id='hard-lesson'$$,'42501',null,'unrelated private media SELECT denied');
select is((public.course_lesson_card('hard-lesson')->>'accessible'),'false','unrelated card denies entitlement');
select is((public.course_lesson_card('hard-lesson')->>'bodyText'),'','unrelated card contains no body');
select is(public.course_lesson_media_target('hard-lesson'),null::jsonb,'unrelated media target denied');
select throws_ok($$select public.can_access_course_lesson('hard-creator','hard-lesson')$$,'42501',null,'cannot impersonate creator in entitlement helper');
select lives_ok($$select id,course_id,title,description,position,content_type,preview_allowed,access_type,status,created_at,updated_at from public.course_lessons order by position$$,'all approved catalogue fields remain selectable');
reset role;
insert into public.vault_subscriptions(id,subscriber_id,vault_id,status,started_at,current_period_end)
 values('hard-sub','hard-fan','hard-vault','active',now()-interval '2 days',now()+interval '1 day');
select set_config('request.jwt.claims','{"sub":"cf11000c-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is(public.course_lesson_card('hard-lesson')->>'bodyText','PRIVATE BODY','entitled subscriber gets body via RPC');
select ok(public.course_lesson_media_target('hard-lesson') is not null,'entitled subscriber gets authorized media target');
select throws_ok($$select body_text from public.course_lessons$$,'42501',null,'even entitled clients use guarded content RPC');
reset role;
update public.vault_subscriptions set current_period_end=now()-interval '1 hour' where id='hard-sub';
set local role authenticated;
select is(public.course_lesson_card('hard-lesson')->>'bodyText','','expired subscriber body denied');
select is(public.course_lesson_media_target('hard-lesson'),null::jsonb,'expired subscriber media denied');
reset role;
update public.vault_subscriptions set current_period_end=now()+interval '1 day',status='cancelled' where id='hard-sub';
set local role authenticated;
select is(public.course_lesson_card('hard-lesson')->>'bodyText','','revoked subscriber body denied');
select is(public.course_lesson_media_target('hard-lesson'),null::jsonb,'revoked subscriber media denied');
reset role;
select set_config('request.jwt.claims','{"sub":"cf11000c-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(public.course_lesson_card('hard-lesson')->>'bodyText','PRIVATE BODY','creator content RPC preserved');
select ok(public.course_lesson_media_target('hard-lesson') is not null,'creator media target preserved');
select throws_ok($$select body_text from public.course_lessons$$,'42501',null,'creator direct content read also withheld');
reset role;

-- Legitimate authenticated start followed by background settlement, no JWT needed.
insert into public.takes(id,author_id,hood,text,is_runtime_fixture)
 values('hard-take','hard-creator','techtakes','Rolled back notification fixture',true);
select set_config('request.jwt.claims','{"sub":"cf11000c-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select lives_ok($$select public.start_clash('hard-take')$$,'trusted start still invokes owner-only helper');
reset role;
select is((select count(*) from public.notifications where kind='clash_started' and recipient_id='hard-creator' and actor_id='hard-fan'),1::bigint,'real creation notification has correct actor and recipient');
insert into public.judgements(clash_id,juror_id,side)
 select id,'hard-other','A' from public.clashes where take_id='hard-take';
update public.clashes set opens_at=now()-interval '2 hours',closes_at=now()-interval '1 hour' where take_id='hard-take';
select set_config('request.jwt.claims',null,true);
select lives_ok($$select public.settle_clash((select id from public.clashes where take_id='hard-take'))$$,'background settlement with no interactive identity works');
select is((select count(*) from public.notifications where entity_id=(select id from public.clashes where take_id='hard-take') and kind='clash_result'),2::bigint,'both fighters receive genuine result notifications');
select is((select count(*) from public.notifications where entity_id=(select id from public.clashes where take_id='hard-take') and kind='reputation'),1::bigint,'juror receives one genuine reward notification');
select lives_ok($$select public.settle_clash((select id from public.clashes where take_id='hard-take'))$$,'settlement retry succeeds');
select is((select count(*) from public.notifications where entity_id=(select id from public.clashes where take_id='hard-take')),4::bigint,'retry creates no duplicate notifications');
select is((select count(*) from public.notifications where entity_id='forged'),0::bigint,'denied direct calls created no forged rows');
select * from finish();
rollback;

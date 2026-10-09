-- Isolated local fixtures: everything rolls back; no discovery activity persists.
begin;
select no_plan();
reset role;
select set_config('request.jwt.claims',null,true);
insert into auth.users(id) values
 ('00000000-0000-0000-0000-00000000e821'),('00000000-0000-0000-0000-00000000e822'),
 ('00000000-0000-0000-0000-00000000e823'),('00000000-0000-0000-0000-00000000e824');
update profiles set id='es-a',handle='es_a',name='Explore Security A',role='creator',public_country_code='ZX' where auth_user_id='00000000-0000-0000-0000-00000000e821';
update profiles set id='es-b',handle='es_b',name='Explore Security B',public_country_code='ZX' where auth_user_id='00000000-0000-0000-0000-00000000e822';
update profiles set id='es-c',handle='es_c',name='Explore Security C',public_country_code='ZY' where auth_user_id='00000000-0000-0000-0000-00000000e823';
update profiles set id='es-d',handle='es_d',name='Explore Security D',public_country_code='ZZ' where auth_user_id='00000000-0000-0000-0000-00000000e824';
-- Anonymous boundary tests through every aggregate surface, without asserting anonymity of public profiles.
select set_config('role','anon',true);
select is(public.explore_country_activity_count('ZW'),null::integer,'zero profiles are suppressed');
select is(public.explore_country_activity_count('ZY'),null::integer,'one profile is suppressed in callable helper');
select is(public.explore_country_activity_count('ZX'),null::integer,'two profiles are suppressed in callable helper');
select is(public.get_explore_country('ZX')->>'activityCount',null::text,'country detail suppresses two profiles');
select ok(not (public.get_explore_world_summary()->'countries') @> '[{"countryCode":"ZX"}]','summary suppresses two profiles');
select ok(not(public.search_explore('Explore Security')->'people')::text like '%auth_user_id%','public people projection has no internal linkage');
select throws_ok($$select public.explore_actor_hidden('es-a','es-b')$$,'42501',null,'anonymous arbitrary viewer denied');
select is(public.explore_actor_hidden(null,'es-a'),false,'anonymous own-null visibility is callable');
reset role;
update profiles set public_country_code='ZX' where id='es-c';
select set_config('role','anon',true);
select is(public.explore_country_activity_count('ZX'),3,'three profiles publish aggregate');
select is((public.get_explore_country('ZX')->>'activityCount')::int,3,'detail matches threshold');
select ok((public.get_explore_world_summary()->'countries') @> '[{"countryCode":"ZX","activityCount":3}]','summary matches threshold');
reset role;
update profiles set public_country_code='ZX' where id='es-d';
select set_config('role','anon',true);
select is(public.explore_country_activity_count('ZX'),4,'larger population publishes count');
select is((public.get_explore_country('ZX')->>'activityCount')::int,4,'detail matches larger population');
reset role;
insert into media_objects(id,owner_id,bucket,storage_path,media_kind,mime_type,visibility,status) values
 ('es-ready','es-a','public-media','es/ready.jpg','image','image/jpeg','public','ready'),
 ('es-deleted','es-a','public-media','es/deleted.jpg','image','image/jpeg','public','ready'),
 ('es-private','es-a','private-media','es/private.jpg','image','image/jpeg','private','ready'),
 ('es-uploading','es-a','public-media','es/uploading.jpg','image','image/jpeg','public','uploading');
update media_objects set deleted_at=now() where id='es-deleted';
insert into takes(id,author_id,hood,text,status,created_at,expires_at,reactions_count,media_object_id,media_url,is_runtime_fixture) values
 ('es-take','es-a','techtakes','Explore Security public','active',now(),now()+interval '1 day',10,'es-ready','https://example.com/ready.jpg',false),
 ('es-take-fixture','es-a','techtakes','Explore Security fixture','active',now(),now()+interval '1 day',10,null,null,true),
 ('es-take-removed','es-a','techtakes','Explore Security removed','removed',now(),now()+interval '1 day',10,null,null,false),
 ('es-take-expired','es-a','techtakes','Explore Security expired','active',now()-interval '2 days',now()-interval '1 day',10,null,null,false),
 ('es-take-private','es-a','techtakes','Explore Security private','active',now(),now()+interval '1 day',10,'es-private','https://example.com/private.jpg',false),
 ('es-take-deleted','es-a','techtakes','Explore Security deleted','active',now(),now()+interval '1 day',10,'es-deleted','https://example.com/deleted.jpg',false),
 ('es-take-uploading','es-a','techtakes','Explore Security uploading','active',now(),now()+interval '1 day',10,'es-uploading','https://example.com/uploading.jpg',false);
insert into explore_challenges(id,title,challenge_type,creator_id,starts_at,ends_at,status,visibility) values
 ('es-ch','Explore Security public','GLOBAL','es-a',now()-interval '1 day',now()+interval '1 day','active','public'),
 ('es-ch-private','Explore Security unlisted','GLOBAL','es-a',now()-interval '1 day',now()+interval '1 day','active','unlisted'),
 ('es-ch-cancelled','Explore Security cancelled','GLOBAL','es-a',now()-interval '1 day',now()-interval '1 hour','cancelled','public'),
 ('es-ch-future','Explore Security future','GLOBAL','es-a',now()+interval '1 hour',now()+interval '1 day','active','public'),
 ('es-ch-ended','Explore Security ended','GLOBAL','es-a',now()-interval '2 days',now()-interval '1 day','active','public');
insert into explore_challenge_entries(id,challenge_id,profile_id,media_object_id,caption) values
 ('es-entry','es-ch','es-a','es-ready','public entry'),
 ('es-entry-private','es-ch-private','es-a','es-ready','unlisted entry'),
 ('es-entry-cancelled','es-ch-cancelled','es-a','es-ready','cancelled entry'),
 ('es-entry-deleted','es-ch','es-b','es-deleted','deleted media entry');
insert into explore_treasure_hunts(id,title,creator_id,starts_at,ends_at,status,visibility,clue,gifts_remaining) values
 ('es-hunt','Explore Security hunt','es-a',now()-interval '1 day',now()+interval '1 day','active','public','Find it',2),
 ('es-hunt-private','Explore Security private hunt','es-a',now()-interval '1 day',now()+interval '1 day','active','unlisted','Private',2),
 ('es-hunt-cancelled','Explore Security cancelled hunt','es-a',now()-interval '1 day',now()+interval '1 day','cancelled','public','Cancelled',2),
 ('es-hunt-ended','Explore Security earned hunt','es-a',now()-interval '2 days',now()-interval '1 day','ended','public','Ended',2);
insert into explore_treasure_progress(hunt_id,profile_id,progress,completed_at) values
 ('es-hunt','es-b',1,now()),('es-hunt-private','es-b',1,now()),('es-hunt-cancelled','es-b',1,now()),('es-hunt-ended','es-b',1,now());
insert into explore_treasure_clues(id,hunt_id,sort_order,clue_type,prompt,answer_digest) values
 ('es-clue','es-hunt',1,'TEXT_ANSWER','Say secret',public.explore_answer_digest('es-clue','secret')),
 ('es-clue-private','es-hunt-private',1,'TEXT_ANSWER','Private',public.explore_answer_digest('es-clue-private','secret'));
update media_objects set deleted_at=null where id='es-deleted';
insert into creator_vaults(id,creator_id,title,status) values('es-vault','es-a','Security Vault','active');
insert into vault_drops(id,vault_id,creator_id,caption,media_object_id,access_level,status,published_at,expires_at,public_preview_media_object_id) values
 ('es-v-free','es-vault','es-a','Public','es-ready','free','published',now(),now()+interval '7 days',null),
 ('es-v-deleted','es-vault','es-a','Deleted','es-deleted','free','published',now(),now()+interval '7 days',null),
 ('es-v-secret','es-vault','es-a','Subscriber','es-private','subscriber','published',now(),now()+interval '7 days',null),
 ('es-v-teaser','es-vault','es-a','Teaser','es-private','subscriber','published',now(),now()+interval '7 days','es-ready'),
 ('es-v-deleted-teaser','es-vault','es-a','Deleted teaser','es-private','subscriber','published',now(),now()+interval '7 days','es-deleted'),
 ('es-v-expired','es-vault','es-a','Expired','es-ready','free','published',now()-interval '8 days',now()-interval '1 day',null);
update media_objects set deleted_at=now() where id='es-deleted';
select set_config('role','anon',true);
select ok(public.list_explore_vault_previews(40)::text like '%es-v-free%','public free media remains visible');
select ok(public.list_explore_vault_previews(40)::text like '%es-v-teaser%','intentional subscriber teaser remains visible');
select ok(public.list_explore_vault_previews(40)::text not like '%es/private.jpg%','subscriber source path stays confidential');
select ok(public.list_explore_vault_previews(40)::text !~ 'es-v-(deleted|secret|expired)','deleted, expired and subscriber-only drops stay excluded');
select ok(public.search_explore('Explore Security')->'takes' @> '[{"id":"es-take"}]','anonymous trusted RPC returns public Take');
select ok(not (public.search_explore('Explore Security')->'takes')::text ~ 'es-take-(fixture|removed|expired|private|deleted|uploading)','search excludes unsafe Takes');
select ok(not(public.get_explore_for_you(40,0)->'items')::text ~ 'es-take-(fixture|removed|expired|private|deleted|uploading)','For You excludes unsafe Takes');
select ok(not(public.get_explore_country('ZX')->'takes')::text ~ 'es-take-(fixture|removed|expired|private|deleted|uploading)','country excludes unsafe Takes');
select ok(not(public.get_global_viral(24)->'items')::text ~ 'es-take-(fixture|removed|expired|private|deleted|uploading)','viral excludes unsafe Takes');
select ok(not(public.get_explore_live(40)->'takes')::text ~ 'es-take-(fixture|removed|expired|private|deleted|uploading)','Live Takes exclude unsafe rows');
select is((select count(*)::int from explore_challenge_entries where id in ('es-entry-private','es-entry-cancelled','es-entry-deleted')),0,'direct REST-equivalent entries enforce parent/media');
select is(jsonb_array_length(public.list_challenge_entries('es-ch-private')->'items'),0,'known unlisted challenge ID cannot list entries');
select throws_ok($$select public.get_challenge_detail('es-ch-cancelled')$$,'P0002',null,'cancelled detail unavailable without lazy settlement');
select throws_ok($$select public.get_treasure_detail('es-hunt-cancelled')$$,'P0002',null,'cancelled hunt detail unavailable');
select is(has_table_privilege('anon','public.explore_treasure_clues','SELECT'),false,'answers remain private');
select is(has_table_privilege('anon','public.explore_readable_challenges','SELECT'),false,'private projection is not a REST shortcut');
select is(has_function_privilege('anon','public.settle_challenge(text)','EXECUTE'),false,'anon direct settlement denied');
select is(has_function_privilege('anon','public.claim_treasure_reward(text)','EXECUTE'),false,'anon reward claim denied');
select is(has_function_privilege('anon','public.host_explore_challenge(text,text,public.explore_challenge_type,text,text,timestamptz,timestamptz,public.explore_reward_type)','EXECUTE'),false,'anon host grant removed');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e822","role":"authenticated"}',true);
select set_config('role','authenticated',true);
select throws_ok($$select public.explore_actor_hidden('es-a','es-c')$$,'42501',null,'authenticated viewer spoof denied');
select is(public.explore_actor_hidden('es-b','es-a'),false,'own viewer helper works');
select throws_ok($$select public.submit_challenge_entry('es-ch','es-ready','stolen')$$,'P0004',null,'cross-owner upload rejected');
select throws_ok($$select public.submit_challenge_entry('es-ch-future','es-ready','early')$$,'P0003',null,'future challenge cannot accept participation');
select throws_ok($$select public.join_challenge('es-ch-private')$$,'42501',null,'known unlisted challenge join denied');
select throws_ok($$select public.settle_challenge('es-ch-cancelled')$$,'42501',null,'cancelled challenge cannot manufacture result');
select throws_ok($$select public.claim_treasure_reward('es-hunt-private')$$,'42501',null,'earned but unlisted hunt claim denied');
select throws_ok($$select public.claim_treasure_reward('es-hunt-cancelled')$$,'42501',null,'earned but cancelled hunt claim denied');
select throws_ok($$select public.submit_treasure_answer('es-hunt-private','es-clue-private','secret')$$,'42501',null,'known unlisted clue answer denied');
select ok((public.claim_treasure_reward('es-hunt')->>'claimed')::boolean,'genuine completed claim succeeds');
select ok((public.claim_treasure_reward('es-hunt')->>'alreadyClaimed')::boolean,'successful claim remains idempotent');
select ok((public.claim_treasure_reward('es-hunt-ended')->>'claimed')::boolean,'earned reward after normal expiry remains compatible');
select is((select count(*)::int from explore_treasure_progress where profile_id='es-c'),0,'cross-user progress remains denied');
select lives_ok($$select public.mute_profile('es-a')$$,'one-way mute succeeds');
select is(public.explore_actor_hidden('es-b','es-a'),true,'own mute respected');
select is(jsonb_array_length(public.search_explore('Explore Security')->'takes'),0,'mute removes trusted discovery');
select is((select count(*)::int from explore_challenges where id='es-ch'),0,'mute applies to direct activity reads');
select is(jsonb_array_length(public.list_challenge_entries('es-ch')->'items'),0,'mute applies to known-ID entry listing');
select throws_ok($$select public.join_challenge('es-ch')$$,'42501',null,'mute applies to write authorization');
select throws_ok($$select public.claim_treasure_reward('es-hunt')$$,'42501',null,'successful retry cannot bypass newly muted creator');
select lives_ok($$select public.unmute_profile('es-a')$$,'mute removed');
select lives_ok($$select public.block_profile('es-a')$$,'block succeeds');
select is(jsonb_array_length(public.get_explore_country('ZX')->'takes'),0,'block hides country Take');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000e821","role":"authenticated"}',true);
select set_config('role','authenticated',true);
select is(public.explore_actor_hidden('es-a','es-b'),true,'reverse block respected after account switch');
select is((select count(*)::int from explore_challenge_entries where id='es-entry-deleted'),0,'deleted attachment is never discoverable');
reset role;
select is((select count(*)::int from explore_challenge_results where challenge_id='es-ch-cancelled'),0,'denied cancelled settlement has no side effect');
select is((select gifts_remaining from explore_treasure_hunts where id='es-hunt'),1,'idempotent claim charges gift once');
select is((select gifts_remaining from explore_treasure_hunts where id='es-hunt-private'),2,'denied private claim charges no gifts');
select is((select count(*)::int from explore_treasure_reward_claims where hunt_id='es-hunt' and profile_id='es-b'),1,'one authoritative reward row');
select * from finish();
rollback;

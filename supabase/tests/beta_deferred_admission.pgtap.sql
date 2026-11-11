begin;
select no_plan();
-- Invoker helper: the tested call executes under the actual SET ROLE, not owner.
create function pg_temp.beta_closed_rpcs() returns setof text language plpgsql as $$
declare r record; args text;
begin
  for r in select * from pg_proc where pronamespace='public'::regnamespace and proname=any(array[
    'create_vault','create_vault_drop','publish_vault_drop','create_collection','add_drop_to_collection',
    'create_creator_service','create_creator_course','create_creator_product','create_course_lesson',
    'create_vault_community','create_creator_world_drop','create_arena_crew','request_arena_crew_join',
    'invite_to_arena_crew','request_creator_service','vault_grant_test_subscription',
    'start_creator_ai_conversation','add_creator_ai_knowledge','start_digital_creator_session',
    'set_creator_digital_version','create_world_drop','claim_world_drop','host_explore_challenge',
    'host_explore_treasure','create_advertiser','activate_advertiser','create_sponsor_campaign',
    'assign_creator_to_campaign','create_campaign_referral_link','create_campaign_coupon',
    'create_media_upload','create_arena_question','create_prediction_game','submit_prediction',
    'create_world_mission','create_arena_daily_topic']) order by proname loop
    select string_agg('NULL::'||t::regtype::text,',' order by ord) into args
      from unnest(r.proargtypes::oid[]) with ordinality as a(t,ord);
    return next throws_ok(format('select public.%I(%s)',r.proname,coalesce(args,'')),
      '42501',null,current_user||': '||r.proname||' denies before effects');
  end loop;
end $$;
set local role anon;
select * from pg_temp.beta_closed_rpcs();
reset role;
set local role authenticated;
select * from pg_temp.beta_closed_rpcs();
reset role;
set local role service_role;
select * from pg_temp.beta_closed_rpcs();
reset role;
select is((select count(*)::integer from public.creator_vaults),0,'denials created no Vault');
select is((select count(*)::integer from public.media_objects),0,'denials created no media');
select is((select count(*)::integer from public.rate_limit_events),0,'denials left no rate events');
insert into auth.users(id) values('00000000-0000-0000-0000-00000000c101'),
 ('00000000-0000-0000-0000-00000000c102'),('00000000-0000-0000-0000-00000000c103');
update public.profiles set id='beta-cap-a',handle='beta_cap_a' where auth_user_id='00000000-0000-0000-0000-00000000c101';
update public.profiles set id='beta-cap-b',handle='beta_cap_b' where auth_user_id='00000000-0000-0000-0000-00000000c102';
update public.profiles set id='beta-cap-c',handle='beta_cap_c' where auth_user_id='00000000-0000-0000-0000-00000000c103';
insert into public.arena_crews(id,slug,name,created_by) values('beta-cap-crew','beta-cap-crew','A legacy Crew','beta-cap-a');
insert into public.arena_crew_memberships(crew_id,profile_id,role) values
 ('beta-cap-crew','beta-cap-a','OWNER'),('beta-cap-crew','beta-cap-b','MEMBER');
insert into public.arena_crew_follows(crew_id,profile_id) values('beta-cap-crew','beta-cap-b');
insert into public.arena_crew_invites(id,crew_id,inviter_id,recipient_id) values('beta-cap-invite','beta-cap-crew','beta-cap-a','beta-cap-c');
insert into public.arena_crew_join_requests(id,crew_id,requester_id) values('beta-cap-request','beta-cap-crew','beta-cap-c');
insert into public.creator_vaults(id,creator_id,title) values('beta-cap-vault','beta-cap-a','A pre-existing Vault');
insert into public.vault_communities(id,creator_id,vault_id,name) values('beta-cap-community','beta-cap-a','beta-cap-vault','Existing public community');
insert into public.vault_community_memberships(community_id,profile_id) values('beta-cap-community','beta-cap-b');
insert into public.explore_challenges(id,title,challenge_type,starts_at,ends_at,status)
 values('beta-cap-play','Existing Play challenge','GLOBAL',now()-interval '1 hour',now()+interval '1 day','active');
insert into public.explore_challenge_participants(challenge_id,profile_id) values('beta-cap-play','beta-cap-b');
insert into public.explore_treasure_hunts(id,title,clue,starts_at,ends_at,status)
 values('beta-cap-hunt','Existing hunt','A fictional clue',now()-interval '1 hour',now()+interval '1 day','active');
insert into public.explore_treasure_progress(hunt_id,profile_id) values('beta-cap-hunt','beta-cap-b');
create function pg_temp.beta_cap_login(who text) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-0000-0000-00000000c10'||who,'role','authenticated')::text,true)::text;
$$;
-- This synthetic DEFINER bypass exercises the write fence independently of RPC guards.
create function pg_temp.beta_forged_join() returns void language sql security definer as $$
 insert into public.explore_challenge_participants(challenge_id,profile_id) values('beta-cap-play','beta-cap-c');
$$;
select pg_temp.beta_cap_login('3');
set local role authenticated;
select throws_ok($$select public.join_arena_crew('beta-cap-crew')$$,'42501',null,'new Crew membership denied');
select throws_ok($$select public.follow_arena_crew('beta-cap-crew')$$,'42501',null,'new Crew follow denied');
select throws_ok($$select public.join_arena_group_topic('missing')$$,'42501',null,'new Group-room admission denied');
select throws_ok($$select public.respond_arena_crew_invite('beta-cap-invite',true)$$,'42501',null,'invite acceptance cannot admit');
select lives_ok($$select public.respond_arena_crew_invite('beta-cap-invite',false)$$,'invite decline preserved');
select throws_ok($$select public.enter_vault_community('beta-cap-community')$$,'42501',null,'content visibility is not membership');
select throws_ok($$select public.create_vault_community_post('beta-cap-community','discussion','New visibility-only actor cannot post.')$$,'42501',null,'post cannot implicitly admit');
select throws_ok($$select public.join_challenge('beta-cap-play')$$,'42501',null,'new Play join denied');
select throws_ok($$select public.submit_challenge_entry('beta-cap-play',null)$$,'42501',null,'Play submit cannot implicitly join');
select throws_ok($$select public.join_treasure_hunt('beta-cap-hunt')$$,'42501',null,'new hunt join denied');
select throws_ok($$select public.submit_treasure_answer('beta-cap-hunt','missing','guess')$$,'42501',null,'answer cannot implicitly create progress');
select throws_ok($$select public.complete_content_clue('beta-cap-hunt','missing','missing')$$,'42501',null,'content clue cannot implicitly join');
select throws_ok($$select pg_temp.beta_forged_join()$$,'42501',null,'DEFINER path cannot bypass admission write fence');
select pg_temp.beta_cap_login('2');
select throws_ok($$select public.join_arena_crew('beta-cap-crew')$$,'P0003',null,'existing already-in-Crew contract is unchanged');
select lives_ok($$select public.get_arena_crew('beta-cap-crew')$$,'existing Crew read remains usable');
select lives_ok($$select public.follow_arena_crew('beta-cap-crew')$$,'existing follow replay retained');
select lives_ok($$select public.unfollow_arena_crew('beta-cap-crew')$$,'existing unfollow retained');
select lives_ok($$select public.enter_vault_community('beta-cap-community')$$,'existing authorized community continuation retained');
select lives_ok($$select public.create_vault_community_post('beta-cap-community','discussion','An existing member continues a real text discussion.')$$,'existing community text participation retained');
select lives_ok($$select public.join_challenge('beta-cap-play')$$,'existing Play participant is not broadly denied');
select lives_ok($$select public.join_treasure_hunt('beta-cap-hunt')$$,'existing hunt progress retained');
select lives_ok($$select public.leave_arena_crew('beta-cap-crew')$$,'existing Crew Leave preserved');
select throws_ok($$select public.join_arena_crew('beta-cap-crew')$$,'42501',null,'departed member cannot reopen admission');
select pg_temp.beta_cap_login('1');
select lives_ok($$select public.decide_arena_crew_join_request('beta-cap-request',false)$$,'owner may decline existing join request');
select lives_ok($$select public.set_vault_community_status('beta-cap-community','disabled')$$,'owner can disable existing community');
select throws_ok($$select public.set_vault_community_status('beta-cap-community','active')$$,'42501',null,'disabled community cannot be republished');
select lives_ok($$select public.vault_storefront('beta-cap-a')$$,'creator storefront read retained');
reset role;
select is((select count(*)::integer from public.explore_challenge_participants where profile_id='beta-cap-c'),0,'no denied participant was partially inserted');
select is((select count(*)::integer from public.vault_community_memberships where profile_id='beta-cap-c'),0,'no denied community member was inserted');
select is((select count(*)::integer from public.vault_community_posts where author_profile_id='beta-cap-c'),0,'denied post rolled back fully');
select * from finish();
rollback;

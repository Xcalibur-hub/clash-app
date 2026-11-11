begin;
-- Exact per-RPC operation guards; no schema/role-wide revocation or UI flag.
-- Hashes pin the effective reviewed bodies, including later helper hardening.
do $$ begin
  if to_regprocedure('public.guard_beta_take_identity()') is null
     or to_regprocedure('public.meet_new_admission_allowed()') is null
     or to_regclass('public.creator_live_continuation_approvals') is null then
    raise exception 'Beta prerequisites missing: Take identity, Meet gate, Creator Live correctness';
  end if;
  if public.meet_new_admission_allowed() then raise exception 'Meet admission must remain closed'; end if;
end $$;
create function public.assert_release_admission(p_capability text) returns void
language plpgsql security definer set search_path='' as $$
begin
  raise exception 'New % admission is deferred for the text-debate beta',p_capability using errcode='42501';
end $$;
revoke all on function public.assert_release_admission(text) from public,anon,authenticated,service_role;
do $patch$
declare r record; f regprocedure; definition text; patched text; body text;
begin
  for r in select * from (values
    ('public.create_vault(text,text)','2a76179cd5ba6b13019f30efec434232','creator','true'),
    ('public.create_vault_drop(text,text,vault_drop_access,text)','2bf9b7850b2afb7ae4d5f11b0d8c7a13','creator','true'),
    ('public.publish_vault_drop(text)','c2190e57424587b3ce55512c5c84c9c3','creator','true'),
    ('public.create_collection(text,text,text)','37cfd4be025de167e66766e5190898fd','creator','true'),
    ('public.add_drop_to_collection(text,text)','77272450d1d22afd52c166730930f412','creator','true'),
    ('public.create_creator_service(text,text,vault_service_category,vault_service_delivery,vault_offer_access,bigint,text,text,text)','388dc813cc8ed5afce27432a810fb8b1','creator','true'),
    ('public.create_creator_course(text,text,vault_offer_access,bigint,text,text)','e08b85d42f2468fe1a5464e7dd80e52d','creator','true'),
    ('public.create_creator_product(text,text,vault_product_type,vault_offer_access,bigint,text,text,text,vault_inventory_mode,integer)','ec0039ce4b62c2a9ef0065f64a34050c','creator','true'),
    ('public.create_course_lesson(text,text,text,vault_lesson_content,text,text,vault_offer_access,boolean)','b5e88de072ca41b46ad35ea8c8ed477e','creator','true'),
    ('public.create_vault_community(text,text,vault_community_access,boolean,text,text)','f62ed1ea911345ae5833047f7f53ff25','creator','true'),
    ('public.create_creator_world_drop(text,text,world_drop_type,world_drop_reward,text,text,double precision,double precision,text,timestamp with time zone)','82b0809bd5c2248528a075d9e72b14c6','creator','true'),
    ('public.create_arena_crew(text,text,text,arena_crew_join_mode,text[])','0d65f9b5857ffb66c94971385236a9d7','groups','true'),
    ('public.request_arena_crew_join(text)','326f6d38b1f8d15458e860481a2889ba','groups','true'),
    ('public.invite_to_arena_crew(text,text)','ed9633afbbed47b52b744a489caa2344','groups','true'),
    ('public.join_arena_crew(text)','69e71f5e043c5505c4fe64a8f159cdd0','groups','not exists(select 1 from public.arena_crew_memberships where crew_id=p_crew_id and profile_id=public.my_profile_id() and left_at is null)'),
    ('public.respond_arena_crew_invite(text,boolean)','2e0358446306d1eec525ca067fd2ab44','groups','p_accept is distinct from false'),
    ('public.decide_arena_crew_join_request(text,boolean)','499251f4b03d1347e602ef10dfc3460d','groups','p_approve is distinct from false'),
    ('public.request_creator_service(text,text)','24348a9541c61ef54e67ae996def396c','commerce','true'),
    ('public.vault_grant_test_subscription(text,text,integer)','e939fe13304070570c31ca4274ec516a','commerce','true'),
    ('public.vault_community_touch(text,text)','9d6882ec73670b054277fd599c8cda9b','commerce','not exists(select 1 from public.vault_community_memberships where community_id=p_community_id and profile_id=p_profile_id)'),
    ('public.start_creator_ai_conversation(text)','fd818b06562d66e9b49cc78986a42373','ai','true'),
    ('public.add_creator_ai_knowledge(creator_ai_knowledge_kind,text,text,text,creator_ai_access)','5f71f87d2ed1ca10f1790c48d10bb791','ai','true'),
    ('public.start_digital_creator_session(text,text)','7c8ff34e6b6d7036ccaab95ad77844ff','ai','true'),
    ('public.set_creator_digital_version(text,text,text,text,text,boolean,boolean,boolean,boolean,text)','6a11d3aa8292e92f7446996dede785e5','ai','true'),
    ('public.upsert_creator_ai_profile(text,text,text,text,creator_ai_access,jsonb,boolean,text)','37c189d0c12fc0e7ec3a51b3c3694e3f','ai','p_enabled is distinct from false or not exists(select 1 from public.creator_ai_profiles where creator_id=public.my_profile_id())'),
    ('public.create_world_drop(text,text,text,double precision,double precision)','e0d5ab5df337f416991da093d768df44','world','true'),
    ('public.claim_world_drop(text)','a00af8712d3d30ae309663fb25520f74','world','true'),
    ('public.host_explore_challenge(text,text,explore_challenge_type,text,text,timestamp with time zone,timestamp with time zone,explore_reward_type)','f96357f082a7e0ee47eddcfa6fc39c66','play','true'),
    ('public.host_explore_treasure(text,text,explore_treasure_type,text,text,text,timestamp with time zone,timestamp with time zone,explore_reward_type,jsonb,integer,jsonb)','6bf93faf71e08cf781b0982f5d27bebf','play','true'),
    ('public.join_challenge(text)','8cdf39bb5c606f582e2374bff41262fd','play','not exists(select 1 from public.explore_challenge_participants where challenge_id=p_challenge_id and profile_id=public.my_profile_id())'),
    ('public.submit_challenge_entry(text,text,text)','46fac11272ee3e39b87f5ecef4bd1b85','play','not exists(select 1 from public.explore_challenge_participants where challenge_id=p_challenge_id and profile_id=public.my_profile_id())'),
    ('public.join_treasure_hunt(text)','0e13e7905d5d2645576c8b6fb8b0c1fc','play','not exists(select 1 from public.explore_treasure_progress where hunt_id=p_hunt_id and profile_id=public.my_profile_id())'),
    ('public.submit_treasure_answer(text,text,text)','fe959603de47daa6a34c86ed7f684ddc','play','not exists(select 1 from public.explore_treasure_progress where hunt_id=p_hunt_id and profile_id=public.my_profile_id())'),
    ('public.complete_content_clue(text,text,text)','535ad817ced1a9386def8b461637dcd8','play','not exists(select 1 from public.explore_treasure_progress where hunt_id=p_hunt_id and profile_id=public.my_profile_id())'),
    ('public.create_advertiser(text,text)','2518bd4e1ef1e8f585aff95d9a6c616a','sponsorship','true'),
    ('public.activate_advertiser(text)','45ed82fe88d73f7fbe10115dee781eb4','sponsorship','true'),
    ('public.create_sponsor_campaign(text,text,text,sponsor_campaign_type,text,timestamp with time zone,timestamp with time zone)','9b5aa76108ecaf5e339052a7b991673f','sponsorship','true'),
    ('public.assign_creator_to_campaign(text,text,commission_type,integer)','c82d944c1a86ba3912c7e01a66a1990b','sponsorship','true'),
    ('public.create_campaign_referral_link(text,text,timestamp with time zone)','f679a29e8f2f3da98aadceb89403cd60','sponsorship','true'),
    ('public.create_campaign_coupon(text,text,text,timestamp with time zone,timestamp with time zone,integer)','17fef98c40542180f639f794da9a0c97','sponsorship','true'),
    ('public.set_sponsor_campaign_status(text,sponsor_campaign_status)','3d7ede0a5d09c5a978bc4bbb3fc833e8','sponsorship','upper(p_status::text)=''ACTIVE'''),
    ('public.create_media_upload(media_kind,text,media_visibility)','980aa105e3cc0f3ceafacbd09a583806','media','true'),
    ('public.create_arena_question(hood_id,text,text,text,text,text,text,text,uuid)','3aee324ba88d6f7cf34347d21d493df8','media','true'),
    ('public.create_prediction_game(hood_id,text,text[],timestamp with time zone)','96272c1bc87fed9abd5eee7d4dfe1ade','media','true'),
    ('public.submit_prediction(text,text)','a18f53a43a78d1063399caaa43696b26','media','true'),
    ('public.create_take(hood_id,text,text,text,text)','3ae3f7eef0ff78f1c78756fab76bb1fb','media','p_media_object_id is not null or p_media_url is not null or p_media_poster_url is not null'),
    ('public.create_comment(text,text,text,text,text,text,text)','7c30864e5f15ee83fd4f3effc3b3d193','media','p_media_object_id is not null or p_media_url is not null or p_gif_provider is not null or p_gif_external_id is not null'),
    ('public.set_creator_product_status(text,vault_offer_status)','a4c81b1f88dd2c8cd9b71c8a5a78552d','creator','upper(p_status::text) is distinct from ''ARCHIVED'''),
    ('public.set_creator_course_status(text,vault_offer_status)','efccc3fb756147c0359a6f6e8c4dc48a','creator','upper(p_status::text) is distinct from ''ARCHIVED'''),
    ('public.set_creator_service_status(text,vault_offer_status)','596c87d3c365d507239725b2a3f9258b','creator','upper(p_status::text) is distinct from ''ARCHIVED'''),
    ('public.set_course_lesson_status(text,vault_offer_status)','f39b466f401b38ab89850e5a691cceb6','creator','upper(p_status::text) is distinct from ''ARCHIVED'''),
    ('public.set_creator_world_drop_status(text,world_drop_status)','3cec02294baa2fa510fb1e52375ab9ea','creator','p_status::text=''PUBLISHED'''),
    ('public.set_vault_community_status(text,vault_community_status)','08836d399b2328b457d2cf0bb081ed35','creator','upper(p_status::text)=''ACTIVE'''),
    ('public.follow_arena_crew(text)','ef93e94549f91bb513e87b9228af79f0','groups','not exists(select 1 from public.arena_crew_follows where crew_id=p_crew_id and profile_id=public.my_profile_id())'),
    ('public.join_arena_group_topic(text,take_stance,arena_participant_role)','484c5afd4fc2f5222628ba06c455a8ce','groups','not exists(select 1 from public.arena_room_participants where topic_id=p_topic_id and profile_id=public.my_profile_id())'),
    ('public.create_world_mission(text,text,text,timestamp with time zone,timestamp with time zone,world_mission_status)','512b5d0b61f55c5b6918ebf5d6404d97','world','true'),
    ('public.create_arena_daily_topic(text,text,hood_id,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,arena_topic_status)','2052a4b2d6f5c0106c0f0e7487fb25a2','groups','true')
  ) as guards(signature,body_md5,capability,condition_sql) loop
    f:=to_regprocedure(r.signature);
    if f is null then raise exception 'Missing beta admission prerequisite: %',r.signature; end if;
    select replace(prosrc,chr(13),'') into body from pg_proc where oid=f;
    if md5(body)<>r.body_md5 then raise exception 'Beta admission source drift: %',r.signature; end if;
    definition:=pg_get_functiondef(f);
    patched:=regexp_replace(definition,'\mbegin\M',format(E'begin\n  if %s then perform public.assert_release_admission(%L); end if;',r.condition_sql,r.capability),'i');
    if patched=definition then raise exception 'Missing admission insertion anchor: %',r.signature; end if;
    execute patched;
  end loop;
end $patch$;
-- Direct REST edits cannot add/replace media while upload/new media is deferred.
-- Preserve text edits, unchanged existing media, and explicit media removal.
create function public.guard_beta_direct_media() returns trigger
language plpgsql set search_path='' as $$
declare field text; before_row jsonb:=to_jsonb(old); after_row jsonb:=to_jsonb(new);
begin
  if current_user in ('anon','authenticated') then
    foreach field in array array['media_object_id','media_kind','media_url','media_poster_url','media_caption','media_colors','media_duration'] loop
      if after_row->field is distinct from before_row->field and coalesce(after_row->field,'null'::jsonb)<>'null'::jsonb then
        raise exception 'New media admission is deferred' using errcode='42501';
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.guard_beta_direct_media() from public,anon,authenticated,service_role;
create trigger beta_direct_media before update on public.takes for each row execute function public.guard_beta_direct_media();
create trigger beta_direct_media before update on public.comments for each row execute function public.guard_beta_direct_media();
commit;

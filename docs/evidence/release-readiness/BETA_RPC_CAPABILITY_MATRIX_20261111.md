# Beta RPC capability matrix — 11 November 2026

Source: read-only installed metadata from the accepted isolated database (479 public functions), compared with the disposable v4 candidate. This is an executable-signature/ACL inventory, not a claim that every unchanged function is safe or read-only. No accepted deployment occurred.

ACL columns are effective candidate EXECUTE for anon / authenticated / service_role. Internal owner/direct writers remain trusted. Existing table ACLs are not broadened. Exact guarded conditions and original body hashes: `supabase/policies/beta-admission-rpcs.json`.

| Signature | anon/auth/service | Candidate behavior |
|---|---|---|
| `ack_meet_video_safety()` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `activate_advertiser(text)` | no/yes/yes | sponsorship: deny when true |
| `add_creator_ai_knowledge(creator_ai_knowledge_kind,text,text,text,creator_ai_access)` | no/yes/yes | ai: deny when true |
| `add_drop_to_collection(text,text)` | no/yes/yes | creator: deny when true |
| `advertiser_campaign_creator_stats(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `advertiser_campaign_geo_summary(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `advertiser_campaign_summary(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `advertiser_studio_overview(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_actor_hidden(text,text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_actor_hidden_internal(text,text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_assert_crew_join_allowed(text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_assert_crew_specialties(text[])` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_attention_score(integer,integer,integer,integer)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_backup_policy_for(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_backup_reasons(text,text,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_challenge_duration()` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_challenge_payload(arena_challenges,boolean)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_crew_discovery_card(arena_crews)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_crew_notify(text,text,notification_kind,report_target,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_crew_payload(arena_crews)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_crew_role(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_crew_specialty_vocabulary()` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_crowd_access(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_crowd_payload(arena_crowd_messages)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_editorial_admin(text,jsonb,uuid)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_editorial_event(uuid,text,text,integer)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_editorial_interest(text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_editorial_sensitive(text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_editorial_tokens(text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_editorial_worker(text,uuid,jsonb)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_event(text,text,arena_room_event_kind,text,text,jsonb,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_evidence_payload(arena_room_evidence,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_evidence_room(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_evidence_surge_event()` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_group_room_payload(arena_rooms,text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_is_crew_member(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_is_room_debater(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_is_room_member(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_may_be_called(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_may_call_backup(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_message_payload(arena_room_messages,text,boolean)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_message_room(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_notify(text,text,notification_kind,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_private_assist_media_target(uuid)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_private_assist_readable(uuid)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_profile_json(text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_reaction_vocabulary()` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_result_payload(text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_room_load(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_room_mindshift_stats(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_room_payload(arena_rooms,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_room_readable(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_room_status_event()` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_standing_for(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_take_readable(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_topic_payload(arena_daily_topics,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_topic_phase(arena_topic_status,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_topic_readable(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_trend_momentum(integer,integer,integer)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `arena_trend_recency_weight(numeric)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `assert_advertiser_owner(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `assert_arena_duel_integrity(text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `assert_campaign_owner(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `assert_canonical_clash_access(text,boolean)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `assert_creator_live_continuation(text,text,text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `assert_meet_new_admission()` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `assert_play_host()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `assert_private_assist_window(text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `assert_rate_limit(text,text,integer,interval)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `assert_release_admission(text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `assign_creator_to_campaign(text,text,commission_type,integer)` | no/yes/yes | sponsorship: deny when true |
| `award_arena_fun_moment(text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `award_arena_fun_moments(integer)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `bind_beta_take_identity()` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `block_meet_peer(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `block_profile(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `call_arena_backup(text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `can_access_course_lesson(text,text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `can_access_course_lesson_internal(text,text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `can_access_vault_drop(text,text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `can_access_vault_drop_internal(text,text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `can_follow_clash(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `can_use_video_meet(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `can_view_clash(text,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `cancel_arena_backup(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `cancel_meet_search(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `check_arena_duel_integrity()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `claim_arena_gif_request(uuid)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `claim_treasure_reward(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `claim_world_drop(text)` | no/yes/yes | world: deny when true |
| `clash_identities_revealed_for(clash_mode,clash_status,text,text,text,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `clash_notify(text,text,notification_kind,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `clash_participant_json(text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `clash_view(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `clash_view_for_take(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `clash_view_legacy(text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `clash_view_phase1(text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `cleanup_meet_signals(integer)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `cleanup_rate_limits(interval)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `cleanup_stale_media(integer)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `close_creator_live_interaction(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `close_prediction_games(integer)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `complete_content_clue(text,text,text)` | no/yes/yes | play: deny when not exists(select 1 from public.explore_treasure_progress where hunt_id=p_hunt_id and profile_id=public.my_profile_id()) |
| `complete_course_lesson(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `complete_media_upload(text,bigint,integer,integer,integer)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `compute_arena_room_pulse(text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `course_lesson_card(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `course_lesson_media_target(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `create_advertiser(text,text)` | no/yes/yes | sponsorship: deny when true |
| `create_arena_challenge(text,text)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `create_arena_crew(text,text,text,arena_crew_join_mode,text[])` | no/yes/yes | groups: deny when true |
| `create_arena_daily_topic(text,text,hood_id,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,arena_topic_status)` | no/yes/yes | groups: deny when true |
| `create_arena_duel(text,text,uuid)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `create_arena_question(hood_id,text,text,text,text,text,text,text,uuid)` | no/yes/no | media: deny when true |
| `create_campaign_coupon(text,text,text,timestamp with time zone,timestamp with time zone,integer)` | no/yes/yes | sponsorship: deny when true |
| `create_campaign_referral_link(text,text,timestamp with time zone)` | no/yes/yes | sponsorship: deny when true |
| `create_collection(text,text,text)` | no/yes/yes | creator: deny when true |
| `create_comment(text,text,text,text,text,text,text)` | no/yes/yes | media: deny when p_media_object_id is not null or p_media_url is not null or p_gif_provider is not null or p_gif_external_id is not null |
| `create_course_lesson(text,text,text,vault_lesson_content,text,text,vault_offer_access,boolean)` | yes/yes/yes | creator: deny when true |
| `create_creator_course(text,text,vault_offer_access,bigint,text,text)` | yes/yes/yes | creator: deny when true |
| `create_creator_live_interaction(text,creator_live_interaction_type,text,jsonb,creator_live_action_kind,integer,integer)` | no/yes/yes | Existing B3 server admission/continuation provenance required; unchanged |
| `create_creator_live_session(text,text,creator_live_access,timestamp with time zone,text,boolean,boolean,boolean,boolean,text,text)` | no/yes/yes | Existing B3 server admission/continuation provenance required; unchanged |
| `create_creator_product(text,text,vault_product_type,vault_offer_access,bigint,text,text,text,vault_inventory_mode,integer)` | yes/yes/yes | creator: deny when true |
| `create_creator_service(text,text,vault_service_category,vault_service_delivery,vault_offer_access,bigint,text,text,text)` | yes/yes/yes | creator: deny when true |
| `create_creator_world_drop(text,text,world_drop_type,world_drop_reward,text,text,double precision,double precision,text,timestamp with time zone)` | no/yes/yes | creator: deny when true |
| `create_media_upload(media_kind,text,media_visibility)` | no/yes/yes | media: deny when true |
| `create_prediction_game(hood_id,text,text[],timestamp with time zone)` | no/yes/yes | media: deny when true |
| `create_sponsor_campaign(text,text,text,sponsor_campaign_type,text,timestamp with time zone,timestamp with time zone)` | no/yes/yes | sponsorship: deny when true |
| `create_take(hood_id,text,text,text,text)` | no/yes/yes | media: deny when p_media_object_id is not null or p_media_url is not null or p_media_poster_url is not null |
| `create_vault(text,text)` | no/yes/yes | creator: deny when true |
| `create_vault_community(text,text,vault_community_access,boolean,text,text)` | no/yes/yes | creator: deny when true |
| `create_vault_community_post(text,vault_community_post_type,text,text,boolean)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `create_vault_community_reply(text,text,text,boolean)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `create_vault_drop(text,text,vault_drop_access,text)` | no/yes/yes | creator: deny when true |
| `create_world_drop(text,text,text,double precision,double precision)` | no/yes/yes | world: deny when true |
| `create_world_mission(text,text,text,timestamp with time zone,timestamp with time zone,world_mission_status)` | no/yes/yes | world: deny when true |
| `creator_ai_begin_turn(text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `creator_ai_finish_turn(text,text,text,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `creator_ai_knowledge_visible(creator_ai_knowledge,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `creator_ai_profile_card(text,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `creator_ai_viewer_can_access(text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `creator_ai_viewer_can_access_internal(text,text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `creator_campaign_stats()` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `creator_earnings_summary()` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `creator_live_close_interaction(text,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `creator_live_continuation_allowed(text,text,text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `creator_live_events_since(text,timestamp with time zone,integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `creator_live_interaction_card(creator_live_interactions,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `creator_live_options_valid(jsonb)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `creator_live_session_card(creator_live_sessions,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `creator_live_viewer_can_access(text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `creator_live_viewer_can_access_internal(text,text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `creator_my_coupons(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `creator_my_referral_links(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `decide_arena_crew_join_request(text,boolean)` | no/yes/yes | groups: deny when p_approve is distinct from false |
| `dedupe_clash_result_notification()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `delete_media(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `delete_vault_community_post(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `delete_vault_community_reply(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `delete_vault_drop(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `digital_creator_session_card(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `disconnect_creator_digital_version()` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `discover_arena_crews(text,text,integer,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `end_creator_live_session(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `end_digital_creator_session(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `enforce_action_rate_limit()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `enforce_comment_create_limits()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `enforce_comment_media()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `enforce_comment_relationships()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `enforce_take_create_limits()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `enforce_vault_drop_media()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `enter_vault_community(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `expire_arena_backup_invites(integer)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `expire_arena_take_challenges(text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `expire_stale_meet_sessions(integer)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `expire_stale_takes(integer)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `expire_vault_drops(integer)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `expire_vault_subscriptions(integer)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `expire_world_drops(integer)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `explore_actor_hidden(text,text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `explore_actor_hidden_internal(text,text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `explore_answer_digest(text,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `explore_challenge_readable(text)` | yes/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `explore_country_activity_count(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `explore_entry_readable(text)` | yes/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `explore_public_media_ready(text)` | yes/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `explore_treasure_readable(text)` | yes/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `explore_vault_preview_rows(text,text,integer)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `fail_media_upload(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `filter_arena_room_pulse(jsonb,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `follow_arena_crew(text)` | no/yes/yes | groups: deny when not exists(select 1 from public.arena_crew_follows where crew_id=p_crew_id and profile_id=public.my_profile_id()) |
| `follow_clash(text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `follow_profile(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `followed_clash_ids()` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_arena_backup_preference()` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_arena_crew(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_arena_crowd(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_arena_crowd_messages(text,uuid[])` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_arena_interest_catalogue()` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_arena_official_evidence_visibility(text,text[])` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_arena_question(text)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_arena_room(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_arena_room_message(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_arena_room_message_visibility(text,text[])` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_arena_room_pulse(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_arena_room_typing(text)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_arena_topic(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_challenge_detail(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_creator_ai(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_creator_live_session(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_creator_live_snapshot(text,text)` | yes/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_explore_country(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_explore_for_you(integer,integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_explore_live(integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_explore_world_summary()` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_global_viral(integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_meet_ice_servers()` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_meet_session(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_meet_typing(text)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_my_arena_interests()` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_my_arena_reputation()` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_my_creator_ai()` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_my_play()` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_my_profile()` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_my_world_artifacts(integer)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_teleport_candidate(text[])` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `get_treasure_detail(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `guard_arena_challenge()` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `guard_arena_duel_content()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `guard_arena_duel_group_outcome()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `guard_arena_duel_identity()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `guard_arena_duel_judgement()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `guard_arena_duel_participant()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `guard_beta_direct_media()` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `guard_beta_membership_admission()` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `guard_beta_take_identity()` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `guard_challenge_active_duel()` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `guard_challenged_take_author()` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `guard_moderation_audit()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `handle_new_user()` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `has_meet_video_safety_ack()` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `hide_vault_community_post(text,boolean)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `hood_active_prediction(hood_id)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `hood_game_view(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `host_explore_challenge(text,text,explore_challenge_type,text,text,timestamp with time zone,timestamp with time zone,explore_reward_type)` | no/yes/yes | play: deny when true |
| `host_explore_treasure(text,text,explore_treasure_type,text,text,text,timestamp with time zone,timestamp with time zone,explore_reward_type,jsonb,integer,jsonb)` | no/yes/yes | play: deny when true |
| `incorporate_arena_private_assist(uuid,uuid,text,text)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `invite_to_arena_crew(text,text)` | no/yes/yes | groups: deny when true |
| `is_advertiser_owner(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `is_allowed_http_url(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `is_allowed_tenor_media_url(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `is_assigned_campaign_creator(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `is_following_clash(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `is_hood_moderator(hood_id)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `is_staff()` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `join_arena_crew(text)` | no/yes/yes | groups: deny when not exists(select 1 from public.arena_crew_memberships where crew_id=p_crew_id and profile_id=public.my_profile_id() and left_at is null) |
| `join_arena_group_topic(text,take_stance,arena_participant_role)` | no/no/no | groups: deny when not exists(select 1 from public.arena_room_participants where topic_id=p_topic_id and profile_id=public.my_profile_id()) |
| `join_arena_topic(text,take_stance,arena_participant_role)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `join_challenge(text)` | no/yes/yes | play: deny when not exists(select 1 from public.explore_challenge_participants where challenge_id=p_challenge_id and profile_id=public.my_profile_id()) |
| `join_hood(hood_id)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `join_meet_queue(meet_match_mode,text,hood_id,text[],meet_channel)` | no/yes/yes | Existing reviewed Meet new-admission gate; continuation retained |
| `join_treasure_hunt(text)` | no/yes/yes | play: deny when not exists(select 1 from public.explore_treasure_progress where hunt_id=p_hunt_id and profile_id=public.my_profile_id()) |
| `leave_arena_crew(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `leave_hood(hood_id)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `leave_meet_queue()` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `leave_meet_session(text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_arena_backup_candidates(text,integer)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_arena_challenges(text,timestamp with time zone,uuid,integer)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_arena_clash_discovery()` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_arena_crew_members(text,integer,integer)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_arena_crews(integer,integer,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_arena_crowd_messages(text,timestamp with time zone,uuid,text,integer)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_arena_official_page(text,text,timestamp with time zone,text,text,integer)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_arena_private_assists(text,timestamp with time zone,uuid)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_arena_questions(text,timestamp with time zone,text,integer)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_arena_room_events(text,timestamp with time zone,integer)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_arena_room_evidence(text,integer)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_arena_room_messages(text,timestamp with time zone,integer,timestamp with time zone)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_arena_room_presence(text,integer)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_arena_saved_expressive_media(integer,integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_arena_topic_rooms(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_arena_trending_battles(integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_campaign_coupons(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_campaign_referral_links(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_challenge_entries(text,text,integer,integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_creator_ai_messages(text,timestamp with time zone,integer)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_creator_live_interactions(text,integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_creator_live_sessions(text,integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_creator_world_drops(text,integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_explore_vault_previews(integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_explore_world_drops(integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_live_arena_topic_previews(text,integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_live_arena_topics()` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_meet_messages(text,integer,timestamp with time zone)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_meet_signals(text,timestamp with time zone)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_my_arena_backup_invites()` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_my_arena_challenges(text,timestamp with time zone,uuid,integer)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_my_arena_crews()` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_my_creator_live_sessions(integer)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_my_sponsor_campaigns(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_play_home()` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_rising_arena_crews(integer)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_trending_clash_memes(integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_vault_community_posts(text,integer,timestamp with time zone,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_vault_community_replies(text,integer)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_vault_discover_offers(text,integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `list_vault_discover_worlds(integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `mark_arena_evidence_useful(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `meet_create_session(text,text,meet_match_mode,text,hood_id,text,meet_channel)` | no/no/yes | Existing reviewed Meet new-admission gate; continuation retained |
| `meet_has_active_session(text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `meet_is_blocked(text,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `meet_new_admission_allowed()` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `meet_recently_matched(text,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `meet_session_is_live(text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `meet_session_payload(text,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `meet_session_under_review(text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `meet_typing_allowed(text)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `mindshift_stats(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `moderate_arena_crowd_message(uuid,boolean,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `moderate_meet_session(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `mute_profile(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `my_profile_id()` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `new_arena_id(text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `next_meet(text,meet_match_mode,text,hood_id,text[],meet_channel)` | no/yes/yes | Existing reviewed Meet new-admission gate; continuation retained |
| `notify_clash_followers_on_verdict()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `notify_new_follower()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `notify_vault_community_announcement()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `notify_vault_community_reply()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `notify_vault_drop_published()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `notify_vault_subscription()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `owns_campaign_via_advertiser(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `owns_profile(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `pause_sponsor_campaign(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `play_next_clue_payload(text,integer)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `play_notify(text,text,notification_kind,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `poll_meet_queue()` | no/yes/yes | Existing reviewed Meet new-admission gate; continuation retained |
| `post_arena_clash_media_reshare(text,text,text,text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `post_arena_crowd_message(text,text,uuid)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `post_arena_room_message(text,text,text,text,text,text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `profile_clash_list(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `publish_arena_editorial(uuid,integer,boolean,uuid)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `publish_meet_signal(text,meet_signal_kind,jsonb)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `publish_vault_drop(text)` | no/yes/yes | creator: deny when true |
| `rank_arena_for_you(text[])` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `rank_for_rep(bigint)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `react_arena_room_message(text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `record_arena_final_stance(text,take_stance)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `record_arena_maintenance_failure(text,text,text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `record_final_stance(text,take_stance)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `record_initial_stance(text,take_stance)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `record_referral_click(text,text,text,text,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `record_sponsor_conversion(text,text,sponsor_conversion_type,integer,text,text,text,text,text,text,text,timestamp with time zone)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `refresh_arena_trend_snapshots(integer,integer)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `release_stale_meet_participation()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `remove_creator_ai_knowledge(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `remove_creator_from_campaign(text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `remove_drop_from_collection(text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `remove_world_drop(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `report_arena_private_assist(uuid,report_reason)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `report_creator_ai_message(text,report_reason,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `report_creator_live_session(text,report_reason,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `report_meet_message(text,text,report_reason,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `report_meet_session(text,report_reason,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `reputation_facet_for(reputation_kind)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `reputation_facet_json(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `request_arena_crew_join(text)` | no/yes/yes | groups: deny when true |
| `request_creator_service(text,text)` | yes/yes/yes | commerce: deny when true |
| `resolve_arena_challenge(uuid,text)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `resolve_arena_maintenance_failure(text,text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `resolve_prediction_game(text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `respond_arena_backup(text,boolean,take_stance)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `respond_arena_crew_invite(text,boolean)` | no/yes/yes | groups: deny when p_accept is distinct from false |
| `respond_arena_private_assist(uuid,text)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `resume_sponsor_campaign(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `review_reported_arena_assist(uuid)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `run_maintenance(integer)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `save_my_arena_interests(text[],boolean,bigint)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `search_explore(text,integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `send_arena_private_assist(text,text,text,text,uuid)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `send_meet_message(text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `set_arena_backup_preference(arena_backup_policy)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `set_arena_room_typing(text,boolean,text)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `set_course_lesson_status(text,vault_offer_status)` | yes/yes/yes | creator: deny when upper(p_status::text) is distinct from 'ARCHIVED' |
| `set_creator_course_status(text,vault_offer_status)` | yes/yes/yes | creator: deny when upper(p_status::text) is distinct from 'ARCHIVED' |
| `set_creator_digital_version(text,text,text,text,text,boolean,boolean,boolean,boolean,text)` | no/yes/yes | ai: deny when true |
| `set_creator_product_status(text,vault_offer_status)` | yes/yes/yes | creator: deny when upper(p_status::text) is distinct from 'ARCHIVED' |
| `set_creator_service_status(text,vault_offer_status)` | yes/yes/yes | creator: deny when upper(p_status::text) is distinct from 'ARCHIVED' |
| `set_creator_world_drop_status(text,world_drop_status)` | no/yes/yes | creator: deny when p_status::text='PUBLISHED' |
| `set_meet_typing(text,boolean)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `set_service_request_status(text,vault_service_request_status)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `set_sponsor_campaign_status(text,sponsor_campaign_status)` | no/yes/yes | sponsorship: deny when upper(p_status::text)='ACTIVE' |
| `set_vault_community_status(text,vault_community_status)` | no/yes/yes | creator: deny when upper(p_status::text)='ACTIVE' |
| `settle_arena_group_room(text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `settle_arena_room(text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `settle_challenge(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `settle_clash(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `settle_clash_legacy(text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `settle_due_clashes(integer)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `sponsor_calc_commission_minor(commission_type,integer,integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `sponsor_campaign_is_live(sponsor_campaigns)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `sponsor_coupon_canonicalize()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `sponsor_min_geo_aggregate_count()` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `sponsor_new_referral_token()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `sponsor_normalize_coupon_code(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `stamp_moderation_actor()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `start_clash(text,text,clash_mode)` | no/no/no | Retired; ACL revoked and body denies |
| `start_creator_ai_conversation(text)` | no/yes/yes | ai: deny when true |
| `start_creator_live_session(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `start_digital_creator_session(text,text)` | no/yes/yes | ai: deny when true |
| `submit_arena_argument_vote(text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `submit_arena_evidence(text,arena_evidence_kind,text,text,text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `submit_arena_official(text,text,jsonb,uuid)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `submit_arena_side_vote(text,arena_winning_side)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `submit_challenge_entry(text,text,text)` | no/yes/yes | play: deny when not exists(select 1 from public.explore_challenge_participants where challenge_id=p_challenge_id and profile_id=public.my_profile_id()) |
| `submit_creator_live_vote(text,text)` | no/yes/yes | Existing B3 server admission/continuation provenance required; unchanged |
| `submit_judgement(text,clash_side)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `submit_prediction(text,text)` | no/yes/yes | media: deny when true |
| `submit_report(report_target,text,report_reason,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `submit_report_before_crowd(report_target,text,report_reason,text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `submit_treasure_answer(text,text,text)` | no/yes/yes | play: deny when not exists(select 1 from public.explore_treasure_progress where hunt_id=p_hunt_id and profile_id=public.my_profile_id()) |
| `sync_challenge_entry_reactions()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `sync_comment_upvotes()` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `sync_reputation_facet()` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `sync_take_reactions()` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `take_hood(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `take_stance_payload(take_stances)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `toggle_arena_saved_expressive_media(text,text,text,text,text,text,text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `toggle_challenge_entry_reaction(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `toggle_comment_upvote(text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `toggle_take_reaction(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `touch_creator_live_viewer(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `touch_meet_session(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `touch_updated_at()` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `transition_due_arena_rooms(integer)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `try_meet_match(text)` | no/no/yes | Existing reviewed Meet new-admission gate; continuation retained |
| `unblock_profile(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `unfollow_arena_crew(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `unfollow_clash(text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `unfollow_profile(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `unmute_profile(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `update_course_lesson(text,text,text,text,vault_lesson_content,text,vault_offer_access,boolean,boolean)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `update_creator_commission(text,text,commission_type,integer)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `update_creator_course(text,text,text,vault_offer_access,bigint,text,text,boolean)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `update_creator_product(text,text,text,vault_product_type,vault_offer_access,bigint,text,text,text,vault_inventory_mode,integer,boolean,boolean)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `update_creator_service(text,text,text,vault_service_category,vault_service_delivery,vault_offer_access,bigint,text,text,text,boolean,boolean)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `update_sponsor_campaign(text,text,text,timestamp with time zone,timestamp with time zone,boolean,boolean)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `update_vault(text,text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `update_vault_community(text,text,text,vault_community_access,boolean,text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `upgrade_arena_spectator(text,take_stance)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `upsert_creator_ai_profile(text,text,text,text,creator_ai_access,jsonb,boolean,text)` | no/yes/yes | ai: deny when p_enabled is distinct from false or not exists(select 1 from public.creator_ai_profiles where creator_id=public.my_profile_id()) |
| `vault_assert_owned_public_cover(text,text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vault_community_alias(text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vault_community_for_creator(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vault_community_post_card(text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vault_community_reply_card(text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vault_community_seed(text,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vault_community_summary(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vault_community_touch(text,text)` | no/no/yes | commerce: deny when not exists(select 1 from public.vault_community_memberships where community_id=p_community_id and profile_id=p_profile_id) |
| `vault_community_viewer_can_access(text,text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vault_community_viewer_can_access_internal(text,text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vault_drop_card(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vault_drop_media_target(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vault_grant_test_subscription(text,text,integer)` | no/no/yes | commerce: deny when true |
| `vault_notify(text,text,notification_kind,report_target,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vault_profiles_blocked(text,text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vault_profiles_blocked_internal(text,text)` | no/no/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vault_public_cover(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vault_revoke_subscription(text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vault_storefront(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vault_world_has_public_surface(text,text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `viewer_can_access_drop(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `viewer_has_vault_subscription(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `vote_arena_question(text,text,bigint,uuid)` | no/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `watch_arena_room(text)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `world_active_missions()` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `world_author_hidden(text,text)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `world_distance_band(double precision)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `world_drop_card(world_drops,double precision)` | no/no/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `world_drop_readable(text)` | yes/yes/no | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `world_drop_view(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `world_fuzz_location(double precision,double precision)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `world_mission(text)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `world_mission_drops(text,integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `world_my_creator_drops(integer)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `world_my_drops(integer)` | no/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `world_nearby(double precision,double precision,double precision,integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |
| `world_recent(integer)` | yes/yes/yes | Unchanged existing authorization; inspect body for read/continuation/exit semantics |

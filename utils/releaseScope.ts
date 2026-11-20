/** First-release text-debate beta. Client policy, never an authorization boundary. */
export type ReleaseOperation = 'admit' | 'continue' | 'read' | 'exit' | 'safety' | 'accountData';
type CapabilityRule = { label: string; admission: 'allowed' | 'conditional' | 'deferred'; routes: readonly string[]; contracts: readonly string[] };
export const RELEASE_SCOPE = {
  account: { label: 'Accounts and profiles', admission: 'allowed', routes: ['/auth', '/onboard', '/interests', '/profile/:id', '/settings'], contracts: ['Supabase Auth signup/login', 'get_my_profile', 'profiles UPDATE under RLS'] },
  browse: { label: 'Feed and Explore browsing', admission: 'allowed', routes: ['/', '/explore', '/world', '/explore/country/:code'], contracts: ['takes SELECT under RLS', 'world_recent', 'world_active_missions'] },
  publicVault: { label: 'Public free Vault reading', admission: 'allowed', routes: ['/vault/:id', '/vault/drop/:id', '/vault/collection/:id', '/vault/course/:id', '/vault/course/:id/lesson/:id'], contracts: ['vault_storefront', 'vault_drop_card', 'course_lesson_card'] },
  text: { label: 'Text Takes and discussions', admission: 'allowed', routes: ['/create', '/take/:id'], contracts: ['create_take', 'create_comment'] },
  arena: { label: 'Text Arena', admission: 'conditional', routes: ['/arena/challenges', '/arena/room/:id'], contracts: ['create_arena_challenge', 'resolve_arena_challenge', 'submit_arena_official', 'submit_judgement'] },
  groups: { label: 'Group membership', admission: 'deferred', routes: ['/arena/crews/create', '/arena/crews/:slug'], contracts: ['create_arena_crew', 'join_arena_crew', 'request_arena_crew_join', 'respond_arena_crew_invite'] },
  meet: { label: 'New Meet sessions', admission: 'deferred', routes: ['/explore', '/explore/meet/video/prep', '/explore/meet/:id', '/explore/meet/video/:id'], contracts: ['join_meet_queue', 'poll_meet_queue', 'next_meet'] },
  commerce: { label: 'New acquisition and service requests', admission: 'deferred', routes: ['/vault/product/:id', '/vault/service/:id', '/vault/course/:id', '/vault/community/:id'], contracts: ['request_creator_service', 'vault_grant_test_subscription', 'enter_vault_community (new membership only)'] },
  creator: { label: 'Creator publishing', admission: 'deferred', routes: ['/vault/compose', '/vault/studio'], contracts: ['create_vault', 'create_vault_drop', 'publish_vault_drop', 'create_collection', 'create_creator_product', 'create_creator_course', 'create_creator_service'] },
  ai: { label: 'New creator AI experiences', admission: 'deferred', routes: ['/vault/ai/:id'], contracts: ['start_creator_ai_conversation', 'creator-ai', 'digital-creator'] },
  live: { label: 'New creator live experiences', admission: 'deferred', routes: ['/vault/live/:id', '/vault/studio'], contracts: ['create_creator_live_session', 'start_creator_live_session', 'touch_creator_live_viewer'] },
  sponsorship: { label: 'New sponsorship activity', admission: 'deferred', routes: ['/sponsor/new', '/sponsor', '/sponsor/:id', '/campaign/:id', '/earnings'], contracts: ['create_advertiser', 'create_sponsor_campaign', 'assign_creator_to_campaign', 'create_campaign_referral_link', 'create_campaign_coupon'] },
  world: { label: 'World publishing', admission: 'deferred', routes: ['/world/compose'], contracts: ['create_world_drop'] },
  play: { label: 'New Play participation', admission: 'deferred', routes: ['/explore/challenge/:id', '/explore/treasure/:id'], contracts: ['join_challenge', 'join_treasure_hunt'] },
  media: { label: 'New media and entertainment creation', admission: 'deferred', routes: ['/create', '/hood/game/:id'], contracts: ['create_media_upload', 'create_arena_question', 'create_prediction_game'] },
} as const satisfies Record<string, CapabilityRule>;
export type ReleaseCapability = keyof typeof RELEASE_SCOPE;
/** Preservation describes intent, not authorization. Every operation still needs server checks. */
export const RELEASE_PRESERVED_CONTRACTS = {
  account: { continue: ['existing authenticated profile operations'], exit: ['Supabase Auth sign-out'], safety: ['submit_report', 'block_profile'], accountData: ['existing account-data access; deletion/export support ownership remains a release gate'] },
  browse: { read: ['existing caller-scoped feed, country and mission reads'] },
  publicVault: { read: ['existing caller-scoped public/free content and already authorized private history'] },
  text: { read: ['takes/comments SELECT under RLS', 'get_my_profile'], safety: ['submit_report', 'block_profile'], accountData: ['Auth sign-out; owner deletion/export support workflow remains required'] },
  arena: { continue: ['submit_arena_official', 'submit_judgement'], read: ['get_arena_room', 'clash_view', 'verdicts SELECT under RLS'], exit: ['Back navigation without admission'], safety: ['submit_report', 'block_profile'] },
  groups: { read: ['discover_arena_crews', 'get_arena_crew', 'list_arena_crew_members'], exit: ['leave_arena_crew', 'unfollow_arena_crew', 'respond_arena_crew_invite(false)', 'decide_arena_crew_join_request(false)'] },
  meet: { continue: ['send_meet_message', 'touch_meet_session', 'set_meet_typing', 'publish_meet_signal'], read: ['get_meet_session', 'list_meet_messages', 'get_meet_typing', 'list_meet_signals'], exit: ['leave_meet_queue', 'leave_meet_session', 'cancel_meet_search'], safety: ['block_meet_peer', 'report_meet_session', 'report_meet_message'] },
  commerce: { read: ['viewer_can_access_drop', 'vault_storefront', 'vault_drop_card', 'course_lesson_card', 'vault-media-access', 'course-lesson-media-access', 'vault_community_summary', 'list_vault_community_posts'], continue: ['set_service_request_status', 'complete_course_lesson', 'enter_vault_community/create_vault_community_post/create_vault_community_reply for existing authorized members'], exit: ['set_service_request_status(cancelled)'] },
  creator: { read: ['existing creator storefront and owner studio reads'], exit: ['delete_vault_drop', 'remove_drop_from_collection', 'set_creator_product_status(archived)', 'set_creator_service_status(archived)', 'set_creator_course_status(archived)', 'set_course_lesson_status(archived)'] },
  ai: { read: ['creator_ai_conversations SELECT under RLS', 'list_creator_ai_messages', 'digital_creator_session_card'], continue: ['creator-ai on an existing authorized conversation', 'digital-creator render on an existing authorized session'], exit: ['end_digital_creator_session', 'disconnect_creator_digital_version', 'upsert_creator_ai_profile(enabled=false)'], safety: ['report_creator_ai_message'] },
  live: { read: ['get_creator_live_session', 'list_creator_live_interactions', 'creator_live_events_since'], continue: ['touch_creator_live_viewer', 'submit_creator_live_vote'], exit: ['end_creator_live_session', 'close_creator_live_interaction'], safety: ['report_creator_live_session'] },
  sponsorship: { read: ['advertiser_studio_overview', 'advertiser_campaign_summary', 'creator_campaign_stats'], exit: ['pause_sponsor_campaign', 'set_sponsor_campaign_status(CANCELLED)', 'remove_creator_from_campaign'] },
  world: { read: ['world_active_missions', 'world_recent', 'world_nearby', 'world_drop_view'], exit: ['remove_world_drop'] },
  play: { read: ['list_play_home', 'get_challenge_detail', 'get_treasure_detail', 'get_my_play'], continue: ['submit_challenge_entry', 'submit_treasure_answer', 'complete_content_clue', 'claim_treasure_reward for an already eligible participant'] },
  media: { read: ['authorized public/private media reads'], exit: ['fail_media_upload', 'delete_media'], continue: ['resolve_prediction_game for an existing authorized game'] },
} as const satisfies Record<ReleaseCapability, Partial<Record<Exclude<ReleaseOperation, 'admit'>, readonly string[]>>>;
/** Conditional Arena admission still needs independent production operational acceptance. */
export function releaseAllows(capability: ReleaseCapability, operation: ReleaseOperation): boolean {
  return operation !== 'admit' || RELEASE_SCOPE[capability].admission !== 'deferred';
}
export function releaseUnavailableCopy(capability: ReleaseCapability): string {
  return `${RELEASE_SCOPE[capability].label}: unavailable in the text-debate beta. Existing authorized access, history and exit controls remain available.`;
}
export function assertReleaseAdmission(capability: ReleaseCapability): void {
  if (!releaseAllows(capability, 'admit')) throw new Error(releaseUnavailableCopy(capability));
}
/** Only creation-only routes: never blanket-block participant or historical detail routes. */
export const RELEASE_NEW_ROUTES = {
  '/world/compose': 'world', '/vault/compose': 'creator', '/arena/crews/create': 'groups',
  '/sponsor/new': 'sponsorship', '/explore/meet/video/prep': 'meet',
} as const satisfies Record<string, ReleaseCapability>;

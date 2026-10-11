# Phase 11 Step 4B — Privacy and RLS security audit

Date: 2026-10-11. Documentation-only; no remediation is implemented or deployed.

## Baseline, scope and evidence limits

Branch `docs/phase-11-privacy-rls-audit`, isolated worktree `C:/p11priv`, based on freshly fetched main `eccd5214e0c6e3ce68f86b9656d972441b53a34a`. Only this worktree's repository files were inspected. The dirty primary checkout, Step 4A branch and PRs #7–#18 were not modified. No resets, schema deployments, hosted queries, Docker cleanup, app-data changes or Android validation occurred. Step 2F remains deferred.

Evidence combines migration and client call-chain inspection, read-only local PostgreSQL catalog queries, existing security suites and an audit-only transaction containing uniquely named fixture records. Every fixture transaction rolled back. No legitimate records were edited. Test SQL is reproduced in this document rather than committed as a test or migration, keeping this PR documentation-only.

Local PostgreSQL is ahead of main: latest installed ledger versions observed were `20261011120000`, `20261009190000`, `20261009180000`. Extra installed objects must not be attributed to main. Findings below cite main's definitions as well as local behavior; local-only drift is marked separately. This audit does not establish hosted equivalence, inspect all possible RPCs, or certify that vulnerabilities are absent.

Official reference consulted: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and current changelog. Effective access requires BOTH grants and a matching RLS policy. SECURITY DEFINER can bypass row policies; an empty search_path does not replace caller authorization. Service role bypasses RLS but still requires SQL object privileges.

## Findings by severity

No Critical finding was confirmed in this scope. Three High-risk findings, one Medium exposure and three Low follow-ups are listed below. H3's disclosure is proven; whether post-settlement individual ballots are intended to be public requires a product decision because repository contracts conflict.

### H1 — Anonymous notification forgery through an internal helper (High, confirmed authorization defect)

Affected: `public.clash_notify(text,text,notification_kind,text)`, `notifications`, `start_clash`, `settle_clash` / settlement legacy chain.

Evidence: `20260926160000_clash_engine.sql:101–123` calls the helper server-only, but declares SECURITY DEFINER with arbitrary recipient, actor, event kind and entity parameters, no caller validation and no subsequent EXECUTE revocation found in main. Local `has_function_privilege('anon', ..., 'EXECUTE')` and the authenticated equivalent both return true. The helper's empty search_path protects name resolution, not ownership. Direct notification INSERT is denied to clients, but this function bypasses that restriction.

Reproduction within rolled-back fixtures: as role anon, `select public.clash_notify('privacy-a','privacy-b','clash_result','privacy-clash');` succeeds; the owner-role inspection finds the injected notification with the supplied actor. Anonymous SELECT of notifications still throws 42501. This is a write authorization defect, not a notification-list read leak. It permits spoofed server results/reputation notices and spam; no money or actual reputation change was demonstrated.

Minimum proposal: revoke EXECUTE from PUBLIC, anon and authenticated explicitly; do not rely on REVOKE FROM PUBLIC alone. Retain owner-executed internal calls. Inspect service-role dependencies before deciding its explicit grant. Do not add a blanket auth.uid requirement inside this internal writer: trusted cron settlement legitimately writes without an interactive user. No client service in main invokes clash_notify directly. Existing start/settle definer calls should continue working under their owner privileges.

### H2 — Locked course text bypasses entitlement rules through direct SELECT (High, confirmed disclosure)

Affected: `course_lessons`, `course_lessons_select`, `can_access_course_lesson`, `course_lesson_card`, `services/vaultCommerceService.ts`.

Evidence: `20261004170000_vault_commerce.sql:239–244,273–287` grants full lesson SELECT to anon/authenticated and checks only publication and creator blocks. It does not check lesson/course access_type or subscription. `body_text` and `media_object_id` are therefore readable on published, non-preview subscriber lessons. In contrast, the entitlement predicate denies access and `course_lesson_card` returns an empty body when inaccessible (`20261004170100_vault_commerce_rpcs.sql:492–539`, subsequently routed through the internal caller-safe helper by Phase 0.5).

Reproduction: a published subscriber course containing a published subscriber lesson with preview_allowed=false and a unique test body. Both anon and an unrelated non-subscriber read that body directly. The access predicate returns false and the card returns bodyText=''. Private media storage download bypass was NOT demonstrated; the confirmed payload is the text body and raw lesson metadata/object ID.

Minimum proposal: preserve public lesson catalogue metadata and counts, revoke table-wide and any inherited/full-column client SELECT, then explicitly grant only safe metadata columns, excluding body_text and media_object_id. Keep the existing entitlement-aware card/media RPCs as the content path. Simply revoking SELECT(body_text) while retaining table-wide SELECT will not work. A row-policy-only fix would hide locked catalogue entries and change counts; avoid that unless the product explicitly wants it. Main's direct lesson consumers select course_id/status, id counts, or id for card lookup; those can retain compatibility. Re-audit any external select('*') integrations before deployment.

### H3 — Public reward ledger reconstructs judging choices and discloses activity/reward metadata (High privacy risk; disclosure confirmed, public contract unresolved)

Affected: `reputation_events`, `verdicts`, legacy settlement rewards, GROUP Room settlement, public facet/standing projections.

Actual access: anon and authenticated have table-wide SELECT inherited from the initial default privileges; RLS `reputation events are readable by everyone` uses true. RLS is enabled, but it restricts no reads. Every event exposes profile_id, clash_id, arena_room_id, kind, reputation_delta, coins_delta and exact created_at. Client DML is not granted.

Intent evidence is mixed:
- `20260926160000_clash_engine.sql:345–348` explicitly calls this a public immutable reward ledger.
- `services/clashEngineService.ts:350` labels fetchReputationEvents a profile's public reward ledger and accepts a profile ID.
- `20261005130100_arena_reputation_facets.sql:258` later calls it own-only, although no ledger RLS change implements that claim.
- Individual judgement and GROUP side-vote RLS remain owner/staff-only. The original Clash comment says ballots are private until settled; the actual policy never opens them to unrelated users after settlement. Public judging means anybody eligible can judge; it does not itself specify that named ballots are public.

Concrete disclosure: real fixture settlement of three ballots produces six reward rows. A public `clash_dissent` row identifies juror privacy-c; the public B verdict reconstructs that juror's A vote. A winning-juror `clash_win` similarly identifies alignment. No pre-settlement ballot leak is demonstrated by these settlement-generated events. GROUP `arena_winning_side` also identifies agreement with the final public side (`20261002150100_live_arena_schema.sql:1785–1857`). Ledger rows remain readable after the source Take is removed, even while clash_view returns null and direct ballot SELECT is denied. Coin deltas disclose per-event rewards, not the current full profile balance.

Recommendation requiring approval: expose BOTH private own history and public aggregates, rather than a public identified per-event ledger. Make raw event reads owner-only (plus explicitly authorized staff/service access); remove anon SELECT and the USING(true) policy. Keep public reputation/rank and approved coarse facet/standing summaries through narrowly projected APIs. If named post-settlement judging is deliberately public, document that decision and still exclude unreadable-source links and coin deltas; do not silently claim ballots are private.

Dependencies: fetchReputationEvents is called by app/clash/[takeId].tsx for `me` after settlement; there are no other main client callers found. Server settle_clash rewards, GROUP settle_arena_room, entertainment/backup rewards, sync_reputation_facet and backfill read/write as trusted definer/owner code; they do not need broad API SELECT. Ledger idempotency, verdict/reputation amounts, facet triggers and reward rules must not change. External API consumers and unmerged PRs remain an integration risk.

### M1 — Removed-source Clash relationships and verdicts remain directly enumerable (Medium, confirmed metadata exposure)

Affected: direct `clashes` allowed columns and `verdicts`. `clashes` uses USING(true); column grants hide challenger identity/duel keys but retain id, take_id, status, mode and timing. Verdict SELECT uses true and returns final scores/winner and clash_id without checking source visibility. These paths disagree with caller-scoped clash_view/profile list RPCs after source removal or safety filtering.

Reproduction: after removing the fixture source, anon sees the allowed Clash row and B verdict; arena_take_readable is false and clash_view is null. This demonstrates metadata/outcome visibility, not access to removed argument text or hidden fighter columns. Source mutation to 'removed' occurs only on the rolled-back fixture.

Proposal: an additive restrictive Clash SELECT predicate sharing source/counterparty visibility and fixture semantics; verdict reads must require a caller-readable parent. Use carefully scoped definer predicates to avoid column-grant failures and policy recursion. Preserve readable settled history and legacy/public/bind-mode identity rules. Do not blindly revoke result access. Canonical raw Room metadata was investigated separately and DID NOT leak in the removed-source test: its policy joins arena_daily_topics, whose restrictive source predicate hides the parent topic and Room. No Room RLS change is proposed on that evidence.

### L1 — Public aggregate helper versus own-only facet contract (Low, confirmed documentation/API mismatch)

Raw profile_reputation_facets is own-only and denies unrelated rows. However reputation_facet_json(profileId), arena_standing_for(profileId), arena_may_call_backup/profile and arena_may_be_called are publicly executable definer projections. A stranger can get aggregate scores/standing, without timestamps or raw event rows. Main explicitly grants these helpers publicly and describes public profile facets, so this is not established privilege escalation. get_my_arena_reputation is own-session-only. Document approved public aggregates and distinguish them from private history; consider private internal helpers plus one explicit public projection only if required. Aggregate changes can still allow inference, so owner-only ledger does not make all participation unobservable.

### L2 — Test numbering collision in pending integrations (Low, integration defect)

The audited main test directory had 83 files and no duplicate numeric prefixes. The pending Safety Settings and comment/reply notification suites both originally proposed sequence 084. Phase 11 Step 5B now assigns Safety Settings to `086_safety_settings.sql` and retains PR #13's `084_comment_reply_notifications.sql` in the candidate only. The original audit changed no branch or database. A numeric prefix is an ordering convention rather than PostgreSQL migration identity, but collisions obscure test ownership and integrations.

### L3 — Local-only schema drift requires ownership review (Low, environment limitation; not a main finding)

Catalog inspection found an extra local `_phase11_e2e_report` table without RLS and with anon/authenticated SELECT, absent from this main source. No contents were read, so sensitive-data exposure is not asserted. The local migration ledger is also ahead of main. Identify this artifact's owner, contents and lifecycle before deciding whether to privatize it; do not delete it or infer it is safe from its name. Never mark/replay migrations to make environments appear aligned. This drift limits hosted and clean-main equivalence claims.

## Access-control matrix

This is the current product contract evidenced by source and tests, not a blanket promise of private profiles or private follow graphs. `Public` means approved public fields/rows subject to the stated source filters; `own` means session-owned rows; `entitled` means the existing subscription/room predicate. Staff means a normal authenticated moderator/admin profile, NOT service role. Staff do not bypass RLS automatically. Service role needs grants even though it bypasses RLS.

| Resource / intended boundary | Anonymous | Authenticated unrelated | Owner | Authorized participant | Staff | Service role | Actual comparison |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Public profile identity/rank | Public whitelist | Public whitelist | Same + get_my_profile own balance | Same | Same API column whitelist | Granted internal fields | Correct column grants; no private-profile flag implemented |
| auth_user_id / role / coins | No raw columns | No raw columns | get_my_profile own coins; no raw linkage/role | No extra access | No automatic raw-column exception | Granted | 060 suite denies anonymous/private selects and protected writes |
| Blocks | None | No unrelated list; own incoming relation is intentional | Own outgoing/incoming | Only if party | is_staff rows | Granted | Correct parties/staff RLS; no promise that blocked party cannot know its relation |
| Mutes | None | None for another owner | Own | No extra | is_staff rows | Granted | Correct owner/staff RLS |
| Notifications | None | None | Recipient read; read_at UPDATE only | No extra | No general staff read exception | Granted | Read RLS correct; helper write bypass H1 |
| Follows | Public edges | Public edges | Public edges, own follow RPCs | Public edges | Public edges | Granted | Intentional public social graph; not treated as bug |
| Arena challenges / counter-position | None | None | Challenger/recipient if readable | Same parties only | No generic staff exception | Direct SELECT not granted in main | Parties + source/safety policy, restrictive fixture exclusion; definer operations enforce ownership |
| Clash relationship metadata | Readable source only recommended | Readable source only recommended | Readable history | Readable history | Explicit scoped access, no blanket bypass | Granted | Current true policy leaks allowed columns after removal: M1 |
| Individual judgements and GROUP side/argument votes | None | None | Own ballot | Own ballot; fighters gain no extra votes | is_staff rows | Granted | Direct policy correct; ledger inference H3 |
| Verdicts / GROUP results | Public readable final outcome | Same | Same | Same | Scoped result policy | Granted | Verdict source check missing M1; GROUP results depend on settled/visible Room |
| Reputation event history | Original contract public; private-own recommended pending approval | Same contract decision | Own full history recommended | Own only recommended | Explicit audit permission recommended | Granted | Current all-row SELECT and true policy: H3 |
| Reputation facets/standing | Approved aggregates only | Approved aggregates only | Own raw facets + own reputation RPC | Same public aggregates | No raw-facet exception except own | Granted | Raw own RLS correct; public helper contract L1 |
| Crews / active roster roles | None | Active Crews and roster | Active roster; owner management via RPC | Active roster | Archived Crew rows via staff predicate; no blanket roster override | Granted | Intentional authenticated discovery, not secret membership |
| Crew invites/join requests/follows/cooldowns | None | None | Inviter/recipient; requester; own follows/cooldown | Active Crew owner/mod may see join requests | Only if qualifying party/mod; no automatic override | Granted | Fine-grained policies and RPC/helper grants; no dirty discovery code included |
| Reports / moderation actions | None | None | Reporter own reports; no review writes | No extra | Reports and moderation actions | Granted | Correct server intake and staff-only moderation |
| Private Vault drops/media/subscriptions | Free public drops only; no private metadata | Only entitled published content | Creator own valid content; subscriber own entitlement | Active entitled subscriber content | Explicit staff predicates for drops/media/subscriptions | Granted | Existing can_access_vault_drop scoped wrapper and private signing path; 012 negative tests pass |
| Vault communities/memberships/content | None | Active directory only; content per access helper | Creator/member exceptions | Entitled membership content | Explicit staff predicates | Granted | Correct membership/creator restrictions; 041 passes |
| Course catalogue versus lesson body | Public safe catalogue; content only if free/preview | Content only if entitled | Creator body through card | Entitled body/media | No special course-table staff grant beyond policy | Granted | Locked body currently exposed by raw table: H2 |
| World coordinates/geo cells and Drops | Readable published public, snapped location only | Same, caller block/mute/media filters | Own drafts/valid author rows | Same public/mission rules | Explicit author/staff predicates | Granted (RLS bypass) | Raw coordinate inputs snapped to 0.005° grid before storage; approximate point/geohash6 are deliberately public; clue/answers/private reward columns withheld |
| Private Room transcript/Crowd/typing | No private transcript/typing | Requires authorized readable Room entry | Fighter/member rules | Readability + membership; official writes fighter-only | Explicit moderation paths | Per-object grants; typing table itself revoked | Existing canonical/typing checks pass; no Presence metadata publish policy |

Public content remains anonymously readable by design; a per-account block is not a promise to remove previously public content from all signed-out visitors. No new private-account model is inferred.

## Security-definer and indirect response review

- Local metadata: 418 public SECURITY DEFINER functions, all with empty search_path; 23 also set row_security=off. This is an environment observation, not proof that every function on main has been exhaustively verified. H1 illustrates that search_path safety does not imply caller safety.
- my_profile_id and owns_profile bind ownership to auth.uid; is_staff reads the server-owned profile role. No tested path grants elevated role/coins through profile edits.
- Phase 0.5 202610081101/104/105 clones trusted internal visibility/entitlement helpers, revokes API EXECUTE on those internals, and guards public wrappers against arbitrary viewer IDs. 061 tests exercise relationship-oracle rejection. world_author_hidden also has API EXECUTE revoked; its arbitrary parameters are internal, not a new public oracle.
- Canonical assert_canonical_clash_access is owner-only and validates source and Room access under existing parent/source locks; message/evidence/judgement/watch call chains preserve these checks. 070 adversarial source/block/mute tests pass. No lifecycle/judging change is proposed.
- Private security_barrier views (arena_readable_topics, explore_readable_* / explore_discoverable_takes) revoke API access; public definer RPCs consume caller-scoped predicates. They are not blindly assumed safe because of the barrier alone. A future accessible view should use security_invoker where appropriate, or remain private.
- Crowd/Stage use separate data and membership/visibility checks. Typing table grants are revoked, and private realtime.messages broadcast SELECT checks room membership/readability. No client Presence/INSERT policy grants identity publication. Socket/device reauthorization was not physically exercised in this audit.
- Private Vault signing stays behind entitlement-aware helpers/Edge Function contracts. This audit did not request signed URLs, storage downloads, hosted functions or real subscriptions. Public media metadata/storage URLs may remain observable independently of a withdrawn discovery card; full public-media revocation/CDN behavior is outside these database assertions and must not be claimed solved.
- Profiles are field-whitelisted; public facet helpers intentionally return aggregates. Main's public RPC constructions reviewed here use explicit fields, not an unfiltered profiles.* JSON row. Other RPC families require continued review; this is not an exhaustive all-endpoint certification.

## Recommended Step 4C implementation order and additive migrations

Names below are proposals only, not generated or applied migration files. Use the CLI to allocate actual migration versions after approval.

1. **private_notification_helper_grants**: close H1 by explicit EXECUTE revocation; inspect all same-family internal void writers and retain trusted settlement/cron calls. Add role-level and direct RPC forgery denials plus successful trusted notification-generation tests.
2. **course_lesson_content_projection**: close H2 using safe catalogue column grants and existing entitlement-aware card/media responses. Test guest/non-subscriber cannot request body_text/media_object_id directly, entitled/creator card bodies work, locked card text is blank and lesson counts/navigation stay correct. No payment integration is included.
3. **reputation_history_privacy**: only after the public-history/ballot product contract is approved, remove anonymous raw-history access and replace all-row SELECT with own-history + explicitly justified staff access. Preserve public total reputation/rank and approved aggregates. Keep settlement and triggers owner-executed; prove rewards/notifications remain exactly once. Update fetchReputationEvents documentation/contract, and introduce a bounded own-history RPC only if its caller/field contract needs it.
4. **clash_result_source_visibility**: close M1 with shared caller/source visibility on raw Clash/verdict reads, reusing existing safe predicates without recursive policy dependencies. Preserve public readable settled results, BLIND identity behavior, canonical/legacy compatibility and removed/blocked/fixture exclusions.
5. Clarify public facets, reserve unique test prefixes and investigate local-only diagnostic ownership. These are not reasons to alter the Step 4A branch or another PR in this checkpoint.

Do not bundle new gameplay, judging eligibility, reward calculations, Crew discovery, World rendering, native code, broad private-profile mechanics or Step 2F into Step 4C. Deployments need separate authorization and target-environment verification. Do not change shared default grants wholesale without auditing every existing read dependency; prefer explicit per-object least privilege first.

## Focused pgTAP / client hardening plan

- Role matrix: empty JWT anon; unrelated account; owner; authorized juror/fighter/spectator/subscriber; moderator/admin; service_role with actual grants. Include direct REST/RPC known-ID requests as well as SQL-role tests. No role should gain privileges by passing a different owner/viewer ID.
- H1: EXECUTE denied for anonymous/authenticated forged notifications, including known recipient/actor IDs. Verify legitimate start/settle and zero-ballot cancellation notices through trusted paths; repeat settlement produces no duplicate notices/awards.
- H2: subscriber/paid non-preview lesson body unavailable by direct SELECT while catalogue metadata remains accessible; caller-safe card and signing deny non-entitled readers, show content to creator/valid subscriber, and revalidate expired/revoked entitlement and blocks. No new payment mechanics.
- H3: own ledger page succeeds; unrelated/anonymous rows denied, own-history owner cannot be overridden, approved public aggregates remain valid, private event metadata does not appear in public RPCs. Verify verdict+public payload cannot reconstruct an individual's ballot under the approved product contract. Test removed/blocked source, GROUP history and reward/facet idempotency.
- M1: direct raw Clash/verdict and indirect RPC visibility agree after removal, blocks/mutes and runtime-fixture restrictions. Preserve legitimate historical results, cancelled access rules and BLIND identities.
- Retain 060/061 profile/helper adversarial tests, 062/063 content/typing, 070 canonical authorization, 012/039/041 Vault/lesson/community, 050/051 Crew, 082/083 Explore/World. Extend coverage rather than weakening existing assertions. Add concurrency tests where a new authorization check must serialize with removal or entitlement revocation.
- Test account switching/late response isolation in affected own-history/list services. Step 4A already has its own pending controlled test work; integrate only after review and resolve the 084 collision with a free name such as 086_safety_settings.sql.

## Validation actually executed

| Check | Result |
| --- | --- |
| npm run typecheck | PASS, exit 0 |
| npm run test:unit | PASS, 464 tests, 118 suites, 0 failures/skips |
| Consolidated local pgTAP | PASS, 15 files, 637 assertions, exit 0 |
| Audit-specific reproduction within that run | PASS, 31 assertions; tests intentionally confirm current exposures and negative controls |
| Full main test-directory numbering scan | 83 files, zero duplicate numeric prefixes; 086 unused |
| Git scope / whitespace check | PASS; only this audit document is staged |

The pgTAP run comprised `.expo/audit/privacy-reproduction.sql` plus existing 000_social_foundation, 002_clash_engine, 060_profile_read_security, 061_relationship_and_crew_security, 062_arena_content_visibility, 063_private_room_typing, 070_canonical_authorization, 082_explore_security_contract, 083_world_read_security, 012_vault_access, 039_vault_commerce, 041_vault_communities, 050_arena_crews_foundation and 051_arena_crews_behavior. Command: `npx supabase test db --local` followed by these exact relative `.sql` paths. No migration was applied. These SQL tests use actual local roles, RLS and functions; the Node unit suite is separate and is not live REST/device verification. The complete pgTAP directory and hosted environment were not tested.

Initial audit fixture checks failed twice: an expected facet total incorrectly omitted participation credit (correct total 25, not 15); a canonical fixture attempted to pair two accounts already blocked/muted by another fixture (server correctly refused). Correcting fixture expectations and using unrelated fixture fighters produced the final consolidated pass. No policy/grant was weakened or production rule changed. npm ci --ignore-scripts used the existing lockfile; Node 22.11.0 emitted an expo-doctor engine warning. Expo Doctor was not requested or run in this audit. Physical Android, actual HTTP/PostgREST calls, storage delivery and hosted configuration remain unverified.

## Source inventory inspected

- services/safetyService.ts, socialService.ts, notificationService.ts, clashEngineService.ts, vaultCommerceService.ts, arenaGameService.ts; app/clash/[takeId].tsx call sites and profile/Arena consumers located through searches.
- 20260926120000_initial_arena_schema.sql; 20260926140000_social_foundation.sql; 20260926150000_media_storage.sql; 20260926160000_clash_engine.sql; 20260927010000_clash_draw.sql; 20260928000000_vault_foundation.sql; 20260928110000_blind_clash.sql; 20260928130000_world_missions.sql; 20260928140000_world_drop_view.sql.
- 20261002150100_live_arena_schema.sql; 20261004170000_vault_commerce.sql; 20261004170100_vault_commerce_rpcs.sql; 20261004190000_vault_communities.sql; 20261004200000_creator_world_drops.sql; 20261004200100_creator_world_drop_rpcs.sql; 20261005130100_arena_reputation_facets.sql; relevant reward/helper references in 20261005130200_arena_call_backup.sql and 20261005130300_arena_reactions_and_entertainment.sql.
- 20261006120100_arena_crews_foundation.sql; 20261007120000_arena_duel_foundation.sql; 20261007130100_arena_challenge_lifecycle.sql; 20261008110000_profile_read_security.sql; 20261008110100_relationship_and_crew_security.sql; 20261008110200_arena_content_visibility.sql; 20261008110300_private_room_typing.sql; 20261008110400_legacy_visibility_helpers.sql; 20261008110500_private_viewer_helpers.sql; 20261008110600_canonical_topic_visibility.sql; 20261008151000_arena_challenge_inbox.sql; 20261009100000_canonical_authorization.sql; 20261009180000_explore_security_contract.sql; 20261009190000_world_read_security.sql.
- Existing tests listed above and full test filename inventory; local pg_policies, pg_proc, pg_roles, table/column privileges and migration metadata. Relevant file sections and call sites were inspected; this is not a claim of complete line-by-line review of every file in each subsystem.

## Reproducible audit transaction

The exact final audit-only SQL below ran locally. Its OBSERVED assertions deliberately prove current exposures; they are NOT future acceptance tests. Step 4C must invert exposure expectations after fixes. Run only against authorized local test infrastructure. It changes no RLS/grants and rolls back all fixture writes, including real fixture settlement effects.

```sql
begin;
select no_plan();
insert into auth.users(id) values
 ('cf11000b-0000-4000-8000-000000000001'),('cf11000b-0000-4000-8000-000000000002'),
 ('cf11000b-0000-4000-8000-000000000003'),('cf11000b-0000-4000-8000-000000000004'),
 ('cf11000b-0000-4000-8000-000000000005'),('cf11000b-0000-4000-8000-000000000006');
update profiles set id='privacy-a',handle='privacy_a' where auth_user_id='cf11000b-0000-4000-8000-000000000001';
update profiles set id='privacy-b',handle='privacy_b' where auth_user_id='cf11000b-0000-4000-8000-000000000002';
update profiles set id='privacy-c',handle='privacy_c' where auth_user_id='cf11000b-0000-4000-8000-000000000003';
update profiles set id='privacy-d',handle='privacy_d' where auth_user_id='cf11000b-0000-4000-8000-000000000004';
update profiles set id='privacy-e',handle='privacy_e' where auth_user_id='cf11000b-0000-4000-8000-000000000005';
update profiles set id='privacy-f',handle='privacy_f' where auth_user_id='cf11000b-0000-4000-8000-000000000006';
insert into takes(id,author_id,hood,text,is_runtime_fixture) values('privacy-take','privacy-a','techtakes','Rolled-back privacy audit fixture',true);
insert into clashes(id,take_id,challenger_id,opens_at,closes_at) values('privacy-clash','privacy-take','privacy-b',now()-interval '2 hours',now()+interval '1 hour');
insert into judgements(clash_id,juror_id,side) values('privacy-clash','privacy-c','A'),('privacy-clash','privacy-d','B'),('privacy-clash','privacy-e','B');
update clashes set closes_at=now()-interval '1 hour' where id='privacy-clash';
select lives_ok($$select settle_clash('privacy-clash')$$,'fixture settlement generates authentic reward ledger');
update takes set status='removed' where id='privacy-take';
insert into creator_courses(id,creator_id,title,access_type,status) values('privacy-course','privacy-a','Audit subscriber course','subscriber','published');
insert into course_lessons(id,course_id,title,position,body_text,access_type,status,preview_allowed) values('privacy-lesson','privacy-course','Audit locked lesson',1,'AUDIT ONLY LOCKED LESSON BODY','subscriber','published',false);
insert into mutes(muter_id,muted_id) values('privacy-a','privacy-b');
insert into blocks(blocker_id,blocked_id) values('privacy-a','privacy-b');

select ok(has_function_privilege('anon','public.clash_notify(text,text,public.notification_kind,text)','EXECUTE'),'OBSERVED anonymous may execute supposedly internal notification helper');
insert into takes(id,author_id,hood,text,is_runtime_fixture) values('privacy-duel-take','privacy-a','techtakes','Rolled-back canonical visibility fixture',true);
select set_config('audit.room_id',create_arena_duel('privacy-duel-take','privacy-f','cf11000b-0000-4000-8000-000000000010')->>'roomId',true);
update takes set status='removed' where id='privacy-duel-take';
set local role anon;
select is((select count(*) from arena_rooms where id=current_setting('audit.room_id')),0::bigint,'negative control raw canonical Room hidden through topic RLS when source removed');
select is((course_lesson_card('privacy-lesson')->>'bodyText'),'','negative control public lesson card masks locked body');
select throws_ok($$select world_author_hidden('privacy-a','privacy-b')$$,'42501',null,'negative control internal World relationship helper not executable');
select lives_ok($$select clash_notify('privacy-a','privacy-b','clash_result','privacy-clash')$$,'OBSERVED anonymous forges notification recipient, actor, event and entity');
select ok(has_table_privilege('anon','public.reputation_events','SELECT'),'OBSERVED anonymous ledger grant');
select is((select count(*) from reputation_events where clash_id='privacy-clash'),6::bigint,'OBSERVED anonymous sees all six generated ledger rows despite removed source');
select is((select profile_id from reputation_events where clash_id='privacy-clash' and kind='clash_dissent'),'privacy-c','OBSERVED identifies dissenting juror');
select is((select winner_side::text from verdicts where clash_id='privacy-clash'),'B','OBSERVED final winner permits reconstruction of dissenting A ballot');
select throws_ok($$select * from judgements where clash_id='privacy-clash'$$,'42501',null,'negative control direct anonymous ballots denied');
select is(arena_take_readable('privacy-take'),false,'negative control removed source unreadable');
select is(clash_view('privacy-clash'),null::jsonb,'negative control guarded Clash RPC hides removed source');
select is((select count(*) from clashes where id='privacy-clash'),1::bigint,'OBSERVED direct allowed Clash columns still expose removed-source relationship');
select is(can_access_course_lesson(null,'privacy-lesson'),false,'negative control lesson access predicate denies anonymous entitlement');
select is((select body_text from course_lessons where id='privacy-lesson'),'AUDIT ONLY LOCKED LESSON BODY','OBSERVED direct anonymous SELECT leaks locked lesson body');
select throws_ok($$select auth_user_id from profiles where id='privacy-a'$$,'42501',null,'negative control private profile identity denied');
select throws_ok($$select coins from profiles where id='privacy-a'$$,'42501',null,'negative control profile balance denied');
select throws_ok($$select * from mutes$$,'42501',null,'negative control anonymous mute read denied');
select throws_ok($$select * from notifications$$,'42501',null,'negative control anonymous notifications denied');
select is((reputation_facet_json('privacy-c')->>'DEBATE')::integer,25,'OBSERVED public aggregate facet available through definer RPC');
reset role;
select is((select count(*) from notifications where recipient_id='privacy-a' and actor_id='privacy-b' and kind='clash_result' and entity_id='privacy-clash'),1::bigint,'OBSERVED forged notification exists despite no table INSERT grant');
select set_config('request.jwt.claims','{"sub":"cf11000b-0000-4000-8000-000000000006","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from reputation_events where clash_id='privacy-clash'),6::bigint,'OBSERVED unrelated account sees reward history');
select is_empty($$select * from judgements where clash_id='privacy-clash'$$,'negative control unrelated juror ballots private');
select is_empty($$select * from profile_reputation_facets where profile_id='privacy-c'$$,'negative control unrelated facet table rows private');
select is((reputation_facet_json('privacy-c')->>'DEBATE')::integer,25,'OBSERVED aggregate RPC bypass is intentional public projection');
select is_empty($$select * from blocks where blocker_id='privacy-a'$$,'negative control unrelated blocked list private');
select is_empty($$select * from mutes where muter_id='privacy-a'$$,'negative control unrelated muted list private');
select is(can_access_course_lesson(my_profile_id(),'privacy-lesson'),false,'negative control non-subscriber denied by entitlement predicate');
select is((select body_text from course_lessons where id='privacy-lesson'),'AUDIT ONLY LOCKED LESSON BODY','OBSERVED unrelated non-subscriber also reads locked lesson text');
select throws_ok($$select can_access_course_lesson('privacy-a','privacy-lesson')$$,'42501',null,'negative control forged entitlement viewer denied');
reset role;
select * from finish();
rollback;
```

# Explore Phase 1A — Security, Privacy & Data Contract Hardening

Verified locally on 2026-10-09. This checkpoint hardens existing country/global discovery and Play. It does not implement nearby maps or certify production readiness.

## Baseline and preservation

- Branch: `main`; starting HEAD: `37aaea98cb210c7b54d91583dc988646053e5bdd`.
- The pre-existing dirty Crew files, Crew discovery migration/test, development scripts, Android development notes, `Microsoft/`, and `shot.png` were excluded from this checkpoint. No reset, cleanup of legitimate records, native configuration change, dependency installation, hosted migration, or Edge Function deployment was performed.
- The local migration ledger initially contained 99 versions. Comparing filenames to installed versions found only this checkpoint's new migration missing. `npx supabase db push --local` applied **only** `20261009180000_explore_security_contract.sql`, with no seeds or roles. Final ledger: **100 versions, no missing or extra versions**, including the already installed unrelated Crew migration.
- New security fixtures are transaction-local and rolled back. Final checks found zero `es-*` profiles, challenges, or hunts. No public activity was created for Android screenshots.

## Effective state, rather than original migrations

Inspected original Explore migrations `20261003180000_explore_global.sql`, `20261003200000_explore_for_you_ia.sql`, `20261004120000_explore_play_system.sql`, and `20261004120100_explore_treasure_gameplay.sql`; also the effective replacements in `20261008110000_profile_read_security.sql`, `20261008110100_relationship_and_crew_security.sql`, `20261008110200_arena_content_visibility.sql`, `20261008110400_legacy_visibility_helpers.sql`, `20261008110500_private_viewer_helpers.sql`, `20261008110600_canonical_topic_visibility.sql`, and `20261008121000_arena_discovery_states.sql`.

Queried local `pg_get_functiondef`, function owners, `proconfig`, effective EXECUTE privileges, table grants, policies, schema columns, and migration versions before implementation. Relevant existing functions are owned by `postgres`, use SECURITY DEFINER and an empty search_path. The new helpers also use an empty search_path and fully qualified names.

| Function / chain | Effective baseline | Phase 1A contract |
| --- | --- | --- |
| `explore_actor_hidden(viewer, author)` | Already rejects a viewer distinct from `my_profile_id()`; anon/auth EXECUTE | Unchanged; anonymous spoof, authenticated spoof, own identity, mute, and reverse-block regression tests |
| `explore_actor_hidden_internal` | Owner-only; no anon/auth EXECUTE | Unchanged; used inside trusted caller-scoped predicates |
| `explore_country_activity_count` | Public callable exact count | Null below three; exact public declared-profile count at three or more |
| `get_explore_world_summary`, `get_explore_country` | Both already suppress aggregates below three; country still intentionally lists public creators | Preserve threshold and creator projection; consistently filter linked discovery content |
| `get_global_viral`, `get_teleport_candidate`, `search_explore`, `get_explore_for_you`, `get_explore_live` | Public projections; later Arena source checks present; Take fixture/media checks inconsistent | Reuse a private caller-scoped Take projection; retain existing ranking, APIs and Arena authorization |
| `list_explore_vault_previews` | Public free/intentional teaser projection | Preserve contract; exclude deleted underlying public media |
| `explore_vault_preview_rows` | Already owner-only, excludes subscriber source paths | Keep grants and Vault semantics; add deleted-media checks |
| `list_play_home`, `get_challenge_detail`, `list_challenge_entries`, `get_treasure_detail` | Definer reads had inconsistent parent/host/media checks | Caller-scoped parent and entry projections; deterministic final entry ID ordering |
| `get_my_play` | Own-profile query, but could expose unreadable parent metadata; anon grant survived | Authenticated only; filter parent/entry metadata consistently |
| Host/join/submit/react/settle/answer/content-find/reward RPCs | Existing auth, ownership, quota, inventory and uniqueness mechanisms; excessive explicit anon grants; several missing readability checks | Preserve mechanisms, remove anon execution, validate readable activity under parent locks before writes |

The original helper-oracle suspicion is **disproven for the effective baseline**: Phase 0.5 had already fixed it. The suspected country-detail threshold bypass is also disproven: detail already suppressed small counts. The confirmed aggregate bypass was the separately callable exact-count helper. Subscriber source-path exposure through the existing preview builder was not reproduced; deleted public media remained a separate confirmed gap.

## Confirmed findings and corrections

1. **High — activity visibility bypasses by known ID.** Entry RLS only checked entry status; results allowed broad reads; definer entry/detail/My Play reads and several writes did not consistently require a public, non-cancelled, caller-readable parent. `explore_challenge_readable`, `explore_treasure_readable`, and `explore_entry_readable` now enforce parent state, host relationships, entry moderation, and media readiness. Restrictive SELECT policies complement existing policies rather than replace owner scoping. Trusted projections apply the same predicates inside definer reads.
2. **High — direct settlement could create results for invalid activity states.** Explicit anon EXECUTE survived earlier `REVOKE FROM PUBLIC`; the settlement body lacked a caller-auth check and accepted inappropriate states. Direct anonymous execution is now denied. Under its existing parent lock, settlement requires a readable active/ended challenge whose end time has passed. Existing public detail lazy settlement remains available only for readable expired challenges through owner execution. Winner ranking and reward mechanics remain unchanged; deleted/private/unready entry media cannot become the winning contribution.
3. **Medium — aggregate suppression bypass.** `explore_country_activity_count` returned exact counts below three. It now returns null for zero, one, or two declared profiles, matching summary/detail. Counts describe **public declared profiles**, not online viewers, current explorers, GPS locations, or engagement. The UI no longer calls them “exploring” or invents “Trending now” when the aggregate is absent.
4. **Medium — inconsistent Take and Vault media discovery.** Owner-only `explore_discoverable_takes` requires active/unexpired, non-fixture Takes, caller relationship eligibility, and ready/undeleted public linked media. The existing preview builder excludes deleted free media and deleted intentional teasers. Legacy Take media URLs without a media-object ID remain compatible; no additional access to subscriber media is granted.
5. **Medium — stale account responses and repeated client operations.** Explore, country, challenge, treasure, and My Play screens remount their local state on auth identity/route changes. Existing Arena `useOperationScope` guards stop late operations and multi-stage uploads after unmount/scope changes. Pagination and mutation refs block duplicate taps; entry pages deduplicate IDs; search rejects outdated results. Feed generation guards reject pages from an earlier refresh. Teleport history resets on screen mount, late callbacks are guarded, and timers are cleaned up. Errors now expose an honest retry instead of silently masquerading as an empty response. Country codes are validated before RPC dispatch.

## Migration, RLS, grants, and compatibility

New migration: `supabase/migrations/20261009180000_explore_security_contract.sql`.

- New callable predicates derive the viewer internally and accept no arbitrary viewer argument. They expose only a boolean readability decision, not relationship details. Existing owner-only relationship and Vault builders remain inaccessible directly.
- Four security-barrier views (`explore_readable_challenges`, `explore_readable_treasures`, `explore_readable_entries`, `explore_discoverable_takes`) are private to trusted server execution: no PUBLIC, anon, authenticated, or service-role SELECT grants. They are not additional REST feeds.
- Restrictive read policies cover challenges, hunts, entries, results, participants, treasure progress, and entry reactions. Existing identity-specific permissive policies remain necessary. Answer digests, cross-user progress, reward tables, and direct contribution writes retain their existing denial boundaries.
- PUBLIC/anon execution is revoked for Play mutations and My Play. Authenticated execution is retained for ordinary authorized RPCs; unnecessary authenticated execution on the reaction trigger is removed. Existing service-role grants are not expanded.
- Joins now lock the same parent rows as submission/settlement. Reactions lock the challenge then revalidate the entry, host, status, start and end times. Treasure writes recheck visibility/host access after the existing hunt lock. Content-find also rejects inaccessible Take/challenge/creator targets.
- Existing quota calls, creator/staff host restrictions, media ownership, unique joins/entries/claims, challenge ranking, inventory decrement, notifications, and valid lazy settlement are retained. An earned reward remains claimable after ordinary expiry; cancellation, unlisting, or a disqualifying host relationship denies the request, including a retry. No gameplay timing or reward policy was invented.
- Read-chain rewrites are limited to explicitly inventoried functions. Migration anchors fail closed if expected source definitions have changed; existing Arena/Vault predicates are preserved.

## Client files

Changed `app/(tabs)/explore.tsx`, `app/explore/country/[code].tsx`, `app/explore/challenge/[id].tsx`, `app/explore/treasure/[id].tsx`, `app/explore/play/my.tsx`, and `services/exploreService.ts`; added `components/explore/ExploreAccountBoundary.tsx` and `scripts/explore-security-check.cjs`.

Inspected `ExploreWorldCanvas`, `ExploreModeRail`, `CountryPickerSheet`, and `ExploreSearch` without redesigning them. The five modes remain **For You | World | Live | Play | Meet**. SVG geography, country navigation, the existing server For You score/ID ordering, and existing Play APIs remain in place. Offset pagination can still move when the underlying ranked dataset changes; deduplication prevents repeated rendered IDs but is not a snapshot guarantee.

## Executed verification

| Check | Actual result |
| --- | --- |
| Full local pgTAP suite | **83 files, 3,048 assertions passed, zero failures** |
| New `082_explore_security_contract.sql` | **61 assertions passed**; included in full total |
| `npm run test:unit` | **466 tests, 119 suites, zero failures/skips** |
| `npx tsc --noEmit` | Passed, exit 0 |
| `npx expo-doctor` | **18/18 checks passed** |
| `node scripts/explore-security-check.cjs` | **8/8 checks passed** |
| Official submission/recovery service checks | **14/14 passed** |
| Settlement/history service checks | **11/11 passed** |
| Crowd service checks | **7 checks passed** |
| Duel/Stage/Crowd render smoke | **22/22 scenarios passed** |
| Arena engagement checks | **8/8 passed** |
| Focused Git whitespace check | Passed |

The complete local SQL run used the existing ignored local PostgreSQL runner (`node .expo/android-startup-check/interest-db-suite.cjs`), installing pgTAP transactionally and executing every SQL file with the established psql-variable translation. It included the existing Arena acceptance, official submission, Crowd, maintenance and editorial independent-session concurrency suites. The new Explore file tests anon/authenticated roles directly, including REST-equivalent table reads and known-ID RPCs. SQL role tests are not an HTTP transport penetration test.

New tests cover country thresholds 0/1/2/3/4, public profile field projection, spoofed viewers, one-way mutes and reverse blocks, auth changes, removed/expired/fixture/private/deleted/unready Takes, private subscriber source confidentiality, deleted teasers, cancelled/unlisted activity, stolen upload ownership, future participation denial, direct grants, private clue/progress denial, cancellation side effects, claim retry idempotency, gift inventory and legitimate post-expiry claims. Client checks execute actual screen/service/hook code with controlled native dependencies and deferred responses; they cover stale account data, A→B→A, unmount, duplicate paging/delivery, out-of-order search, retries, duplicate claim taps and invalid country dispatch.

Early fixture setup attempts failed existing Take/Vault time-window and deleted-media insertion constraints. The fixtures were corrected to obey those constraints before exercising subsequent deletion. No constraint was loosened; the final full run has no failures. An approval-service usage-limit interruption temporarily blocked a tool invocation; it was not executed and was retried only after the user resumed work.

## Physical Android results

Samsung A50 `RZ8M30DE9NL` was connected and accessible. Metro 8081 and local Supabase 55321 were listening; ADB reverse forwards were restored for both ports. Opened `clash://explore` and `clash://explore/country/IN` in the installed development client and inspected actual screenshots. For You and India displayed honest empty states without fabricated activity or an error overlay.

The unchanged SVG map and globe had also been opened and visually inspected during the preceding read-only Explore audit; this is not a claim of fresh comprehensive map/device regression coverage. Fine/coarse location permissions remained denied. No native `/world` GPS prompt, Meet matching, camera session, upload, reward claim, account switch, or public test participation was initiated for these screenshots. Physical auth-switch and Play write paths remain unverified; the controlled client checks above must not be represented as device tests.

## Remaining limitations and next milestone

- Public creator discovery intentionally exposes declared country metadata. Suppressing aggregate counts does **not** anonymize individually discoverable profiles or prevent enumeration through public people discovery. No private/deleted account model exists in the inspected profile schema, so this phase cannot claim to enforce a nonexistent profile-state policy.
- Treasure reward inventory remains protected by the existing hunt `FOR UPDATE` lock, claim uniqueness, and conditional decrement. Sequential retry/exhaustion cases passed. **A new simultaneous reward-claim test was not run**: the shared local database has no eligible test activity and independent sessions would require committed discoverable fixtures. No such public fixtures or user activity were created for this checkpoint. Run that scenario against an isolated disposable test database before broadening reward use.
- Parent-row serialization does not globally serialize concurrent block/mute or media-moderation changes; predicates revalidate at the locked write boundary. Continuous access revocation is not claimed. Existing loaded content is not automatically purged on every external moderation event; subsequent reads/writes reapply server checks.
- Legacy raw Take media URLs are retained for compatibility and cannot acquire media-object deletion guarantees retroactively. Existing reaction/entry counters describe stored totals rather than a personalized count of visible contributors. Stable offset ordering does not freeze changing rankings.
- Separate native World/location and Meet infrastructure was not remediated here. The prior audit identified World direct-read relationship filtering, location-consent/fuzzing limitations, and public Meet typing/presence as follow-up security work. The country Meet “Coming next” copy also remains inconsistent with the separate implemented Meet flow. None is presented as resolved by Explore country/Play hardening.
- No hosted migration was applied or hosted state inspected. Local success does not prove hosted parity. Existing data needs an operator-reviewed rollout and environment-specific regression checks.

Existing country/global discovery and Play now have consistent tested authorization contracts for this scope. Recommended next milestone: isolate and verify reward concurrency, resolve the separate World/Meet privacy prerequisites, then design explicit location consent and street-level map data contracts under a separately approved checkpoint. No nearby-map implementation was started.

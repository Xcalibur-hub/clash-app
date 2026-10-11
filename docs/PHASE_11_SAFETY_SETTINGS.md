# Phase 11 Step 4A — Safety Settings

## Pre-implementation audit (2026-10-11)

Isolated checkout: C:/p11safe, branch feat/phase-11-safety-settings, based on origin/main eccd5214e0c6e3ce68f86b9656d972441b53a34a. Primary checkout and unrelated Crew work are excluded.

Existing capabilities:
- block_profile, unblock_profile, mute_profile, unmute_profile: authenticated SECURITY DEFINER RPCs, empty search_path, acting profile derived by my_profile_id, PUBLIC/anon execution revoked. Inserts use ON CONFLICT; removal is idempotent. Blocking dissolves follows in both directions.
- blocks/mutes: existing composite primary keys and cascading profile foreign keys. No client DML grants. Block SELECT is limited to parties or staff; mute SELECT to owner or staff. The existing incoming-block exception supports feed safety; it does not expose unrelated users' full lists.
- fetchMutedProfiles exists, but drops relationships whose profile projection is unavailable and has no account/late-response guard. No blocked-list service. Both own relationship lists can already be read using current-session my_profile_id and table RLS. No new backend RPC, table, grant, policy or migration is necessary.
- Public profile fields are explicitly granted by 20261008110000_profile_read_security.sql; Settings will request only id, name, handle. No account linkage, balances, roles, biography or location.
- Existing PostActionsSheet and ProfileScreen use the safety RPCs; submit_report remains moderation intake. Settings is currently a sidebar placeholder; there is no Settings route.
- AccountScope remounts the store on identity changes; reloadArena refreshes feed safety sets. New Settings operations must additionally reject late responses, bind requests to the initiating authenticated session, prevent double taps and refresh Arena only after confirmed mutation.

Smallest read contract: an authenticated, bounded owner-only page over existing blocks or mutes, deriving the owner through my_profile_id, ordered by the relationship target's unique ID. Resolve only the public identity projection under existing profile RLS; retain an unavailable-account row when profile lookup returns nothing. No arbitrary acting-user ID is accepted. Backend gaps: none requiring schema changes for this scope. Existing parties/staff block visibility is intentionally retained.

Implementation and actual validation results will be appended after verification. No database migration may be applied in this task.

## Implemented behavior

Navigation: existing sidebar Settings → /settings → /settings/safety. Both relationship sections are independent, use current theme tokens and shared GlowButton controls, and expose accessible loading/error/empty/success states. Unblock uses the existing Alert confirmation pattern and explicitly explains that following is not restored. Unmute is immediate. Confirmation callbacks and row taps have synchronous duplicate guards.

fetchSafetyPage(kind, accountId, after?) derives the profile through my_profile_id; accountId is an initiating-session assertion used only on the client, never an acting-profile server parameter. Each page reads at most 51 relationship IDs, displays 50 and offers More accounts using a unique-target-ID cursor. Public identity lookup requests only id,name,handle and retains a manageable Unavailable account row if RLS/deletion timing removes the projection. Independent RLS still authorizes every table read. No privileged profile lookup is introduced.

The four existing block/mute mutation services accept an optional expected auth account for Settings, preserving previous callers. They reuse the same RPC names and target-only payloads. Requests capture the initiating session JWT on each builder rather than allowing shared-client token switching to replay an old operation under a new identity. Auth changes abort in-flight requests; bounded 15-second operations clean up subscriptions/timers and reject late results. The server continues deriving ownership from its verified JWT. An already-dispatched operation may commit under the original identity before cancellation; refresh/retry is safe because the existing relationship RPCs are idempotent. No success is claimed on an unconfirmed response.

The relationship subtree is keyed by auth account; focus generations ignore old reads/actions after navigation or disposal. Lists refresh on focus/foreground. Successful removals update confirmed rows, display confirmation and invoke existing reloadArena safety/feed hydration. ProfileScreen reloads on focus and invalidates prior profile loads so returning from Settings does not retain a stale blocked view. Profile content, moderation/reporting, follow semantics and relationship policies are otherwise retained.

The existing Arena engagement harness assumed every checkout path contained /Clash/. Its source-root detection now derives from __dirname so unchanged assertions run inside the required isolated worktree. No production Arena behavior was changed for this harness issue.

## Authorization and privacy

- No table, function, grant, policy, migration, native dependency or hosted deployment was added.
- Existing RPC ownership, FK/unique constraints, authenticated EXECUTE grants and RLS remain authoritative; clients cannot insert/delete relationship rows directly.
- No arbitrary acting-user ID or other user's owner filter is accepted by the new list API. The owner comes from my_profile_id under the captured JWT.
- Existing block visibility to its two parties and staff is preserved for safety filtering. Unrelated users cannot enumerate the list. Mutes remain owner/staff-private. This feature does not remove trusted staff access or the intentional incoming-block relationship exception.
- The identity projection follows existing public-column grants/profile RLS; no auth_user_id, coins, role, biography, location or private-profile bypass is requested.
- Existing submit_report moderation intake and its target/reason ownership rules are unchanged.

## Executed validation (2026-10-11)

| Validation | Actual result | Environment |
| --- | --- | --- |
| npm run typecheck | PASS, exit 0 | Isolated checkout, TypeScript |
| npm run test:unit | PASS, 464 tests, 118 suites, 0 failed/skipped | Node unit suite |
| npm run test:safety | PASS, 24/24 scenarios | Actual service/UI code; controlled auth, transport, hooks, profile services |
| local pgTAP: 000, 060, 061, 084 | PASS, 4 files, 114 assertions | Running local Docker PostgreSQL, real roles/RLS/RPCs; fixture transactions rolled back |
| Arena navigation | PASS, 11/11 | Existing controlled component/service harness |
| Challenge Inbox | PASS, 18/18 | Existing controlled component/service harness |
| Stage/Crowd render smoke | PASS, 22/22 | Existing render bridge; no native interaction |
| Crowd service | PASS, 7 labelled checks | Existing transport doubles; script has no numeric footer |
| Official service/store | PASS, 14/14 | Existing transport/storage doubles |
| Arena engagement | PASS, 8/8 | Existing controlled hook/composer harness |
| npx expo-doctor | PASS, 18/18 | Existing dependencies; no native rebuild |
| git diff --check | PASS | Focused branch changes |

Exact database command: npx supabase test db --local supabase/tests/000_social_foundation.sql supabase/tests/060_profile_read_security.sql supabase/tests/061_relationship_and_crew_security.sql supabase/tests/084_safety_settings.sql.

The new pgTAP file covers authenticated lifecycle/idempotency, anonymous EXECUTE denial, server-derived actor contracts, pinned function search_path, no direct relationship DML, unrelated-account list probing, inability to remove another owner's relationships and denial of private auth linkage. Existing files additionally cover follow dissolution, reports, profile grants and relationship-oracle restrictions. These are live database assertions, not mocked SQL or hosted tests. No schema was applied. Local ledger was inspected read-only (latest installed versions observed: 20261011120000, 20261009190000, 20261009180000); this task did not reconcile or change it.

Controlled safety coverage includes lost-response retry, account switching before/during requests, captured original JWT, bounded pagination over 56 rows, unavailable profiles, confirmation cancellation, exact duplicate-tap request count, RPC failure without false success, Arena refresh after confirmation, blur/refocus, foreground recovery and stale profile loads. These tests do not establish physical-device or live REST behavior.

Initial validation exposed a repeated confirmation callback path; it now submits once. The Arena engagement check initially failed because of its hardcoded checkout path; correcting root detection retained all eight assertions. Final results above reflect successful reruns. Dependency installation emitted a Node engine warning for expo-doctor on local Node 22.11.0; Doctor itself completed all 18 checks. No dependency upgrades were made.

## Android, deferred scope and remaining limitations

ADB identified the connected Samsung SM-A505F (A50). No new Safety Settings UI path, gesture, screen-reader behavior or physical account-switch flow was tested on-device in this task. Full multi-account Android Arena validation remains deferred to Step 2F. No app data, location permission, installed app or native project was changed.

Lists are refreshed on navigation, foreground and manual Refresh, not subscribed to relationship Realtime. Concurrent remote changes may require Refresh; keyset pages are not a cross-page database snapshot. Existing unused fetchMutedProfiles remains compatible for older callers; Settings uses the new guarded page contract. This phase adds no relationship history/search, private-account policy, report-management UI, community/judging rules or broad privilege redesign. An unavailable backend produces explicit errors rather than demo relationships or false empty success.

Release dependencies: review and merge this draft separately; run Step 2F physical multi-account validation on the release bundle and verify the target environment has the existing social foundation and Phase 0.5 profile/security migrations. No new migration deployment or native rebuild is required by these changes. Local tests do not establish hosted configuration equivalence or production readiness.

## Changed files

- app/settings/index.tsx
- app/settings/safety.tsx
- components/settings/SafetySettingsScreen.tsx
- components/navigation/AppSidebar.tsx
- components/profile/ProfileScreen.tsx
- services/safetyService.ts
- scripts/safety-settings-check.cjs
- scripts/arena-engagement-check.cjs
- supabase/tests/084_safety_settings.sql
- package.json (test:safety script only)
- docs/PHASE_11_SAFETY_SETTINGS.md

RPCs reused: my_profile_id, block_profile, unblock_profile, mute_profile, unmute_profile. RPCs introduced: none. submit_report is audited and unchanged. Dirty primary checkout/Crew files and PRs #7–#18 remain outside this branch. No PR is merged.

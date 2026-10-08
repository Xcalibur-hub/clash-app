# Arena Phase 2, Step 1 verification

Verified locally on 2026-10-08. This change stops at navigation and discovery;
challenge management (Step 2) is not implemented.

The existing Arena screen now has four persistent, labelled destinations in a
responsive two-column control. The selected destination has a restrained border
and surface treatment, accessible selected state, and existing haptic feedback.
No routes, packages, native modules, database tables, or membership systems were
added. The existing immersive Stage and Fresh Takes components remain intact.

| Destination | Data and navigation |
| --- | --- |
| Home | Existing personalized For You, Following, Popular and New feed scopes. |
| Live Clashes | Existing server-authoritative Pending, Live, Upcoming and Completed discovery. Existing canonical Room and legacy Clash destinations remain unchanged. |
| Communities | Existing `list_my_arena_crews` and `list_arena_crews` RPCs, real membership/follow projections and counts, bounded 24-item pagination. This surface is read-only browsing and does not depend on the uncommitted Crew detail routes. |
| Topics & Trends | Authenticated canonical interest catalogue, its server-provided Hood mappings, existing active-discussion RPC and real trend snapshots. Existing Hood, topic and joined Room routes are reused. |

Topics and Communities discard late responses after disposal/focus changes.
The existing account-keyed provider remains the account isolation boundary.
Topics distinguishes request failures from genuine empty data; trend loading and
failure states are visible. Trends explicitly bypass the optional development
fixture, even when its environment toggle is enabled. Existing server visibility,
block/mute and runtime-fixture protections remain in force; no permissions or
RLS policies were expanded.

Physical testing identified a related count bug: the linked TechTakes Hood
reported one live Take despite its empty ordinary feed. Its count queries had
omitted the runtime-fixture exclusion. Both overview and discovery summary
queries now exclude `is_runtime_fixture = true`. Count queries also select narrow
fields instead of `*`. The Hood header displays an unavailable state until its
count is known, and explicitly labels the result as live **takes**, not viewers
or Clashes. On the phone, the corrected result was zero live takes.

## Modified files

- `app/(tabs)/index.tsx`: four destinations in the existing screen; combined Topics and Trends; refresh tokens for discovery surfaces.
- `app/hood/[hoodId].tsx`: preserve unknown count state.
- `components/arena/ArenaSideRail.tsx`: persistent labelled navigation replacing the floating collapsing rail.
- `components/arena/ArenaClashes.tsx`: clear destination heading and simpler copy; status/routing logic unchanged.
- `components/arena/ArenaCommunity.tsx`: reuse committed Crew listing APIs, own/followed Crews, real counts, pagination and honest states.
- `components/arena/ArenaTopics.tsx`: canonical catalogue and active discussions, existing destinations, independent failure states and disposed-request protection.
- `components/arena/TrendingBattlesSection.tsx`: server-only option, visible request states and stale-response protection.
- `components/arena/HoodHeader.tsx`: distinguish unknown counts and live Take counts.
- `services/arenaTrendService.ts`: explicit server-only reads without development fixture substitution.
- `services/hoodService.ts`: narrow count projections and runtime-fixture exclusions.
- `utils/arenaNav.ts`: four destination names and mode vocabulary.
- `utils/arenaNav.test.ts`, `utils/arenaStadium.test.ts`, `utils/arenaFeedSurface.test.ts`: updated navigation expectations.
- `scripts/arena-navigation-check.cjs`: actual component interaction and service checks using an explicit React Native/hook bridge.
- `package.json`: `test:arena-navigation` command.
- `supabase/ARENA_NAVIGATION_STEP1.md`: this report.

## Automated verification

| Check actually run | Result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0. |
| `npm run test:unit` | 418 passed, zero failed/skipped, exit 0. |
| `npm run test:arena-navigation` | 11/11 passed. |
| `npm run test:interests` | 12/12 passed. |
| `npm run test:crowd:service` | 7/7 passed. |
| `npm run test:duel:render` | 19/19 passed. |
| `npx expo-doctor` | 18/18 passed. |
| Entire local SQL suite | 69 files, 2,571 passed assertions, zero failures. |
| `git diff --check` | Passed. |

SQL tests were executed against the responsive local PostgreSQL instance using
the existing ignored PG-wire runner, with the Supabase admin test role and
translations for the existing psql variable directives. This is not a claim
that the previously unresponsive Supabase CLI test command ran. The suite
includes RLS, grants, block/mute, fixture filtering, account isolation, canonical
duel routing/state, Crowd security and concurrency coverage. It also ran the
existing uncommitted Crew test, which is excluded from this commit. Tests with
transactional fixtures roll back; existing concurrency tests clean their owned
fixtures. No database reset or hosted migration command was executed.

Initial unit assertions still expected five destinations and were updated; the
initial component harness needed the actual icon-module bridge. TypeScript
identified the generated schema's absent fixture-column typing; the count query
now uses the compatibility-safe filter pattern already used by the feed. All
these failures were corrected before the successful final checks. The render
bridge emits an existing React Native Web `pointerEvents` deprecation warning;
it does not assert native media or animation verification.

## Physical Android results

Samsung A50 (`RZ8M30DE9NL`) was connected and unlocked. Metro on 8081 and local
Supabase on 55321 responded; ADB reverse forwarding for both ports was active.
The app displayed the latest JavaScript changes without a native rebuild.

- All four destination labels were visible and selectable, without an overlay
  obscuring discovery content.
- Home's For You, Following, Popular and New scopes were each selected and
  inspected. Current feeds honestly showed their empty states. The retained
  runtime validation Take was absent from ordinary discovery.
- Live Clashes displayed empty Pending, Live and Upcoming sections and actual
  Completed records. Tapping the settled cloud-photo-storage legacy competition
  opened its existing Judgement view, with its stored fighters and verdict.
- Communities displayed no joined/followed Crews and no discoverable communities
  for the current viewer; no membership totals were invented.
- Topics displayed the seven canonical catalogue entries. Technology opened
  the existing `h/TechTakes` screen. Back navigation returned to Arena.
- The corrected Hood header showed `0 live takes`, agreeing with the feed.
- Scrolling Topics to the bottom displayed genuine empty active-discussion and
  trend states; the enabled development trend toggle did not populate them.

Screenshots and runner logs remain local under the ignored
`.expo/android-startup-check/` directory and are not committed.

## Limits and preservation

The local viewer currently has no ordinary active Takes, pending challenges,
live/upcoming duels, discoverable Crews or active trend snapshots. Consequently,
populated physical views, Crew pagination and canonical live Crowd delivery were
not verified on-device in this step. Actual interaction, request failures,
disposed responses, real-data-only trend reads and Hood exclusions were covered
by the component/service checks; existing database tests cover the server states
and permissions. No fake live debates, Crowd messages or production activity
were created to fill the UI. This is not a production-readiness or zero-security-
vulnerability claim. Camera/native media compatibility was not rebuilt or tested.

Pre-existing dirty Crew service/payload/specialty/test files, Crew routes and
components, Crew discovery migration/test, local development scripts and other
unrelated files are preserved and excluded from this commit. No records were
manually deleted, no migrations were introduced/applied, and no hosted database
was changed. Step 2 remains deferred.

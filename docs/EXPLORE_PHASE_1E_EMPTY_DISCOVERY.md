# Explore Phase 1E — World empty discovery

## Objective

World currently has no recent public Drops in the local test dataset. Empty discovery should be useful without pretending there are nearby people, posts, or activity.

## Implementation

- Distinct empty-state copy for Recent, Map area, and Missions.
- Recent suggests browsing the current map viewport. Map area and Missions suggest Recent.
- A secondary Join Mission action appears only when an actual active Mission was returned. It uses the existing authenticated compose route.
- During a pending filter, map-area or Locate query, clear the prior mode's markers and preview; hide the empty state until the latest request completes.
- Keep the existing mission beacon, marker components, privacy-safe approximate coordinates, and permission-free entry.
- No new dependencies, map provider changes, SQL, or hosted deployment.

## Validation required

```sh
node scripts/world-consent-check.cjs
node scripts/world-request-order-check.cjs
node scripts/world-empty-discovery-check.cjs
node scripts/world-discovery-runtime-check.cjs
npx tsc --noEmit
npm run test:unit
npx expo-doctor
```

On Samsung A50, verify all three empty modes using genuine data; check CTAs, rapid mode switching, loading behavior, permission-free entry, map panning, mission beacon, and no stale markers during slow responses. If no public Drops exist, do **not** create public fixtures just to force populated screenshots. Report populated-marker paths as unverified.

## Map provider investigation — separate decision, no migration yet

Existing World uses `react-native-maps` with Google provider on Android and default provider on iOS. Explore's country-level canvas is a separate component; do not confuse it with the World street map.

Before considering OSM/MapLibre and Mapillary, collect and verify:
- Expo dev-build/native configuration and maintenance costs for MapLibre React Native in this project's SDK.
- Actual basemap tile hosting terms, attribution, caching limits, request volume and budget. OpenStreetMap data does **not** imply unlimited free production tile hosting.
- Whether Mapillary's current imagery APIs, licensing, coverage and authentication permit the intended street-view experience; do not promise coverage.
- Privacy implications of requesting tiles/imagery, coarse map positions, and street-level images.
- Android Samsung A50 performance and iOS parity, map marker/cluster parity, offline behavior, and accessibility.
- A rollback strategy retaining the existing provider until a separately validated prototype proves equivalent behavior.

This phase deliberately ships only empty-discovery improvements. Do not add MapLibre or Mapillary SDKs or keys in this PR.

## Boundaries

Draft until local and device validation. Preserve unrelated Crew files; no database reset, hosted migration, native rebuild or app-data clearing unless separately approved.

## Local validation — 2026-10-09

Safely fetched and switched to Phase 1E baseline
`d371768aeaf9b477875eb5f3f7251f7a96da5480`. All six pre-existing modified
Crew/development files and unrelated untracked files remain untouched and
excluded from this checkpoint's commit. No stash, discard, database reset,
public fixture, hosted deployment, permission change, native dependency,
Android rebuild, app-data clear or PR merge was performed.

### Correction and regression coverage

The requested baseline automated checks passed. The added runtime coverage
confirmed one new copy defect: with zero active Missions, the Missions empty
state still said that a Mission was waiting for its first Drop. The new assertion
failed after 30 scenarios passed. The screen now says **No active Mission** and
offers truthful browsing guidance. Existing active-Mission copy and actions
remain unchanged. Added a source assertion for this case without removing any
existing assertions.

Expanded the actual-screen controlled runtime bridge from 23 to 31 scenarios.
The eight additions cover empty-state navigation actions, clearing prior-mode
markers and previews, both pending stages of mission discovery, stale empty
responses while a newer request remains pending, area-search/Locate clearing,
empty suppression during focus refresh, mission authentication, and absence
of an active Mission. Process-local synthetic Drops do not become server data.

The harness now loads the actual `useRequireAuth` implementation with controlled
auth context/router dependencies. Tests verify that signed-out Join Mission
routes to `/auth`, signed-in participation routes to the canonical compose URL,
and unresolved authentication does not navigate or request location. This is
controlled hook coverage, not a real Supabase sign-in test. During test
construction, two invalid UI actions were corrected: the filter row is covered
by an open preview, so the test uses the visible mission beacon; Search this
area is available only in Map area, so that scenario selects Map area first.
No product assertions were weakened to make those scenarios pass.

### Final automated results

| Command | Actual result |
| --- | --- |
| `node scripts/world-consent-check.cjs` | Exit 0; 8 checks passed |
| `node scripts/world-request-order-check.cjs` | Exit 0; 21 checks passed |
| `node scripts/world-empty-discovery-check.cjs` | Exit 0; 13 checks passed |
| `node scripts/world-discovery-runtime-check.cjs` | Exit 0; 31 scenarios passed |
| `npx tsc --noEmit` | Exit 0; rerun after screen correction |
| `npm run test:unit` | Exit 0; final rerun: 466 tests, 119 suites, zero failures/cancellations/skips |
| `npx expo-doctor` | Exit 0; 18/18 checks passed |

No final automated failures remain. No SQL changes were necessary; no pgTAP
suite, database migration, or hosted operation was run for this checkpoint.

### Physical Samsung A50 observations

Used `RZ8M30DE9NL` (`SM_A505F`), existing `com.clash.v2` development build,
current Metro JavaScript and local Supabase. ADB reverse forwarding for 8081
and 55321 was active, and both services were listening. Location permissions
were read and remained denied with their existing USER_FIXED state.

- **Recent:** observed No recent Drops yet, the real Goa After Dark mission
  card, Explore map area and Join Mission actions. No automatic location prompt.
- **Map area:** tapped Explore map area from Recent. During a genuine delayed
  nearby query, a screenshot showed Map area selected with the empty card
  absent. After completion, No Drops in this area and Browse recent appeared.
  Browse recent triggered a genuine Recent read.
- **Missions:** observed No Mission Drops yet with active-Mission copy,
  Browse recent and Join Mission. Its Browse recent action and returning via
  the Missions filter triggered the expected real discovery calls.
- **Participation:** tapped Join Mission as the existing signed-in viewer and
  observed the compose introduction with How location works and Continue.
  Continue was not tapped; no permission or publishing step was entered. An
  unrelated heads-up notification briefly covered the header; it was not opened.
  Physical signed-out authentication was not attempted because this checkpoint
  preserved the existing device session. The actual auth hook's denied/loading
  cases were simulated in the runtime test.
- **Rapid switching:** performed Map area → Recent → Missions with real
  delayed responses overlapping. For example, nearby started at
  `1791565779921`, Recent at `1791565781024`, and the newest mission metadata
  at `1791565782384`. Earlier responses finished while the latest mode was in
  flight; the app remained usable without a crash or stuck loader. Distinct
  old/new populated content is covered only by controlled runtime payloads.
- **Panning/search:** real Google tiles moved when dragging from the map
  surface, and Search this area appeared after a settled query. Tapping it
  showed Searching with the empty card absent during the delayed read. Returning
  to Recent restored its appropriate empty state. Swipes starting on floating
  cards were not counted as map gestures.
- **Consent:** no Locate, Continue, GPS or permission action was taken. Read
  traces showed discovery calls without a foreground-permission lookup, and no
  automatic OS location dialog was observed.

Temporary Hermes service wrappers delayed genuine read-only results (nearby
6 seconds, Recent 2.5 seconds, mission metadata 3 seconds, mission Drops
1 second) without changing payloads, errors, coordinates or credentials.
Original service exports were restored after testing. Existing ignored device
diagnostics are not part of the commit. No fake public activity was created.

### Remaining limitations

All observed discovery feeds were empty. Populated marker removal, previews,
real signed-out participation, granted GPS and the no-active-Mission state are
verified only by controlled runtime tests, not physical screenshots. No new
mission was disabled to force the latter path. The hook bridge simplifies React
and map movement and does not replace native rendering or full auth sessions.

An inherited limitation remains outside the Phase 1E diff: if the viewer pans
while an ordinary filter query is pending, its completion can hide Search this
area until a further pan. The existing filter handler still clears that flag;
Phase 1D's focus-refresh correction handles the equivalent refocus race only.
This was observed during the delayed physical pan and is recorded for follow-up;
the Phase 1E validation commit does not expand earlier request-lifecycle scope.
No map-provider investigation or migration was started. PR #4 remains unmerged
by this checkpoint.

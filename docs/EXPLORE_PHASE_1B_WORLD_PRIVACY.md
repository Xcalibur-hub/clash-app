# Explore Phase 1B — World privacy checkpoint

Branch: `feat/explore-1b-world-privacy` (based on Phase 1A commit `4c27a45`).

## Discovery correction

The project **already includes** a native street-level World map at `app/world/index.tsx`,
`react-native-maps`, one-shot `expo-location`, geospatial PostGIS RPCs,
World Drops and Missions. Explore's SVG country globe is a **separate** global
navigation surface. Do not rebuild either.

## Changes in this checkpoint

1. World entry defaults to Recent and does **not** request foreground location
   permission or fetch the device's coordinates. Only an explicit tap on the
   locate button can request a one-shot location fix.
2. The original `world_drops` SELECT RLS policy permitted published rows even
   when the caller blocked/muted the author. A restrictive policy now applies
   a caller-scoped public visibility predicate, while preserving own/staff
   management access.
3. `world_drop_readable(id)` checks publication, expiry, removal, public-ready
   media and block/mute relationships. It derives the viewer from the session;
   it does not accept a spoofable viewer parameter.
4. `world_nearby`, `world_recent`, `world_mission_drops`, and
   `world_drop_view` now apply that predicate inside SECURITY DEFINER queries,
   which bypass ordinary RLS.
5. SQL regression `083_world_read_security.sql` checks raw reads, public
   access, blocked authors, revoked media visibility and author access.
6. `node scripts/world-consent-check.cjs` guards the World entrypoint against
   accidental automatic location reads.

## Privacy boundaries

World Drops still store **approximate** cell centres, not exact GPS. The
original `world_fuzz_location` snaps coordinates to a 0.005° grid. This
checkpoint does not change that scheme. It does not guarantee anonymity:
repeated posts, photo contents and geographic sparsity can still reveal a
creator's approximate location.

A foreground permission previously granted at the OS level does not cause
World to automatically query the user's position on opening the map.

## Verification needed before merging

Run on the isolated branch with a local Supabase stack:

- `node scripts/world-consent-check.cjs`
- `npm run typecheck`
- `npm run test:unit`
- `npm run supabase:test` (includes 083 and existing World tests)
- `npx expo-doctor`
- Android A50: open World with permission undetermined; confirm no prompt,
  Recent feed, explicit locate prompt, denied-permission fallback, Search this
  area, map markers and mission filters.
- Two accounts: block/mute a creator and verify their published World Drops are
  absent from the map, detail RPC and raw table SELECT.
- Revoke media readiness/visibility and verify the same public exclusion.

The original GitHub-only implementation session did not run local checks.
Local validation was subsequently completed as recorded below. Hosted rollout
remains a separate operation; it was not performed here.

## Local validation — 2026-10-09

Checked out `feat/explore-1b-world-privacy` from origin at `24382e4`, preserving
all six pre-existing modified Crew/development files and the unrelated untracked
Crew screens, migration/test, development notes, `Microsoft/`, and `shot.png`.
No branch merge, database reset, data-volume deletion, hosted deployment, native
rebuild, or new feature work was performed.

### Confirmed validation corrections

- `scripts/world-consent-check.cjs` initially failed its source-boundary assertion
  on Windows CRLF checkouts. Normalize line endings before matching; all seven
  original contract checks now pass without weakening their assertions.
- `083_world_read_security.sql` initially attempted to make media private while
  retaining the public bucket, violating `media_objects_check`. Change the test
  fixture's visibility and bucket together. Clear JWT claims before anonymous
  role checks so they cannot inherit author identity or a blocked viewer.
- The first full SQL run also failed assertion 51 of
  `042_creator_world_drops.sql`: it expected JSON null in a media field, while
  Phase 1B intentionally excludes the entire Drop with revoked readiness.
  Strengthen that assertion to require a null whole-detail response.
- Expanded 083 from 15 to 31 assertions. A rollback-only mission fixture proves
  nearby and mission discovery return the valid public Drop before testing
  exclusion. Raw SELECT, detail, Recent, nearby and Missions exclude newly
  private, deleted and unready media; block exclusion and author management
  access are also covered. Fixtures obey existing constraints; no production
  policy or migration was loosened to satisfy tests.

The migration itself required no correction. Compared installed migration
versions first: 100 installed, with only `20261009190000` missing and no extra
versions. A transactionally rolled-back migration dry-run passed. Then
`npx supabase db push --local` applied only
`20261009190000_world_read_security.sql`, with no seeds or roles. Final ledger:
**101 versions, no missing or extra versions**, including the previously installed
unrelated Crew migration. Final fixture checks found zero owned test users or
World Drops. No hosted migration was applied or hosted state modified.

### Final automated results

| Check | Actual result |
| --- | --- |
| `node scripts/world-consent-check.cjs` | 7 checks passed |
| `npx tsc --noEmit` | Exit 0 |
| Complete configured unit suite | 466 tests, 119 suites; 0 failed/skipped |
| Complete local pgTAP suite | 84 SQL files, 3,079 assertions; 0 failures |
| `083_world_read_security.sql` | 31 assertions passed, included above |
| `npx expo-doctor` | 18/18 checks passed |

The full SQL suite ran through the established local PostgreSQL runner
`node .expo/android-startup-check/interest-db-suite.cjs`, with pgTAP installed
transactionally and psql variables translated as in prior checkpoints. The
initial full run had the two failures described above; the final complete run
passed after correction. Role/RPC tests use the real local PostgreSQL functions
and RLS, not mocks; they are not a physical two-account or HTTP transport test.

### Samsung A50 results

Device `RZ8M30DE9NL` was connected and unlocked; local Metro 8081 and Supabase
55321 were listening and both ADB reverse forwards were active. Initially the
running app retained an older bundle with the “Nearby” label. Confirmed that
Metro's current Android bundle contained Phase 1B, requested a reload, and
reopened the existing debug app. The updated permission-free entry copy and
“Map area” control then appeared. No native rebuild or app-data clearing was
needed.

For a controlled consent test, revoked only CLASH's fine/coarse location grants
and reopened World. Recent was selected, the Google map rendered, and no OS
permission dialog appeared. Tapping Locate explicitly displayed Android's
foreground location permission dialog. Selected **Don't allow**: browsing
continued with the location-not-in-use explanation. The app's location grants
remain denied. Attempts to clear permission flags with the Android shell were
unsupported on this OS; no broad permission reset was performed. After denial,
the OS reports USER_FIXED, so subsequent location opt-in may require Android
app permission settings.

Physically switched Recent → Map area, panned the map, tapped Search this area,
and switched to Missions. The existing Goa After Dark mission was displayed;
each filter completed with an honest empty Drop state and no crash. No public
test Drops were created to populate the map. Blocked-author and revoked-media
exclusion were verified by the rollback-only SQL tests, not by two physical
accounts. Granted GPS fixes/recentering, populated marker/detail interactions,
mission submission and account-switch races were not physically verified.

Existing development require-cycle warnings through theme/store/mock data and
hydration appeared after reload; they were not changed in this scope. No
startup error prevented the World consent/navigation checks. Absence of an OS
prompt plus the source contract is not a packet-capture proof of all network
privacy behavior. Approximate-location inference and other previously documented
World/Meet limitations remain outside this validation checkpoint.

## Next milestone

After tests pass: evaluate World map provider strategy (Google vs OSM/MapLibre),
Mapillary licensing/coverage, map-based Play/treasure overlays and additional
privacy protections against sparse-area inference. Avoid duplicating the
existing World Drop and Mission engines.

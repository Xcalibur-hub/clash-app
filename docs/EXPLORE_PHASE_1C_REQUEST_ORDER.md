# Explore Phase 1C — World discovery request ordering

Branch: `feat/explore-1c-world-discovery`, based on the merged Phase 1B checkpoint.

## Finding

The existing World screen let every asynchronous filter/map/GPS request call
`setDrops` directly. A slower response from an earlier request could overwrite
the feed selected by the viewer later, including a switch from Nearby to
Recent or Missions. A late GPS response could also recenter after the viewer
had selected a different discovery mode.

## Change

- Keep the existing World map, markers, Missions, backend RPCs, and explicit
  one-shot location permission unchanged.
- `loadDropsFor` now returns a result without mutating the screen.
- Bootstrap, filter switches, Search this area, and explicit recenter each
  increment one screen-local request generation.
- Only the current generation may commit Drops, error notices, query origin,
  or loading state.
- Unmount invalidates in-flight requests, including pending OS permission
  dialogs. An outdated location result cannot recenter the map.
- Bootstrap is permission-free and defaults to Recent, as in Phase 1B.

## Validation

Run:

```sh
node scripts/world-consent-check.cjs
node scripts/world-request-order-check.cjs
npx tsc --noEmit
npm run test:unit
npx expo-doctor
```

Manual Android race checks:

1. Open World and switch Recent → Map area → Missions quickly. Only the
   latest selection may populate the feed.
2. Pan and Search this area, then switch to Recent before the request finishes.
   Old map-area results must not replace Recent.
3. Start a Locate permission prompt, switch modes before completing it, and
   confirm the old location result does not take over the screen.
4. Navigate away while a request is pending and check for warnings/crashes.
5. Verify map markers, mission card, preview navigation, and empty states.

The original GitHub-only implementation had not run runtime or Android tests.
Subsequent local validation is recorded below. Source-contract tests alone do
not simulate asynchronous timing. No SQL migrations are added.

## Local validation — 2026-10-09

Started at origin branch commit `1b0c33a` after checking the working tree and
fetching `feat/explore-1c-world-discovery`. The six existing modified
Crew/development files and all unrelated untracked Crew files, migration/test,
development notes, `Microsoft/`, and `shot.png` remain untouched and excluded
from the validation commit. No stash, discard, reset, main merge, hosted
deployment, native dependency installation, app-data clearing, permission grant,
or Android rebuild was performed.

### Findings and minimal corrections

Both requested source checks initially passed. A new controlled runtime check
against the actual World screen passed eight scenarios, then failed because
switching filters before startup's mission request completed discarded the
mission metadata, leaving the mission card absent. The same request-generation
flow also allowed Locate to supersede startup without clearing its loading
overlay if permission was denied.

`app/world/index.tsx` now uses a separate mission-metadata generation: filter
changes invalidate feed requests, while the current startup may still populate
the shared mission card. Unmount invalidates both generations. Locate clears
superseded loading/searching flags before permission lookup, so a denied or
failed lookup cannot strand startup loading. Existing location consent, map,
backend APIs, markers and competition mechanics are unchanged.

Added `scripts/world-discovery-runtime-check.cjs`. It runs the actual screen
with a controlled React hook/native bridge and deferred services. Distinct test
payloads exist only inside the Node process. Tests assert latest filter results,
Search this area → Recent, stale permission lookup/prompt/GPS results, stale
errors, unmount, startup mission metadata and denied-Locate loading recovery.
No existing assertions were weakened.

### Final automated results

| Command | Result |
| --- | --- |
| `node scripts/world-consent-check.cjs` | 7 source-contract checks passed |
| `node scripts/world-request-order-check.cjs` | 17 source-contract checks passed |
| `node scripts/world-discovery-runtime-check.cjs` | 11 runtime scenarios passed |
| `npx tsc --noEmit` | Passed, exit 0 after application corrections |
| Complete configured `test:unit` suite | 466 tests, 119 suites, zero failures/skips after corrections |
| `npx expo-doctor` | 18/18 checks passed |

The runtime bridge is additional regression coverage, not a physical-device
test or full React renderer. The initial mission assertion failure was corrected;
the final requested automated checks have no unresolved failures. No database
suite was rerun for this client-only change. Local read-only checks confirmed
101 installed migrations; no migration or database record was changed.

### Physical Samsung A50 observations

Used existing debug app `com.clash.v2` on `RZ8M30DE9NL`, local Metro 8081 and
Supabase 55321 with both ADB reverse forwards active. Reloaded current JavaScript
without rebuilding Android. Location grants remained denied, including Android's
USER_FIXED state from the prior consent test; no permission was granted or
permission state changed during Phase 1C.

To make overlaps observable, a temporary Hermes debugger probe delayed genuine
read-only service results: Recent 2.5 seconds, nearby 6 seconds, mission metadata
3 seconds, mission Drops 1 second, and foreground permission lookup 5 seconds.
The corrected probe preserved response payloads, errors and permissions; no
fake records, coordinates or activity were inserted. A preliminary probe had a
wrapper-binding error and was discarded/restored before counting observations.
All service functions were restored after the final checks. Device timing
helpers remain ignored local diagnostics and are excluded from the commit.

- **Rapid Recent → Map area → Missions:** observed genuine overlapping requests;
  the later mission response completed before the older nearby response. The
  selected discovery mode was not taken over by that older request.
- **Pan/Search this area → Recent:** panned far enough to expose the search
  control, started the delayed nearby query and immediately selected Recent.
  Recent remained selected after delayed results returned. A notification briefly
  interrupted this run; returning to CLASH released the pending results without
  changing the selected mode.
- **Locate → Recent while pending:** trace recorded permission lookup starting,
  then Recent starting and completing, then the older permission lookup
  completing. No stale recenter/viewer dot or new permission dialog took over.
  This exercises a pending real permission lookup, not a granted GPS fix or an
  interactive OS dialog. The latter paths were covered only by controlled
  runtime tests.
- **Leave while loading → return:** started a delayed map query, used Back to
  return to Explore, let the old request finish, then reopened World. Fresh
  mission metadata and Recent loaded; no crash or stuck loading overlay was
  observed. This verifies a popped/unmounted screen, not every retained-screen
  focus transition.
- Google map rendering/panning, the existing Goa After Dark mission card,
  filter selection, navigation and honest empty states worked. A read-only
  server check returned zero recent public Drops and two active missions.
  Populated marker taps, previews/detail navigation and rendered content
  replacement cannot be physically certified with these empty feeds. No public
  fixture was created to manufacture those paths.

The distinct nonempty payload ordering guarantee is established by the runtime
checks; physical empty-feed observations do not independently prove ordering
for every populated feed. Request generations discard outdated completions but
do not cancel network/OS work. Auth-account changes and retained-screen focus
lifecycles remain follow-up scope. Existing development require-cycle warnings
are not fixed here. PR #2 was not closed or merged; only its feature branch is
the target for the validation commit and push.

## Follow-up

After validation, evaluate World/Explore navigation and auth-account-switch
lifecycle, then scoped map-provider research (OSM/MapLibre and Mapillary) before
any native dependency change. Preserve local Crew work and avoid hosted
deployment without a separate release review.

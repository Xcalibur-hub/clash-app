# Explore Phase 1F — Map pan during discovery requests

## Observed defect

Phase 1E Samsung A50 validation found that panning during a normal filter request could make **Search this area** disappear when the request completed. The response handler unconditionally set `showSearchArea(false)`, incorrectly treating the query's original viewport as the viewer's current viewport.

## Change

- Capture the region used to start each filter or explicit Search this area request.
- When the current response completes, store its actual query origin and compare it to the latest camera region, rather than clearing the action unconditionally.
- Update the latest camera ref synchronously in `onRegionChangeComplete`, including before a render.
- Apply the same origin comparison to a nearby read following an explicit one-shot Locate.
- Keep existing Phase 1D focus refresh logic and generation-based stale-response rejection.
- No automatic location reads, new native dependencies, SQL, map provider changes or API changes.

## Validation required

```sh
node scripts/world-consent-check.cjs
node scripts/world-request-order-check.cjs
node scripts/world-empty-discovery-check.cjs
node scripts/world-pan-request-check.cjs
node scripts/world-discovery-runtime-check.cjs
npx tsc --noEmit
npm run test:unit
npx expo-doctor
```

Runtime harness includes four new pan/unchanged-region scenarios beyond Phase 1E's 31, for an expected **35** controlled scenarios. The new source check contains **8** assertions. Do not assume passing results until executed locally.

### Samsung A50

1. Open World permission-free. Select Map area and pan while a delayed nearby request is still pending. After the old viewport completes, **Search this area** should remain available.
2. Repeat with Search this area itself: pan again before the request resolves. It should remain available for the newer viewport.
3. Without panning, completing a nearby query should not leave a redundant Search this area action.
4. Rapid Map area → Recent → Missions while panning: no stale markers, errors or stuck loaders.
5. Verify retained navigation focus/blur, empty-state CTAs, mission card and preview behavior.
6. If foreground location is already granted, verify the Locate case without changing permissions. Otherwise report controlled runtime coverage only; do not request/grant permissions solely for validation.
7. Note whether observed feeds were empty. Do not create public fixtures or invent populated-marker evidence.

Use delayed genuine read-only responses only if necessary; restore any temporary wrappers and exclude device-only diagnostics.

## Boundaries

Draft PR until local validation. Preserve all unrelated Crew files. No DB reset, hosted deployment, permission change, native rebuild or app-data clear. Do not merge in Codex.

## Local validation — 2026-10-10

Safely fetched and switched to `fix/explore-1f-pan-during-fetch` at
`d8ddcdebaf086ef9ece9c20ec9142a0a2b6a8497`. Branch paths did not overlap
the six modified Crew/development files. Those files and all unrelated
untracked Crew files, migration/test, development notes, `Microsoft/`, and
`shot.png` remain untouched and excluded from the validation commit.
No stash, discard, database reset, hosted deployment, location permission
change, app-data clear, native dependency, Android rebuild or merge occurred.

### Automated results actually executed

| Command | Result |
| --- | --- |
| `node scripts/world-consent-check.cjs` | Exit 0; 8 checks passed |
| `node scripts/world-request-order-check.cjs` | Exit 0; 21 checks passed |
| `node scripts/world-empty-discovery-check.cjs` | Exit 0; 13 checks passed |
| `node scripts/world-pan-request-check.cjs` | Exit 0; 8 assertions passed |
| `node scripts/world-discovery-runtime-check.cjs` | Exit 0; 35 scenarios passed |
| `npx tsc --noEmit` | Exit 0 |
| `npm run test:unit` | Exit 0; 466 tests, 119 suites, zero failures/cancellations/skips |
| `npx expo-doctor` | Exit 0; 18/18 checks passed |

No regression or failed assertion was found. The branch already contains the
expected four additional runtime scenarios and eight pan assertions. Existing
tests were not changed or weakened. No application correction was necessary;
this checkpoint adds only this validation report. No SQL changes or database
test suite were needed or run in this client-only validation.

### Physical Samsung A50 observations

Used the existing `com.clash.v2` development build on `RZ8M30DE9NL`
(`SM_A505F`). Metro 8081 and local Supabase 55321 were listening, with both
ADB reverse forwards active. Reloaded the current JavaScript and opened World.
Fine/coarse location permissions remained denied with their existing USER_FIXED
flags. No Locate or compose Continue action was taken.

Temporary Hermes timing wrappers delayed genuine read-only service responses:
nearby 6 seconds, Recent 2.5 seconds, mission metadata 3 seconds, mission Drops
1 second. Payloads, errors, coordinates, credentials and server records were
unchanged. All wrappers were restored after the final physical test. Existing
ignored `.expo/android-startup-check` diagnostics/logs are excluded from Git.

| Device case | Actual observation |
| --- | --- |
| Permission-free entry | Recent and the real Goa After Dark card appeared without an OS location prompt. |
| Pan during Map area fetch | Started nearby read at `1791606587412`, then dragged from the unobstructed map surface while pending. Response released at `1791606594244`; Search this area remained visible for the newer viewport. |
| Pan during explicit area search | Tapped Search this area, then panned again. Read ran from `1791606640266` to `1791606646512`; action remained visible afterward. |
| Query without a pan | Repeated Search this area without moving the map. Read ran from `1791606672306` to `1791606678529`; action disappeared afterward, leaving the correct area empty state. |
| Rapid delayed filter switching | Map area → Recent → Missions produced overlapping reads. Recent completed before the older nearby read; Missions remained selected with its correct empty state after all completed. No crash or stuck loader was observed. |
| Retained navigation/refocus | Join Mission opened the compose introduction. Back returned to the retained Missions mode and panned viewport; new metadata and mission-Drop reads completed, and the real mission card/empty state recovered. Continue was not tapped. |

For the rapid-switch run, nearby started at `1791606704301`, Recent at
`1791606705385`, and mission metadata at `1791606706500`. Recent released at
`1791606708072`, nearby at `1791606710695`, and mission Drops at
`1791606710761`. On retained return, mission reads started at
`1791606769171` and mission Drops completed at `1791606773537`. Focus trace
contained discovery reads and no foreground-permission lookup. Native map
tiles, panning, the active mission beacon and honest empty states worked.

### Limits and disposition

- All observed feeds were empty. Populated marker/preview replacement was not
  physically verified, and no public fixture was created to manufacture it.
  Distinct stale/fresh payload ordering is covered by controlled runtime tests.
- Because location was denied, the Locate/pan case was not run on the phone.
  The corresponding controlled runtime scenario passed and asserted only one
  GPS call. No permission settings were changed to force that path.
- Runtime scenarios use a controlled hook/native bridge, not a full React
  renderer or real GPS/authentication session. Physical refocus coverage uses
  the compose introduction, not every route or OS lifecycle transition.
- Request generations discard outdated completions; they do not cancel work
  already issued to the server or OS. No broader lifecycle/provider change was
  introduced.
- The inherited Phase 1E pending-pan search-action defect is resolved by the
  existing Phase 1F implementation and was physically verified above. Previous
  phase reports remain historical records.
- PR #5 was not merged or otherwise mutated. Its web page could not be fetched
  through the browser (cache miss); Git feature-branch access succeeded.

# Explore Phase 1D — World navigation-focus lifecycle

## Why

Expo Router can retain the World screen while other routes are presented. Phase 1C invalidated in-flight discovery only on component unmount. A retained screen could therefore complete old requests while blurred, then show expired or blocked content on return without a fresh read.

The existing `AccountScope` already keys the entire `ClashProvider` subtree by the Supabase user ID, so account switches remount World and its local state. Preserve this behavior; do not add a second global auth subscription.

## Changes

- Use navigation `useFocusEffect` to bootstrap on first focus and refresh the currently selected World filter on subsequent focus.
- Invalidate both feed and mission metadata generations on blur or unmount.
- Refresh mission metadata independently; preserve the map viewport and selected discovery mode.
- Clear stale Drops and preview on return while fresh results load.
- Clear the prior one-shot viewer dot on return. No location read or permission prompt occurs during focus refresh.
- No new SQL, native dependency, or hosted migration.

## Local validation required

```sh
node scripts/world-consent-check.cjs
node scripts/world-request-order-check.cjs
node scripts/world-discovery-runtime-check.cjs
npx tsc --noEmit
npm run test:unit
npx expo-doctor
```

Device checks on Samsung A50:

1. Open World for the first time: Recent loads without a location permission prompt.
2. Select Map area or Missions, navigate to a detail/Explore and return: same filter and viewport remain, fresh data loads.
3. Start a slow nearby request, leave World before it finishes, then return: old result never overwrites new result.
4. Locate (only if already granted; do not change permission state), leave and return: previous one-shot dot is gone, and no GPS call happens on focus.
5. Switch accounts/sign out: verify the existing AccountScope remounts screen state and no previous account's preview or results remain.
6. Verify mission card, map markers, navigation, empty/loading/error states.

The original branch harness modeled mount/unmount and request races only. The local validation below extends it with separate navigation focus/blur transitions. Physical observations are reported separately. No public fixtures or permission changes were needed.

## Local validation — 2026-10-09

Safely fetched and switched from Phase 1C to remote Phase 1D baseline
`5f39d237d0bb607fd44c97d5a335c77b61739e05`. The six pre-existing modified
Crew/development files and all unrelated untracked files remain untouched and
excluded. No stash, discard, database reset, hosted deployment, app-data clear,
native dependency installation, Android rebuild or PR merge was performed.

### Confirmed regressions and corrections

- The consent source check initially failed because its extraction boundary
  still expected the removed mount effect. Updated that boundary, preserved all
  seven assertions, and added a no-location-on-refocus assertion.
- Physical navigation revealed a redundant **Search this area** action after
  refocus had already fetched the current viewport. Added a runtime assertion
  that failed with exit 1 after the first 21 scenarios passed. On a successful
  current focus refresh, World now updates `queryOrigin` and recalculates the
  action against the latest viewport. A pan made during the refresh still keeps
  the action available. No filter, location consent or backend contract changed.
- Corrected the request-order script's literal `\\n` output to a newline;
  all 21 existing assertions remain intact.

The runtime hook bridge now distinguishes ordinary effects from navigation
focus callbacks and can blur/refocus a retained instance. State setters capture
their own instance. All original 11 scenarios remain, plus 12 scenarios covering
selected Map area/Missions and viewport preservation, independent mission-card
refresh, stale results/errors on blur, filter changes during refresh, startup
interruption, pending permission/GPS results, one-shot indicator clearing, the
query-origin correction and panning during refresh. The actual AccountScope is
loaded with controlled auth/provider dependencies: its identity keys are checked,
and the keyed remount is simulated with a new screen instance. This is not an
end-to-end Supabase sign-in test or a full React renderer.

### Final automated results

| Command | Actual result |
| --- | --- |
| `node scripts/world-consent-check.cjs` | Exit 0; 8 checks passed |
| `node scripts/world-request-order-check.cjs` | Exit 0; 21 checks passed |
| `node scripts/world-discovery-runtime-check.cjs` | Exit 0; 23 scenarios passed |
| `npx tsc --noEmit` | Exit 0, rerun after the screen correction |
| `npm run test:unit` / identical configured script command on final rerun | Exit 0; 466 tests, 119 suites, zero failed/cancelled/skipped |
| `npx expo-doctor` | Exit 0; 18/18 checks passed |

The initial consent failure and added query-origin regression failure were
corrected; no final automated failure remains. No database tests were requested
or run for this client-only checkpoint. No SQL or database records were changed.

### Physical Samsung A50 results

Used `RZ8M30DE9NL` (`SM_A505F`), existing `com.clash.v2` development build,
Metro 8081 and local Supabase 55321. Both ADB reverse forwards were active.
Reloaded the current JavaScript, including the final screen correction.

- **Entry:** World displayed Recent, the real Goa After Dark mission card and
  an empty discovery state without a location permission dialog.
- **Retained Map area:** selected Map area, manually panned, tapped the existing
  Create World Drop button to open the compose introduction, then used Back.
  The World route remained underneath; selected Map area and the panned viewport
  persisted. Genuine mission and nearby reads started again on return. No
  Continue/publish action was taken. The redundant area-search action was seen
  before the correction and absent after the corrected refresh.
- **Retained Missions:** repeated compose introduction → Back with Missions
  selected. The selected mode, real mission card and empty state recovered, and
  fresh mission metadata and mission-Drop reads were observed.
- **Delayed blur/refocus:** temporary Hermes diagnostics delayed genuine read
  responses without changing payloads. Final race trace recorded nearby call 1
  starting at `1791564607046`, a new focus read starting at `1791564609293`,
  new call 2 completing at `1791564611034`, and old call 1 completing last at
  `1791564616261`. World remained in Map area without a crash or stuck loader.
  These feeds were empty; distinct populated old/new content replacement is
  proved by the controlled runtime test, not by this empty-feed screenshot.
- **No automatic location:** observed focus traces contained discovery reads,
  with no foreground-permission lookup. Fine/coarse location grants remained
  denied with their existing USER_FIXED state. No Locate, GPS, OS permission
  prompt, grant or revoke was performed in this checkpoint. Prior one-shot dot
  clearing and late GPS rejection were simulated only.
- **Accounts:** inspected the existing identity-keyed AccountScope and tested
  its keys plus simulated screen remounts. Physical sign-out/account switching
  was not attempted: a verified restoration credential/session was not available
  within this checkpoint, so the existing logged-in device session was preserved.

All temporary service wrappers were restored after the races. Device-only
diagnostic helpers remain ignored under `.expo/android-startup-check` and are
excluded from the commit. No fake activity or public test records were created.

### Remaining limits

Physical observations cover retained navigation through the compose introduction,
not every route or OS background/foreground lifecycle. Populated markers,
previews and private cross-account data were not available for device verification.
The controlled hook bridge uses synthetic process-local payloads and simplified
map movement; it does not replace native rendering or real auth sessions.
Request invalidation discards stale completions but does not cancel network or
OS work. Existing AccountScope remains the isolation mechanism; no additional
auth subscription or new feature was introduced. PR #3 is left unmerged.

## Release boundaries

Draft PR only until Codex reports local validation. Preserve unrelated dirty Crew files. No DB reset, hosted deployment, permission changes, or native rebuild.

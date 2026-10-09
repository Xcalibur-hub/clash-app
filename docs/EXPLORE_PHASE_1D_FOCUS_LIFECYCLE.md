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

Runtime harness currently models mount/unmount and request races, **not navigation focus/blur transitions**. Extend controlled tests for focus/blur where feasible; physical observations must be reported separately. Avoid creating public fixtures or modifying permissions solely to satisfy tests.

## Release boundaries

Draft PR only until Codex reports local validation. Preserve unrelated dirty Crew files. No DB reset, hosted deployment, permission changes, or native rebuild.

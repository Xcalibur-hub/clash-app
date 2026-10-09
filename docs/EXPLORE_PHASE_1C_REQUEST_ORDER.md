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

**GitHub-only implementation:** runtime tests and Android scenarios have not
been executed in this checkpoint. The new source-contract test checks
structure, not actual asynchronous timing. No SQL migrations are added.

## Follow-up

After validation, evaluate World/Explore navigation and auth-account-switch
lifecycle, then scoped map-provider research (OSM/MapLibre and Mapillary) before
any native dependency change. Preserve local Crew work and avoid hosted
deployment without a separate release review.

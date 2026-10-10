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

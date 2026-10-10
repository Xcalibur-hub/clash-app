# Explore Phase 1G Step 3 — isolated MapLibre route inside CLASH

**Unvalidated implementation. Do not merge or roll out.**

- Branch: `feat/explore-1g-dev-maplibre-route`
- Dev-only Android route: `/world/maplibre-lab`, not linked in World navigation.
- No World screen switch and no changes to existing Maps marker handling, filters, Supabase or location access.
- Resolved MapLibre 11.5.0 was previously proven in a **separate** Expo 54 / RN 0.81.5 standalone A50 prototype. That result does NOT validate this full CLASH native app.
- This branch declares the MapLibre dependency in root `package.json` and enables its Expo config plugin in `APP_VARIANT=development`. A **new Android build is required** to test the route. Simply reloading Metro into the old native CLASH build is insufficient.
- The demo style is developer-only and its credits are incomplete; production map selection remains blocked.
- IMPORTANT: React Native autolinking can still include installed native dependencies in non-development builds, even when an Expo plugin is conditional. The route uses a static import. **Do not merge this experiment** until release-binary native packaging/isolation has been reviewed. Reverting this branch is the default rollback.

## Validation for Codex

1. Safely fetch the branch into a separate **short-path worktree**, leaving all dirty Crew and prototype files untouched.
2. Inspect Android native plugin and React Native autolinking; evaluate whether adding MapLibre in the root affects `com.clash.v2` production.
3. Install dependencies in worktree only, refreshing the local lockfile if required. Never modify a production checkout's lockfile or dismiss package integrity errors.
4. Run `npx tsc --noEmit`, `npm run test:unit`, `npx expo-doctor`, and consent/request/pan runtime checks.
5. Build an **APP_VARIANT=development** CLASH app, preserving production `com.clash.v2`. Validate route on Samsung A50 with the correct package ID `com.clash.v2.dev`, including MapLibre native loading, panning/zooming, camera events, Back navigation and background/foreground. Note root native dependency interactions, memory and warnings.
6. Verify normal World in the same dev build remains unchanged, including no GPS on entry, empty mode states, Search this area, mission navigation and request ordering. Do not infer populated marker parity from empty results.
7. Run security/release autolinking assessment. If MapLibre leaks into non-development builds or release identity, stop before any merge and report a safe architectural fix.
8. Report failures accurately. Do not clear installed CLASH data, alter location permissions, run Supabase resets, deploy hosted schemas, overwrite dirty Crew files, or merge the PR.

## Important limits

This is a **native integration spike** only, not the provider-switch feature, marker parity, a production basemap or Mapillary street view. The route does not load live Drops and does not request device location.

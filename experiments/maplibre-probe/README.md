# CLASH World — isolated MapLibre native probe

**Status: experimental prototype; not part of the CLASH production app.**

This is a **standalone Expo development app** with package identity `com.clash.mapprobe`. It is not imported by the root CLASH bundle. Root dependencies, app config, World UI, Docker and Supabase stay unchanged.

Uses Expo SDK 54 + React Native 0.81.5 + React 19.1.0, matching the root application, and MapLibre v11 (`@maplibre/maplibre-react-native`).

## Step 4–6 scope — markers, clusters, preview, performance, stability

Synthetic Goa Drops drive:

- Grid + hierarchical clustering (probe-local; no new native deps)
- Dataset sizes 50 / 250 / 1_000 / 5_000 with viewport filtering
- **Default:** MapLibre GeoJSON circle/symbol layers for all sizes (direct hit-testing)
- Optional RN Marker chrome (visual only — blocks hits on A50 when enabled)
- Cluster tap → ease camera; compact Drop preview; empty-map dismiss
- On-screen timing + `Last hit` label; `npm run device:profile` for gfxinfo/meminfo

See `docs/PERFORMANCE_AND_TILES.md` and `docs/STABILITY_AND_INTERACTIONS.md`.

Uses https://demotiles.maplibre.org/style.json **only for the development probe**. No production SLA. No Mapillary, location permission, GPS, tracking, Supabase, or live World data.

## Local Android test

1. Keep the existing CLASH working tree and uncommitted Crew files intact. Use a separate Git worktree.
2. From `experiments/maplibre-probe`, run `npm install`, then `npm test` and `npm run typecheck`.
3. Connect Samsung A50 by USB (`adb devices`). Prefer Metro reload into the existing `com.clash.mapprobe` build on port **8082** (`npm start`) when only JS changed. Rebuild with `npm run android` only when native deps change — and request authorization first if policy requires it.
4. Verify map load, pan/pinch zoom, cluster counts, cluster expansion, Drop selection/preview, Close, background/foreground. Confirm no location permission prompts.
5. Report package identity, MapLibre version, observations, and errors. Do not describe unexecuted tests as passing.

## Safety and cleanup

- Do **not** install MapLibre into the root CLASH app, merge PR #7, reset Supabase, delete Docker volumes, clear CLASH app data, or overwrite `com.clash.v2` / `com.clash.v2.dev`.
- Rollback: stop probe Metro and optionally uninstall only `com.clash.mapprobe`.

## Scripts

```bash
npm test
npm run typecheck
npm run bench:cluster
npm run device:profile -- --label run1
npm start          # Metro :8082
npm run android    # native rebuild for com.clash.mapprobe only (needs auth)
```

# CLASH World — isolated MapLibre native probe

**Status: unvalidated implementation; not part of the CLASH production app.**

This is a **standalone Expo development app** with its own package identity `com.clash.mapprobe`. It is not imported by the root CLASH bundle. Root dependencies, app config, World UI, Docker and Supabase are unchanged.

Uses Expo SDK 54 + React Native 0.81.5 + React 19.1.0, matching the root application, and requests MapLibre v11. **Exact resolved package/plugin version, dependency tree and native Android compatibility are not yet verified.** No lockfile is provided; create one only inside this directory during local installation. The upstream MapLibre v11 docs currently specify RN >=0.80, New Architecture and Android API >=23.

## Local Android test

1. Keep existing CLASH working tree and uncommitted Crew files intact. Do not check out this branch in-place if it conflicts with local changes. Use a separate Git worktree or isolated checkout to test.
2. From `experiments/maplibre-probe`, run `npm install`, then `npx expo-doctor` to inspect the resolved dependency tree. If the plugin cannot resolve or Doctor reports incompatible versions, **stop and report**, rather than modifying the root CLASH app.
3. Connect Samsung A50 by USB; check `adb devices`. Run `npm run android` inside this directory. This triggers a new Android native build **only for `com.clash.mapprobe`**. Keep port 8082 available; root CLASH Metro normally runs on 8081.
4. Verify native startup, network tile loading, attribution/logo, camera pan/zoom, camera event counter and viewport coordinates; background/foreground and Android back navigation; inspect crash/renderer logs.
5. Report actual installed package identity, resolved MapLibre version, Metro/Gradle result, test observations, temperature/performance, and errors. Do not describe unexecuted tests as passing.

Uses https://demotiles.maplibre.org/style.json **only for the development probe**. It has no production SLA or permission to treat it as free commercial tile hosting. No Mapillary viewer, location permission, GPS, tracking, Supabase connection, or live World data is included. The probe does not validate the full World/Drop/cluster migration.

## Safety and cleanup

- Do **not** run `npx expo prebuild --clean` in root CLASH, reset Supabase, delete Docker volumes, grant location permission, clear CLASH app data, change hosted credentials, or install the probe over the `com.clash.v2` app.
- Do not merge the probe branch to `main` without Samsung A50 native checks and dependency review.
- For rollback, stop its own Metro and uninstall only `com.clash.mapprobe` if desired; leave `com.clash.v2` / `com.clash.v2.dev` alone.

References: https://maplibre.org/maplibre-react-native/docs/setup/expo/ and https://maplibre.org/maplibre-react-native/docs/components/map/ and https://maplibre.org/maplibre-react-native/docs/components/camera/.

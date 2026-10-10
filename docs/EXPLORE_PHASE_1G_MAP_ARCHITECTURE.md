# Explore Phase 1G — MapLibre / OpenStreetMap / Mapillary architecture decision

Status: **research only / no runtime changes**. Phase 1F is merged. This document proposes an incremental, reversible migration; it does **not** assert native-device compatibility or vendor pricing has been verified.

## Decision

**Proceed with a separate native proof-of-concept, not an immediate World map replacement.**

- **Map rendering:** Evaluate `@maplibre/maplibre-react-native` (MapLibre Native). It is not an Expo Go package and needs an Expo config plugin and **new Android/iOS native development builds**. Official setup: https://maplibre.org/maplibre-react-native/docs/setup/expo/
- **Map data/style:** OpenStreetMap-derived vector tiles from a contracted tile provider, or self-hosted infrastructure if justified. MapLibre is the renderer, **not a free hosted map-tile service**. The MapLibre demo style is development-only. Official requirements: https://maplibre.org/maplibre-react-native/docs/setup/getting-started/
- **Street-level imagery:** Evaluate Mapillary separately as an **explicit opt-in street-view surface**, not a mandatory dependency of opening World. MapillaryJS is a browser-based viewer requiring a client access token for platform data; embedding in React Native would require an evaluated WebView or another integration. No token, viewer package, or WebView added in this phase. Official docs: https://mapillary.github.io/mapillary-js/docs/intro/try/
- **Fallback:** Keep the existing `react-native-maps` World implementation available until a replacement passes parity testing. Do not silently switch users.

## Current CLASH baseline (reviewed from main)

- Expo SDK ~54, React Native 0.81.5, `newArchEnabled: true`, `react-native-maps: 1.20.1`.
- `app/world/index.tsx` renders `MapView` using Google on Android and platform default on iOS. It uses `initialRegion`, `onRegionChangeComplete`, `animateToRegion`, `onPress`, custom markers, and `moveOnMarkerPress={false}`.
- `components/world/WorldDropMarker.tsx` uses `react-native-maps` `Marker` with React Native media views, selected-state sizing, accessibility labels, custom anchor, and Android `tracksViewChanges` behavior.
- `utils/worldCluster.ts` clusters independently of map package and computes `regionMovedSignificantly`. This pure module should remain reusable.
- Existing discovery controls depend on precise query-origin/camera comparison, request-generation stale-response rejection, focus refresh, and **no location request on World entry**. These behaviors are migration invariants.
- `app.config.ts` currently supplies Google Maps API key configuration for existing native builds. Do not remove until the provider is retired and rollback is no longer required.

## Migration seam (proposal, not implemented)

1. Extract provider-independent camera region, marker selection, and event semantics into a small `WorldMapSurface` contract. Keep `latitude`, `longitude`, `latitudeDelta`, `longitudeDelta` semantics at the World screen boundary.
2. Preserve `clusterWorldDrops` and existing read-only World services. Translate MapLibre camera bounds to the region contract in a dedicated adapter; test latitude/longitude ordering, antimeridian, zoom, animated camera moves, and event timing.
3. Render a standalone **dev-only** MapLibre probe first, using a development-appropriate style. Verify Android physical-device startup, gestures, tiles, memory, performance, and Android back behavior; separately validate iOS in an iOS native build before any iOS rollout.
4. Port custom Drop/cluster markers with equivalent selection, image, accessibility, and tap handling. MapLibre annotations/layers have different semantics from `react-native-maps` `Marker`; **do not assume existing marker JSX is portable**.
5. Add explicit feature gating and rollback. Default remains the existing provider until native and functional parity gates pass.
6. Independently prototype Mapillary street imagery, with explicit tap to load, nearby coverage/availability checks, visible attribution, error/offline states, and a return path to World. If coverage is absent, do not imply street view exists.
7. Remove Google provider/key integration only in a later dedicated cleanup after parity, legal review, and production rollout.

## Service, licensing and privacy gates

- **Never point a scaled commercial production app at the community OSM tile servers by default.** OSM's free geographic data is distinct from its donation-funded tile infrastructure. Public tile endpoints have attribution, caching, identification and no-bulk-download rules, and no availability SLA: https://operations.osmfoundation.org/policies/tiles/
- Select a production tile/style provider after reviewing price, quota, cache/offline terms, commercial rights, uptime, global coverage, and attribution. No price or free-tier claim is locked in here.
- Display `© OpenStreetMap contributors` and any tile/style provider attribution where required. Review the ODbL obligations of OSM-derived data and separate licenses for style assets.
- Mapillary imagery has its own attribution/license requirements; image availability and street coverage vary. Review API/client token, quota, allowed embedding, derivative use, user privacy, and moderation before launch: https://help.mapillary.com/hc/en-us/articles/115001770409-CC-BY-SA-license-for-open-data
- **No implicit GPS, background tracking, precise-user-location storage, or unprompted street-image requests.** A user's panned viewport is not their device location. Avoid sending private Drop coordinates to map/imagery services beyond necessary public approximate map context.
- No client-embedded private provider secrets. Public client tokens must be scoped and restricted where provider supports it; privileged access stays server-side.

## Phase 1G acceptance gates

**Research gate (this PR):** documented baseline, proposed provider boundary, dependency/rebuild implications, tile licensing, privacy, staged rollout, and test plan. No native install, schema migration, hosted deployment, or app change.

**Prototype gate (future PR):** on a separate branch, with user authorization for native rebuild, test a dev-only MapLibre surface on Samsung A50 without replacing World; check startup, map tile load, panning, zoom, memory, navigation, and crash logs. iOS needs its own native validation. Confirm MapLibre package version against Expo 54 and Android minSdk in the actual build.

**Parity gate (future PR):** 8 consent checks, 21 request-order checks, 13 empty-discovery checks, 8 pan assertions, 35 runtime scenarios, TypeScript, unit tests, Expo Doctor, plus new adapter tests; physical permission-free entry, Map area / Recent / Missions, Search this area during in-flight fetch, cluster taps, Drop preview, refocus, Locate only when previously granted, and no stuck loaders. Do not claim populated-marker evidence without genuine data or safe local fixtures.

**Mapillary gate (future PR):** confirm API rights/token scope and street imagery availability, then test explicit opt-in street viewer on a device, graceful no-coverage state, attribution, privacy, network failures, and accessibility.

## Non-goals and safety

No changes to `package.json`, native projects, Expo config, app screens, database, credentials, Google key, permissions, or production map service in Phase 1G research. Do not reset Supabase/Docker, clear app data, modify unrelated dirty Crew files, or deploy hosted changes. Keep this PR draft until the user approves the next implementation step.

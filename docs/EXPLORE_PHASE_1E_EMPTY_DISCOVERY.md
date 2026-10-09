# Explore Phase 1E — World empty discovery

## Objective

World currently has no recent public Drops in the local test dataset. Empty discovery should be useful without pretending there are nearby people, posts, or activity.

## Implementation

- Distinct empty-state copy for Recent, Map area, and Missions.
- Recent suggests browsing the current map viewport. Map area and Missions suggest Recent.
- A secondary Join Mission action appears only when an actual active Mission was returned. It uses the existing authenticated compose route.
- During a pending filter, map-area or Locate query, clear the prior mode's markers and preview; hide the empty state until the latest request completes.
- Keep the existing mission beacon, marker components, privacy-safe approximate coordinates, and permission-free entry.
- No new dependencies, map provider changes, SQL, or hosted deployment.

## Validation required

```sh
node scripts/world-consent-check.cjs
node scripts/world-request-order-check.cjs
node scripts/world-empty-discovery-check.cjs
node scripts/world-discovery-runtime-check.cjs
npx tsc --noEmit
npm run test:unit
npx expo-doctor
```

On Samsung A50, verify all three empty modes using genuine data; check CTAs, rapid mode switching, loading behavior, permission-free entry, map panning, mission beacon, and no stale markers during slow responses. If no public Drops exist, do **not** create public fixtures just to force populated screenshots. Report populated-marker paths as unverified.

## Map provider investigation — separate decision, no migration yet

Existing World uses `react-native-maps` with Google provider on Android and default provider on iOS. Explore's country-level canvas is a separate component; do not confuse it with the World street map.

Before considering OSM/MapLibre and Mapillary, collect and verify:
- Expo dev-build/native configuration and maintenance costs for MapLibre React Native in this project's SDK.
- Actual basemap tile hosting terms, attribution, caching limits, request volume and budget. OpenStreetMap data does **not** imply unlimited free production tile hosting.
- Whether Mapillary's current imagery APIs, licensing, coverage and authentication permit the intended street-view experience; do not promise coverage.
- Privacy implications of requesting tiles/imagery, coarse map positions, and street-level images.
- Android Samsung A50 performance and iOS parity, map marker/cluster parity, offline behavior, and accessibility.
- A rollback strategy retaining the existing provider until a separately validated prototype proves equivalent behavior.

This phase deliberately ships only empty-discovery improvements. Do not add MapLibre or Mapillary SDKs or keys in this PR.

## Boundaries

Draft until local and device validation. Preserve unrelated Crew files; no database reset, hosted migration, native rebuild or app-data clearing unless separately approved.

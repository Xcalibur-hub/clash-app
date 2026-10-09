# Explore Phase 1B — World privacy checkpoint

Branch: `feat/explore-1b-world-privacy` (based on Phase 1A commit `4c27a45`).

## Discovery correction

The project **already includes** a native street-level World map at `app/world/index.tsx`,
`react-native-maps`, one-shot `expo-location`, geospatial PostGIS RPCs,
World Drops and Missions. Explore's SVG country globe is a **separate** global
navigation surface. Do not rebuild either.

## Changes in this checkpoint

1. World entry defaults to Recent and does **not** request foreground location
   permission or fetch the device's coordinates. Only an explicit tap on the
   locate button can request a one-shot location fix.
2. The original `world_drops` SELECT RLS policy permitted published rows even
   when the caller blocked/muted the author. A restrictive policy now applies
   a caller-scoped public visibility predicate, while preserving own/staff
   management access.
3. `world_drop_readable(id)` checks publication, expiry, removal, public-ready
   media and block/mute relationships. It derives the viewer from the session;
   it does not accept a spoofable viewer parameter.
4. `world_nearby`, `world_recent`, `world_mission_drops`, and
   `world_drop_view` now apply that predicate inside SECURITY DEFINER queries,
   which bypass ordinary RLS.
5. SQL regression `083_world_read_security.sql` checks raw reads, public
   access, blocked authors, revoked media visibility and author access.
6. `node scripts/world-consent-check.cjs` guards the World entrypoint against
   accidental automatic location reads.

## Privacy boundaries

World Drops still store **approximate** cell centres, not exact GPS. The
original `world_fuzz_location` snaps coordinates to a 0.005° grid. This
checkpoint does not change that scheme. It does not guarantee anonymity:
repeated posts, photo contents and geographic sparsity can still reveal a
creator's approximate location.

A foreground permission previously granted at the OS level does not cause
World to automatically query the user's position on opening the map.

## Verification needed before merging

Run on the isolated branch with a local Supabase stack:

- `node scripts/world-consent-check.cjs`
- `npm run typecheck`
- `npm run test:unit`
- `npm run supabase:test` (includes 083 and existing World tests)
- `npx expo-doctor`
- Android A50: open World with permission undetermined; confirm no prompt,
  Recent feed, explicit locate prompt, denied-permission fallback, Search this
  area, map markers and mission filters.
- Two accounts: block/mute a creator and verify their published World Drops are
  absent from the map, detail RPC and raw table SELECT.
- Revoke media readiness/visibility and verify the same public exclusion.

**No local SQL, TypeScript or physical Android tests have been run by this
GitHub-only implementation session.** The SQL migration requires local
application and pgTAP verification. Do not deploy it to hosted Supabase until
validated. Preserve unrelated dirty Crew files and never reset the user's
existing Supabase data.

## Next milestone

After tests pass: evaluate World map provider strategy (Google vs OSM/MapLibre),
Mapillary licensing/coverage, map-based Play/treasure overlays and additional
privacy protections against sparse-area inference. Avoid duplicating the
existing World Drop and Mission engines.

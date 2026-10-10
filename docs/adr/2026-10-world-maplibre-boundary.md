# ADR: World map provider boundary and MapLibre adoption path

**Status:** Accepted (Step 7 design)  
**Date:** 2026-10-10  
**Context:** Phase 1G — prepare CLASH World for MapLibre without destabilizing production

## Decision

1. Keep **orchestration** (discovery RPCs, consent, tabs, preview, navigation) in World screen / SDK-free hooks.
2. Introduce a **thin `WorldMapSurface` React facade** with a Google implementation first; MapLibre implementation later behind explicit authorization.
3. Extend **`utils/worldMapAdapter.ts`** as the SDK-free contract (camera, coordinates, interactions, attribution, readiness) — not a large provider framework.
4. Prefer **isolated prototype (`experiments/maplibre-probe`)** until release autolinking/binary gates pass; then add MapLibre **intentionally** as the World map engine (Option B), not via PR #7’s gated-plugin approach.
5. Production MapLibre rendering should default to **GeoJSON layers** for hit-testing; avoid interactive RN Markers given A50 evidence.

## Consequences

- Step 8 can extract the Google surface and harden the adapter **without** root MapLibre.
- Dual Google+MapLibre native stacks are temporary at most; long-term prefer one engine for World.
- Tile vendor selection remains a product/legal gate independent of the adapter.

## Rejected alternatives

| Alternative | Why rejected |
| --- | --- |
| Merge PR #7 “dev-only” MapLibre in root | RN autolinking + static imports leaked into non-dev packaging; lockfile risk |
| Big-bang rewrite of `app/world/index.tsx` onto MapLibre | High regression risk across consent, pan-fetch, empty modes |
| Heavy DI / multi-hook map framework | Unnecessary with a single World consumer |
| RN Markers as primary hit targets on MapLibre | Prototype showed touch interception blocking GeoJSON selection |
| OSMF public tiles or free-tier-only basemap | Policy / commercial limits unsuitable for production |
| New bbox migrations solely for MapLibre | Nearby already center+radius; no MapLibre-driven schema need |

## References

- `docs/EXPLORE_PHASE_1G_WORLD_INTEGRATION_ARCHITECTURE.md`
- `utils/worldMapAdapter.ts` (PR #6)
- `experiments/maplibre-probe/docs/STABILITY_AND_INTERACTIONS.md` (PR #10)
- `experiments/maplibre-probe/docs/PERFORMANCE_AND_TILES.md` (PR #9)

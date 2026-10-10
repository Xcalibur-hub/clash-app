# Explore Phase 1G — World MapLibre integration architecture

**Status:** design / documentation only (Step 7)  
**Date:** 10 October 2026  
**Baseline:** `main` @ `eccd521` (includes PR #6 `worldMapAdapter`)  
**Scope:** prepare a safe, maintainable MapLibre path for CLASH World  
**Non-goals:** do **not** integrate MapLibre into the root app in this step; do **not** merge PRs #7–#10; do **not** change dependencies, rebuild Android, reset Supabase/Docker, or alter location permissions

**Companion ADR:** [`docs/adr/2026-10-world-maplibre-boundary.md`](./adr/2026-10-world-maplibre-boundary.md)

**Evidence sources:**

- Production World: `app/world/index.tsx`, `utils/worldMapAdapter.ts`, `utils/worldCluster.ts`, `services/worldService.ts`, `services/locationService.ts`, World components/scripts (this worktree)
- Prototype: `experiments/maplibre-probe` Steps 4–6 (PRs #8–#10), especially `docs/PERFORMANCE_AND_TILES.md` and `docs/STABILITY_AND_INTERACTIONS.md`
- Blocked isolation attempt: PR #7 `docs/EXPLORE_PHASE_1G_DEV_MAPLIBRE_ROUTE.md`

---

## 1. Executive decision

**Recommend Option A → controlled Option B:**

1. **Keep MapLibre out of the production CLASH binary** until merge gates in §5 pass.
2. **Continue the isolated `experiments/maplibre-probe` / `com.clash.mapprobe` track** for renderer, hit-testing, and basemap experiments (supersedes PR #7 as the isolation vehicle).
3. **On `main`, deepen the provider boundary around the existing World screen** (pure TS + thin React surface) **without** adding `@maplibre/maplibre-react-native` yet.
4. **When authorized for production dependency,** add MapLibre **intentionally** as the sole street-map provider for World (prefer **not** shipping dual Google + MapLibre native stacks long-term), after release-binary autolink verification.
5. **Production rendering default:** MapLibre **GeoJSON sources/layers** for Drop/cluster hit-testing; treat React Native `Marker` chrome as non-default (A50 evidence: Markers intercept touches).
6. **Data path unchanged:** keep `worldService` RPCs, fuzzed `approxLat`/`approxLng`, opt-in Locate, and existing RLS — no new migrations for MapLibre.

**Rejected for near-term:**

- Merging PR #7 (autolink / bundle leak into non-dev builds).
- Dual-provider production apps (Google + MapLibre) without a concrete multi-map product need.
- Treating Expo plugin gates or dynamic `import()` alone as isolation proof.
- Assuming probe GeoJSON/cluster behavior works unchanged against live Supabase feeds.

---

## 2. Current architecture findings

### 2.1 Production data flow

```
Supabase SECURITY DEFINER RPCs
  world_recent / world_nearby / world_mission_drops / world_drop_view / …
        ↓
services/worldService.ts   (typed WorldDrop; screens do not touch tables)
        ↓
app/world/index.tsx  WorldScreen
  loadDropsFor(mode, centre) → drops[]
  clusterWorldDrops(drops, region) → WorldMapItem[]
        ↓
react-native-maps MapView  (Android PROVIDER_GOOGLE / iOS PROVIDER_DEFAULT)
  WorldDropMarker / WorldClusterMarker
  WorldDropPreview
  optional Circle after Locate (never showsUserLocation)
```

### 2.2 Provider boundary today

`utils/worldMapAdapter.ts` (PR #6) is a **pure TypeScript** contract:

- `WorldCameraRegion` / `WorldCoordinate`
- `toMapLibreCoordinate` / `fromMapLibreCoordinate` (`[lng, lat]`)
- `viewportRequiresSearch` → `regionMovedSignificantly`
- `WorldMapInteraction` union
- `WorldMapSurfaceContract` (`initialRegion`, `onInteraction`, `animateToRegion`)

**Not wired into the live screen.** The screen still imports `MapView`, `Circle`, `PROVIDER_*`, and marker components that import `Marker` from `react-native-maps`.

### 2.3 Discovery semantics (important for MapLibre)

| Mode | Query | Camera coupling |
| --- | --- | --- |
| **Recent** | `world_recent` — no GPS | Independent of user location |
| **Map area (nearby)** | `world_nearby(lat, lng, radiusKm)` — **center + radius**, not client bbox | Uses **map camera center** as query point (may be Goa fallback or Locate fix) |
| **Missions** | missions list + `world_mission_drops` | Beacon/list UX; not a GPS stream |

Server clamps radius (1–50 km). Cards expose fuzzed coords rounded to 4 decimals. Viewer origin for nearby is **not** persisted.

### 2.4 Privacy invariants (must preserve)

From `locationService`, World screen comments, and `scripts/world-consent-check.cjs`:

1. Opening World must **not** request GPS or read location.
2. Default tab is **Recent**; `locationDenied` starts true until explicit Locate.
3. Only **Locate** (`recenter`) and **compose publish** call permission / one-shot location.
4. `showsUserLocation={false}`, `showsMyLocationButton={false}`; optional `Circle` after Locate only; cleared on blur/refocus.
5. No continuous watch / background location on World.
6. Map pan must not silently activate GPS.
7. Public markers use approximate locations only.

Refresh is **`useFocusEffect` (navigation focus)**, not OS `AppState` foreground — preserve that distinction unless product explicitly changes it.

### 2.5 Supporting production files

| Area | Paths |
| --- | --- |
| Screen / routes | `app/world/index.tsx`, `_layout.tsx`, `compose.tsx`, `drop/[dropId].tsx` |
| Map UI | `components/world/WorldDropMarker.tsx`, `WorldDropPreview.tsx`, `WorldMissionBeacon.tsx`, `worldMapStyle.ts` |
| Utils | `utils/worldCluster.ts`, `utils/worldMapAdapter.ts`, `utils/worldDestinations.ts` |
| Services | `services/worldService.ts`, `services/locationService.ts` |
| Contract scripts | `scripts/world-consent-check.cjs`, `world-request-order-check.cjs`, `world-pan-request-check.cjs`, `world-empty-discovery-check.cjs`, `world-discovery-runtime-check.cjs` |
| Unit | `utils/worldMapAdapter.test.ts` (via `npm run test:unit`) |

Root deps today: Expo SDK **54**, RN **0.81.5**, React **19.1.0**, `react-native-maps` **1.20.1**, `expo-location` **~19.0.8**. **No MapLibre in root.**

---

## 3. Feature-parity matrix

Legend — Risk: **L** low · **M** medium · **H** high.  
Prototype column reflects `com.clash.mapprobe` Steps 4–6, **not** production data.

| # | Capability | Google Maps World (production) | MapLibre probe | Gap / required work | Risk | Acceptance test |
| --- | ---: | --- | --- | --- | --- | --- |
| 1 | Map load + style | Google custom style dark/light | Demo MapLibre style URL | Production vector style + theme parity | M | Cold start shows basemap & attribution within gate (§9) |
| 2 | Pan / pinch / camera idle | `onRegionChangeComplete`; centre updated before React state | `onRegionDidChange` + ignore windows | Port pan-during-fetch centre latch | M | `world-pan-request-check` + device pan race |
| 3 | Animate camera | `animateToRegion` timings (Locate 550 / cluster 420 / select 280) | `Camera.easeTo` / jump | Map surface `animateToRegion` adapter | L | Timing smoke on A50 + mid-tier iOS |
| 4 | Recent / Map area / Missions tabs | Full filter machine + request tokens | Absent | Keep screen logic; only swap map surface | L | `world-request-order-check` + runtime check |
| 5 | Search this area | Nearby + `regionMovedSignificantly` | Absent | Wire camera-idle → existing CTA; no auto-fetch | L | CTA appears only after significant move in Map area |
| 6 | Drop markers (media / video / mission) | Custom RN `Marker` + thumb + badges | Circles/labels; optional Marker chrome | GeoJSON styling + optional icon atlas; a11y list | H | Visual parity checklist; select correct Drop |
| 7 | Clustering | `clusterWorldDrops` grid | Grid + hierarchical; GeoJSON press | Reuse `worldCluster` first; evaluate native/SC later | M | Cluster counts match fixture; expand zooms |
| 8 | Cluster expand | Zoom to 45% deltas (min 0.02) | `clusterExpansionZoom` step +2 | Unify zoom policy in adapter | L | Tap cluster → zoom in; no selection loop |
| 9 | Direct feature selection | Marker `onPress` | GeoJSON `onPress` (works); RN Marker intercepts | **Default GeoJSON hit path** | H | Direct tap selects Drop; Sample control not required |
| 10 | Preview sheet | `WorldDropPreview` + camera bias | Probe preview | Keep preview; bias via adapter animate | L | Preview matches Drop; Close / map-tap dismiss |
| 11 | Map tap clears selection | `onPress` map | Empty-map dismiss | Dense maps: prefer Clear when empty pixel hard | L | Selection clears without refetch |
| 12 | Nearby query | Center + radius RPC | Synthetic only | MapLibre consumes same `fetchNearbyWorldDrops` | M | Live data + RLS; stale tokens discarded |
| 13 | Locate / consent | Opt-in one-shot; Circle | No GPS in probe | **No behavior change** | H | Consent script + manual: open World → no prompt |
| 14 | Focus refresh | `useFocusEffect` bootstrap/refocus | AppState HOME resume only in probe | Preserve focus semantics | M | Refocus clears viewer Circle; no silent GPS |
| 15 | Loading / empty / error | Overlay + empty modes + notices | Minimal probe UI | Keep World empty contracts | M | `world-empty-discovery-check` |
| 16 | Attribution | Google branding | MapLibre + demo incomplete | Paid provider attribution UI | M | Legal checklist before release |
| 17 | High density (1k–5k) | Not primary World path (limit ~40) | A50: GeoJSON + filter OK; PSS ~268–289 MB | Cap still via RPC limits; renderer ready if limits rise | M | Gate table §9 |
| 18 | Offline / tile outage | Google cache behavior | Demo tiles blank under airplane | Fallback style / retry / offline policy TBD | M | Airplane → recover; no crash |
| 19 | Accessibility | Marker a11y labels | GeoJSON hard for SR | Parallel list / announce selection | M | TalkBack/VoiceOver can open Drop |
| 20 | Release packaging | Google Maps in prod today | Probe-only package | **Isolation gates** before root MapLibre | H | Release APK has no MapLibre **until** intentional B |

---

## 4. Provider architecture

### 4.1 Shape: thin React surface + pure TS domain

**Most maintainable for CLASH:**

1. **Keep** pure helpers in `utils/worldMapAdapter.ts` / `utils/worldCluster.ts` (no SDK imports).
2. **Add** a small React **map surface** component API that WorldScreen owns orchestration against — not a mega “MapProvider context” unless multiple screens need maps.
3. **Avoid** parallel hook forests (`useMapCamera`, `useMapMarkers`, `useMapGestures`…) until a second consumer exists.

Orchestration (filters, RPCs, consent, preview, navigation) stays in `WorldScreen` (or a later `useWorldDiscovery` extracted without map SDK imports).

### 4.2 Proposed TypeScript interfaces (do not implement in Step 7)

```ts
// utils/worldMapAdapter.ts — extend existing types; still SDK-free

export type WorldCameraRegion = MapRegionLike;
export type WorldCoordinate = Readonly<{ latitude: number; longitude: number }>;
export type MapLibreCoordinate = readonly [longitude: number, latitude: number];

/** Viewport for UI + clustering; nearby RPC still uses center+radius. */
export type WorldViewport = WorldCameraRegion;

export type WorldMapReadyState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string; retryable: boolean };

export type WorldMapAttribution = Readonly<{
  /** Visible HTML/text lines required by tile + data licenses */
  lines: readonly string[];
  logoUrl?: string;
}>;

export type WorldMapFeature =
  | {
      kind: 'drop';
      id: string;
      coordinate: WorldCoordinate;
      drop: WorldDrop; // from worldService types
      selected: boolean;
    }
  | {
      kind: 'cluster';
      id: string;
      coordinate: WorldCoordinate;
      count: number;
      dropIds: readonly string[];
    };

export type WorldMapInteraction =
  | { kind: 'camera-idle'; region: WorldCameraRegion }
  | { kind: 'drop-selected'; dropId: string }
  | { kind: 'cluster-selected'; latitude: number; longitude: number; count: number }
  | { kind: 'map-tapped' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

export interface WorldMapSurfaceProps {
  initialRegion: WorldCameraRegion;
  features: readonly WorldMapFeature[];
  selectedDropId: string | null;
  /** Theme token → style URL / Google style elements resolved outside SDK-free utils */
  appearance: 'light' | 'dark';
  attribution: WorldMapAttribution;
  onInteraction: (interaction: WorldMapInteraction) => void;
  /** Imperative handle */
  // animateToRegion(region, durationMs): void
  // fitCoordinate?(coordinate, padding): void
}

export interface WorldMapSurfaceHandle {
  animateToRegion: (region: WorldCameraRegion, durationMs: number) => void;
}
```

**Coordinate rules:**

- Domain / RPCs / clustering: `{ latitude, longitude }`.
- MapLibre bridge only: `[longitude, latitude]` via existing converters.
- Never send precise private GPS as marker positions; markers always `approx*`.

### 4.3 File-by-file implementation plan (future steps — not this PR)

| Phase | File | Change |
| --- | --- | --- |
| Prep | `utils/worldMapAdapter.ts` | Extend types above; keep pure |
| Prep | `utils/worldMapAdapter.test.ts` | Cover new unions / converters |
| Prep | `utils/worldCluster.ts` | Optional hierarchical mode (port from probe) behind flag; default stay grid for parity |
| Prep | `components/world/WorldMapSurface.tsx` | **Facade** selecting Google impl |
| Prep | `components/world/google/GoogleWorldMapSurface.tsx` | Extract current `MapView` JSX from screen |
| Prep | `app/world/index.tsx` | Depend on `WorldMapSurface` only (still Google) |
| Probe | `experiments/maplibre-probe/**` | Continue basemap / icon / a11y experiments |
| Integrate (authorized) | `package.json` + lockfile | Add MapLibre **with** isolation gates green |
| Integrate | `components/world/maplibre/MapLibreWorldMapSurface.tsx` | GeoJSON layers + camera |
| Integrate | `app.config` / native project | Autolink policy; attribution; no location permission delta |
| Integrate | Feature flag / build flavor | Controlled rollout; rollback → Google surface |
| Validate | World scripts + device matrix | §9 gates |
| Cleanup | Remove Google from World **only after** rollback window | Prefer single native map stack |

---

## 5. Native dependency and release isolation

### 5.1 Why PR #7 failed isolation

Documented / observed:

- Declaring `@maplibre/maplibre-react-native` in **root** dependencies causes **React Native autolinking** to include native MapLibre in builds, even when an Expo config plugin is gated on `APP_VARIANT=development`.
- Static JS imports pull MapLibre into the production Metro graph.
- Root lockfile integrity / `npm ci` breakage when MapLibre is added inconsistently.
- Expo-modules autolinking ≠ RN autolinking — plugin gating alone is **insufficient**.

### 5.2 Options

| | A. Isolated prototype until selection | B. Intentional production dependency | C. Dev-only native+JS isolation |
| --- | --- | --- | --- |
| **Summary** | Keep MapLibre only in `experiments/maplibre-probe` | Add MapLibre to root when approved; World switches | Ship MapLibre in `com.clash.v2.dev` only |
| **Expo 54 / RN 0.81** | Proven in probe | Must re-verify in root app | Same as B for dev client |
| **Android** | Separate `com.clash.mapprobe` APK | Full release rebuild required | Dev client rebuild; release must **exclude** native lib |
| **iOS** | Probe/ios later | Pods + MapLibre XCFramework size | Same exclusion problem for App Store builds |
| **Autolinking** | N/A to prod | Accept inclusion; verify binary | Needs **proven** exclusion (not plugin-only) |
| **Metro** | Separate entry | Normal root bundle includes ML | Must tree-shake / split; static import forbidden in prod entry |
| **Lockfile** | Probe-local | Root lockfile updated deliberately | Root still lists dep → high risk |
| **Release risk** | **Lowest** | Medium (owned) | **Highest** if exclusion incomplete |
| **Maintenance** | Two apps briefly | One stack after cutover | Dual flavors forever |

**Recommendation:** **A now**; **B when gates pass**. Treat **C as research-only** unless binary inspection proves MapLibre absent from release APK/AAB and App Store builds.

### 5.3 Verifiable merge gates (before MapLibre on `main`)

1. **Root `package.json` / lockfile** change is intentional, reviewed, and `npm ci` clean.
2. **Autolinking inventory:** `npx react-native config` (or equivalent) lists MapLibre only when expected for that variant.
3. **Binary proof:** release AAB/APK string/symbol scan shows MapLibre **only** after Option B cutover — for Option C, release must show **absence**.
4. **Metro prod bundle** analysis: no MapLibre modules in production entry graph **until** cutover.
5. **World consent + request-order + pan + empty scripts** green on the integration branch.
6. **Device:** A50 + at least one recent iOS device pass §9 gates on **live** World data.
7. **No dual silent stack:** document whether Google Maps remains for non-World surfaces; World should not load both map engines on the critical path without product approval.

---

## 6. Production World data integration

MapLibre must be a **view** over existing RPCs — no new tables for basemap.

| Concern | Design |
| --- | --- |
| Bounding box | **Do not** invent bbox RPCs for v1. Keep center + `radiusKm` for Map area; derive centre from camera. |
| Lat/lng order | Domain lat/lng; convert at MapLibre boundary only. |
| Antimeridian | Current Goa-scale clustering is local; if World expands globally, document IDL bucket strategy before changing `worldCluster`. |
| Limits | Keep client limits (~40) unless product raises; renderer can handle more (probe 5k) but network/RLS still govern. |
| Cancellation | Preserve request-generation tokens (`discoveryRequest` / `missionRequest`); ignore stale responses. |
| Dedup | By Drop `id` when merging pages (if pagination added later). |
| Visibility / moderation | Unchanged RLS + `world_author_hidden` / status filters in RPCs. |
| Media | Existing signed/public URLs from card payload; map layer may use thumbnail URL or color fallback — no new storage. |
| Clustering | Client-side on fetched set (`worldCluster`); not server clusters in v1. |
| Search this area | Explicit user action → `fetchNearbyWorldDrops(cameraCentre)` — never on every pan. |
| Focus refresh | Existing `useFocusEffect` paths; do not add GPS reread. |

**Migrations:** none required for MapLibre view integration. Justify any future geo index/RPC change separately (e.g. true bbox search) with product evidence.

---

## 7. Location privacy

| Platform | Permission | World rule |
| --- | --- | --- |
| Android | `ACCESS_FINE_LOCATION` / coarse via Expo Location When-In-Use | Request only on Locate / compose publish |
| iOS | `NSLocationWhenInUseUsageDescription` (already via `expo-location` plugin) | Same; no Always |

**Hard requirements (unchanged):**

- Opening World ≠ permission prompt.
- Pan/zoom ≠ GPS activation.
- Denied location: Recent + Missions + Map area with fallback centre remain usable.
- Transmit coordinates only for explicit nearby search centre or publish; markers show fuzzed public points only.

No permission manifest changes in Step 7–8 prep without a dedicated privacy review.

---

## 8. Marker and clustering strategy

### 8.1 Evidence (A50 / Steps 4–6)

- RN `Marker` views **intercept touches** and blocked GeoJSON hit-testing.
- Direct **GeoJSON** Drop + cluster selection worked; cluster expand 11→13 verified.
- GeoJSON used successfully at 1k–5k; Step 6 defaulted GeoJSON for all sizes.
- TOTAL PSS ~**268–289 MB** across sizes at Goa z11 (viewport-filtered); not a universal guarantee.

### 8.2 Production recommendation

| Layer | Choice |
| --- | --- |
| Hit-testing / selection | **MapLibre GeoJSONSource + layers** (circles or symbol icons) |
| Visual chrome | Prefer **MapLibre symbol layers** with sprite/icon for image/video/mission/selected states |
| RN Marker overlays | **Avoid** for interactive World markers; optional non-interactive decorations only after hit-test proof |
| Clustering | **v1:** keep `clusterWorldDrops` (grid) for behavioral parity with Google World |
| Hierarchical / Supercluster | **v1.1** if in-viewport counts grow; MapLibre-native clustering only if it preserves Drop property payloads and expand UX |
| Accessibility | Maintain a **non-map list/rail** of visible Drops + announce selection on preview open; do not rely on GeoJSON for TalkBack targets |

### 8.3 Comparison snapshot

| Approach | Pros | Cons |
| --- | --- | --- |
| RN Markers | Familiar; easy a11y on views | Touch interception; mount cost |
| GeoJSON layers | Native draw; proven selection | Custom icons/sprites work; SR weak |
| MapLibre-native cluster | Less JS | Property/expand parity TBD |
| Grid (`worldCluster`) | Already shipped; tested contracts | Not a global index |
| Supercluster | Strong at scale | New dep; overkill at limit 40 |

---

## 9. Tile provider and attribution

Starting from Step 5 research (verify pricing before contract — mark stale if >90 days):

| Provider | Fit | Notes |
| --- | --- | --- |
| **MapTiler Cloud (paid)** | Primary shortlist | Style JSON URLs; India coverage; sessions/requests cost drivers; attribution + logo rules on free — **paid required** |
| **Stadia Maps (paid)** | Primary shortlist | MapLibre styles; free tier non-commercial — **paid required** |
| **Self-host vector (Z/X/Y)** | Long-term control | Ops + data license; Protomaps/`pmtiles://` **not** direct on maplibre-react-native today — use HTTP gateway |
| **OSMF public tiles** | **Reject** | Policy forbids production bulk/offline |
| **Mapbox** | Parallel product decision | Prefer Mapbox SDK vs MapLibre+tiles legal review |

**Architecture requirements:**

- Style URL + API key via **Expo extras / secrets**, not git.
- Runtime attribution component fed by `WorldMapAttribution`.
- Offline caching only under provider ToS.
- Fallback: last-known style or cached tiles; degraded “map unavailable” without crashing discovery lists.
- Provider switch = change style URL + attribution config; keep GeoJSON Drop layer code stable.

**Do not** configure production keys in this documentation step.

---

## 10. Performance and reliability gates

Baseline evidence is **Samsung A50 / Android 11** from the probe — not a guarantee for all devices.

| Gate | Target (World production) | Method | Record |
| --- | --- | --- | --- |
| Map startup | Interactive map ≤ 3s on A50 Wi-Fi after JS ready | Stopwatch + screen record | Device, build, n=3 |
| Camera pan | No ANR; gfxinfo 90th frame ≤ 32ms over 5s pan (soft) | `dumpsys gfxinfo` | Percentiles + jank % |
| Feature select | Direct Drop tap → preview ≤ 200ms JS; correct id | UI + `performance.now` | Last-hit / Drop id |
| Cluster expand | Zoom increases; no selection storm | Manual + unit zoom helper | Before/after zoom |
| Preview latency | Sheet visible ≤ 300ms after select | Screen record | n=5 |
| Memory | After 5 min Map area use, PSS growth &lt; 80 MB vs post-load | `dumpsys meminfo` | PSS timeline |
| Focus recovery | Refocus restores mode without GPS prompt | Consent script + manual | Pass/fail |
| Network blip | Airplane 10s → restore tiles; no crash | Manual | Pass/fail |
| Density | With raised fixture ≤1k in viewport, select still works | Probe + future staging | Pass/fail |
| Low-end Android | A50 gates green | Device lab | Matrix row |
| iOS | Same functional gates on one recent iPhone | Device lab | Matrix row |

Distinguish **JS pipeline** timings from **native** gfxinfo. Do not invent FPS.

---

## 11. Rollout and rollback

| Stage | Work | Blocker if… |
| --- | --- | --- |
| **1. Provider prep** | Extract `GoogleWorldMapSurface`; screen uses facade; adapter types extended | Any World contract script fails |
| **2. Dev strategy** | Decide A vs B; if B, write isolation test plan first | Temptation to merge PR #7 |
| **3. Data parity** | MapLibre surface against **staging/live** RPCs in a **non-root** harness or flagged build | Marker coords / RLS mismatches |
| **4. Device validation** | A50 + iOS §9 | Hit-test or consent regression |
| **5. Tile selection** | Paid provider + attribution signed off | Unverified pricing/licensing |
| **6. Release verification** | Binary + Metro gates §5.3 | MapLibre in unintended variant |
| **7. Controlled rollout** | Feature flag / staged track; Google still compiled until soak done | Dual-engine memory without approval |
| **8. Rollback** | Flag off → `GoogleWorldMapSurface`; keep probe for repro | Flag does not restore Google |

**Avoid** rewriting all of `app/world/index.tsx` in one PR. Slice: extract Google surface → adapter completeness → MapLibre surface behind flag → cutover.

---

## 12. Experimental PR disposition

| PR | Content | Recommendation | Rationale |
| --- | --- | --- | --- |
| **#7** | Root MapLibre + “dev-only” route | **Close without merging** (or keep draft forever as cautionary research) — **do not merge** | Autolink/bundle isolation failed |
| **#8** | Probe markers/clusters/preview | **Retain as merged history into probe lineage** / supersede via #9/#10 stack; no root merge needed | Valuable prototype; not production |
| **#9** | Perf + tiles | **Retain** as research behind probe branch; cite from this doc | Tile shortlist + A50 pipe timings |
| **#10** | Stability + interactions | **Retain** as current probe HEAD research; cite hit-test/GeoJSON default | Selection + PSS evidence |

**Dependency rule:** never stack a `main` integration branch on #7. New work branches from **`main`** (adapter already present) and optionally **cherry-picks ideas** from probe files under `experiments/maplibre-probe` only.

Do **not** close/merge these PRs in Step 7 automation — human maintainers apply disposition.

---

## 13. Open questions and blockers

1. **Basemap vendor contract** (MapTiler vs Stadia vs self-host) — pricing/licensing **verify-at-signing**.
2. **Single vs dual map engine** during rollout window (APK size / memory).
3. **Icon pipeline** for Drop thumbnails in symbol layers (sprite build, video badge).
4. **Accessibility list UX** placement on World.
5. **Whether nearby stays radius-only** if product wants true polygon/bbox search later.
6. **iOS MapLibre** validation still thinner than Android A50 evidence.
7. **PR #7 closure** ownership.

**Hard blockers before production MapLibre:**

- Release-binary autolinking proof.
- Paid tile provider + attribution.
- Live-data hit-testing parity with consent preserved.

---

## 14. Recommended Step 8 implementation scope

**Documentation and Google extraction only — still no MapLibre in root unless explicitly authorized.**

1. Extend `worldMapAdapter` types/tests (SDK-free).
2. Extract `GoogleWorldMapSurface` + `WorldMapSurface` facade; thin `app/world/index.tsx`.
3. Port probe hierarchical cluster as **optional** pure function (flagged off).
4. Add World accessibility scaffolding (visible Drop list) without MapLibre.
5. Write isolation CI checklist doc for future Option B (binary scan commands).
6. **Do not** add `@maplibre/maplibre-react-native` to root.
7. **Do not** merge #7–#10 into `main`.

Step 9+ (authorized): MapLibre surface behind flag + tile keys + device matrix.

---

## 15. Validation performed in Step 7

Commands run on worktree `C:\carch` @ `eccd521` + docs commits (documentation-only; no new runtime dependencies):

| Command | Result |
| --- | --- |
| `npm run typecheck` | **pass** (exit 0) |
| `npm run test:unit` | **464** tests / **118** suites — **pass** (includes World map provider boundary) |
| `node --experimental-strip-types --test utils/worldMapAdapter.test.ts` | **7** tests — **pass** |
| `node scripts/world-consent-check.cjs` | **8** checks — **pass** |
| `node scripts/world-request-order-check.cjs` | **21** checks — **pass** |
| `node scripts/world-pan-request-check.cjs` | **8** checks — **pass** |
| `node scripts/world-empty-discovery-check.cjs` | **13** checks — **pass** |

**Clustering:** no dedicated `worldCluster.test.ts` on `main`; behavior covered indirectly by World scripts and by probe tests under `experiments/maplibre-probe` (not re-run against root). Failures: **none**.

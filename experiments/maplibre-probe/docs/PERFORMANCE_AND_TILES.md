# MapLibre probe — performance & tile provider evaluation

**Status:** experimental prototype report (Phase 1G Step 5). Not production guidance for CLASH World until isolation and basemap decisions are finalized.

**Date checked:** 10 October 2026  
**Branch context:** `feat/explore-1g-maplibre-perf` (from `feat/explore-1g-maplibre-markers`)  
**Package:** `com.clash.mapprobe`  
**Demo style kept:** `https://demotiles.maplibre.org/style.json` (not replaced; not production-ready)

## Device and methodology

| Item | Value |
| --- | --- |
| Device | Samsung Galaxy A50 (`SM_A505F`, serial used in lab) |
| Android | **11** (API 30) |
| Native rebuild | **Not required** for this step (JS-only probe changes) |
| Delivery path | Existing APK + Metro `:8082` |
| Instrumentation | `performance.now()` around prepare / viewport filter / cluster / selection; on-screen metrics panel |
| FPS | **Not measured** |
| Process memory (PSS/RSS) | **Not measured** (no reliable ADB memory sampling in this pass) |
| Tile network latency | **Not measured** (demo tiles only) |

### Datasets

Seeded synthetic Drops around Goa (`seed=1`), sizes **50 / 250 / 1,000 / 5,000**. No Supabase, no real user locations.

### Rendering strategy (exact)

| Dataset | Strategy | Notes |
| --- | --- | --- |
| 50 | React Native `Marker` views | After viewport filter + cluster; capped at 120 views |
| 250 | React Native `Marker` views | Same |
| 1,000 | MapLibre `GeoJSONSource` + `circle`/`symbol` layers | Native layers; no mass RN marker mounts |
| 5,000 | MapLibre `GeoJSONSource` + `circle`/`symbol` layers | Same; viewport filter before cluster |

Clustering modes compared (pure JS, **no new native deps**):

1. **World grid** — existing `clusterProbeDrops` (latitudeDelta cell grid)
2. **Hierarchical grid** — zoom-derived cell size (Supercluster-*inspired*, not the `supercluster` npm package)

## Node microbench (host machine)

Command: `npm run bench:cluster` (average of 5 runs after cache warm for prepare). Region: zoom 11 over Goa.

| size | mode | prepareMs | filterMs | clusterMs | visible | items | strategy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 50 | grid | ~0.01 | ~0.04 | ~0.56 | 24 | 24 | markers |
| 50 | hierarchical | ~0.01 | ~0.04 | ~0.10 | 24 | 21 | markers |
| 250 | grid | ~0.00 | ~0.08 | ~0.21 | 100 | 81 | markers |
| 250 | hierarchical | ~0.00 | ~0.46 | ~0.15 | 100 | 51 | markers |
| 1000 | grid | ~0.00 | ~0.08 | ~0.81 | 379 | 208 | geojson-layers |
| 1000 | hierarchical | ~0.00 | ~0.15 | ~0.66 | 379 | 55 | geojson-layers |
| 5000 | grid | ~0.01 | ~0.46 | ~3.72 | 1903 | 304 | geojson-layers |
| 5000 | hierarchical | ~0.01 | ~0.80 | ~4.03 | 1903 | 56 | geojson-layers |

Interpretation:

- Prepare is negligible with caching; first build of 5k is still cheap in Node.
- Viewport filtering is the main reason 5k stays interactive (visible ≪ 5000 at z11).
- Hierarchical mode collapses to fewer on-screen items at mid zoom (good for marker budgets).
- Cluster CPU stays **well under 10ms** for these sizes on a desktop Node host; A50 wall times are reported in the device section / on-screen panel and may be higher.

## Samsung A50 observations

Android **11** (API 30). Existing `com.clash.mapprobe` APK + Metro `:8082` (no rebuild).

### Measured on-device panel timings (hierarchical unless noted)

| Action | Observed UI metrics |
| --- | --- |
| Load 50 | Visible 24/50 · Items 21 · Prep 0.0 / Filter 0.1 / Cluster 0.1 / Pipe **0.3ms** · strategy `markers` |
| Switch 250 | Visible 100/250 · Items 51 · Prep 2.8 / Filter 0.3 / Cluster 0.6 / Pipe **3.9ms** · `markers` |
| Switch 1000 | Visible 379/1000 · Items 55 · Prep 11.3 / Filter 1.4 / Cluster 2.0 / Pipe **14.7ms** · `geojson-layers` |
| Switch 5000 | Visible 1903/5000 · Items 56 · Prep 49.5 / Filter 4.1 / Cluster 5.0 / Pipe **58.7ms** · `geojson-layers` |
| 5000 + World grid | Visible 1903 · Items **304** · Cluster **15.5ms** · Pipe **19.8ms** (cached prepare) |
| Sample Drop select | Select **0.5ms**; preview “Still 1” opened; Close dismissed |
| Map tap (cluster expand) | Zoom **11 → 13**; Visible 96/5000; Camera events 2 → 3 |
| Pan | Lng 73.8232 → 73.8046; Visible 107; Camera events → 4 |

Checks completed: initial load, dataset switching, pan, cluster expand (map tap), preview/dismiss, foreground resume after HOME. Pinch FPS **not measured**.

**Crashes / freezes / blank tiles:** none observed in this pass.

**Bottlenecks identified**

1. Mounting many React Native `Marker` views — mitigated by strategy switch at 1000+ and `MAX_MARKER_VIEWS=120`.  
2. Reclustering on every camera idle — acceptable at ≤5k with viewport filter; will need debounce/idle coalescing before World-scale.  
3. Demo tiles have no SLA; tile jank ≠ marker jank.  
4. Custom Drop chrome (image thumbnails) not yet tested at high volume — only circles/labels.

## Tile provider comparison

Sources checked **10 October 2026**. Do **not** treat OSM’s public tile servers as unrestricted production infrastructure ([OSMF Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)).

| Provider | Pricing / free tier (summary) | Commercial use | Attribution | MapLibre fit | Offline / cache | Keys / security | India / Goa coverage | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **MapTiler Cloud** | Free: 5k sessions + 100k API req/mo, logo required; Flex overage (e.g. ~$2.50/1k sessions, ~$0.15/1k requests) | Free is for testing/PoC/non-commercial; paid for production | © MapTiler + OSM (dataset-dependent); Free requires MapTiler logo | First-class MapLibre style JSON URLs | Cloud ToS govern caching; on-prem data is a separate product | Public key in client + URL restrictions / allowlists recommended | Global Planet coverage includes India | [Pricing](https://www.maptiler.com/cloud/pricing/), [Attribution](https://docs.maptiler.com/guides/map-design/attribution/add-attribution/), [Sessions vs requests](https://docs.maptiler.com/guides/account/sessions-vs-requests/) |
| **Stadia Maps** | Free: 200k credits/mo, **no commercial use**; Starter from $20/mo | Paid required for commercial / for-profit apps | Required; see attribution guide | MapLibre vector styles supported | Follow plan limits; do not abuse free tier | Domain / app auth; keep secrets server-side where possible | Global OSM-derived coverage includes India | [Pricing](https://stadiamaps.com/pricing/), [Limits](https://docs.stadiamaps.com/limits/), [Attribution](https://stadiamaps.com/attribution/), [FAQ](https://stadiamaps.com/faqs/) |
| **Mapbox** | Pay-as-you-go with free tiers; Mobile Maps SDK billed by MAU (tiers from pricing page, e.g. free band then paid MAU); GL JS by map loads | Commercial use under Mapbox terms; some verticals need Commercial Application License | Mapbox + data attribution per product terms | **Proprietary Maps SDK** is primary mobile path; using Mapbox styles/tiles inside MapLibre is a separate licensing/API question — do not assume drop-in | Offline / caching restricted by Mapbox TOS | Public token in app is normal; restrict token URLs; never commit secret tokens | Strong global coverage including India | [Pricing](https://www.mapbox.com/pricing), [Android install](https://docs.mapbox.com/android/maps/guides/install/) |
| **Self-host OpenMapTiles / MapTiler Data + Server** | MapTiler on-prem packages e.g. On-prem Standard **$2500/year** (internal app, ≤500 MAU); Custom for B2C | OpenMapTiles *schema/tools* ≠ free commercial hosted planet; MapTiler Data needs license for commercial self-host | OSM attribution typically still required for OSM-derived data | Serve vector tiles + style to MapLibre | Full offline possible under license | Keys optional if private network; harden tile endpoint | You control extract; India extract feasible | [MapTiler Data pricing](https://www.maptiler.com/data/pricing/), [Server + data](https://docs.maptiler.com/guides/self-hosting/self-hosted-maps/maptiler-data-and-maptiler-server-working-together/) |
| **Protomaps (PMTiles)** | Mostly infra cost (object storage + CDN); example calculators show low Cloudflare-scale cost vs hosted APIs | Depends on basemap data license you package; Protomaps builds are OSM-derived | OSM (+ design) attribution | Excellent with MapLibre **GL JS**; **maplibre-react-native lacks custom protocol** for PMTiles today (DOM/workaround or tile server in front) | Offline/static file friendly | No vendor API key if self-hosted; protect bucket | Build/regional extracts possible | [Deploy](https://docs.protomaps.com/deploy), [PMTiles + MapLibre](https://docs.protomaps.com/pmtiles/maplibre), [Cost calculator](https://docs.protomaps.com/deploy/cost) |
| **OSMFtile.openstreetmap.org** | Donation-funded, no commercial SLA | **Not** for unrestricted production / bulk / offline | Required | Raster tiles, not a MapLibre vector style host | Offline/prefetch **prohibited** | N/A — identify User-Agent | Global | [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) |

### Licensing & caching risks

- OSMF public tiles: no offline, no scraping, best-effort only — **reject for CLASH production**.  
- Free MapTiler / Stadia tiers: logo / non-commercial limits — **reject as sole production plan**.  
- Mapbox: evaluate MAU economics vs MapLibre-open stack; token leakage and vertical licensing.  
- Self-host: ops cost + data license (MapTiler Data / custom OSM pipeline).  
- Protomaps: great cost model, but RN MapLibre protocol gap means add a Z/X/Y tile gateway or wait for native protocol support.

### Recommended shortlist (for a future MapLibre World)

1. **MapTiler Cloud (paid Flex/Custom)** — fastest path to MapLibre style URLs + India coverage; budget sessions carefully for mobile.  
2. **Stadia Maps (paid)** — MapLibre-native, transparent credits; confirm style/brand fit.  
3. **Self-host vector tiles (MapTiler Data or OSM→PMTiles/MBTiles behind CDN)** — best long-term cost/control if CLASH accepts ops; for RN, expose standard tile HTTP endpoints (not raw `pmtiles://` until ML RN supports it).

Keep **Mapbox** as a parallel option only if product chooses the Mapbox Maps SDK instead of MapLibre, or after explicit legal review of Mapbox tiles inside MapLibre.

**Do not put paid API keys in the repository.** Demo tiles remain for this probe until authorized.

## Remaining gaps vs production World

- No live Supabase Drops, thumbnails, playback, or Drop navigation  
- No production basemap, offline pack, or rate-limit telemetry  
- No MapLibre production isolation in root CLASH (PR #7 still blocked)  
- Clustering is grid/hierarchical, not full Supercluster index with tiling  
- FPS/memory still unmeasured on device tooling  
- Marker hit-testing / GeoJSON press paths need more manual QA on A50  

## Automated checks (this step)

- `npm test` — dataset, viewport, pipeline, clustering, selection  
- `npm run typecheck`  
- `npm run bench:cluster`  
- Root CLASH `package.json` / lockfile **unchanged**

# MapLibre probe — stability & interaction hardening

**Status:** experimental prototype report (Phase 1G Step 6). Not production guidance for CLASH World.  
**Date checked:** 10 October 2026  
**Branch:** `feat/explore-1g-maplibre-stability` (from `feat/explore-1g-maplibre-perf`)  
**Package:** `com.clash.mapprobe`  
**Device:** Samsung Galaxy A50 (`SM_A505F`, serial used in lab) · Android **11** (API 30)  
**Native rebuild:** **Not performed** (JS-only probe changes; existing APK + Metro `:8082`)

## Commands

```bash
cd experiments/maplibre-probe
npm test
npm run typecheck
npm run bench:cluster
npm run device:profile -- --label "<size>-runN"   # requires adb + running process
npm start   # Metro :8082 → existing com.clash.mapprobe
```

Host dependency check: probe-local `package.json` / lockfile only. Root CLASH `package.json` untouched.

## Methodology (JS vs native)

| Signal | Tool | What it measures |
| --- | --- | --- |
| Prepare / filter / cluster / pipe | `performance.now()` in `prepareMapPipeline` + on-screen panel | **JavaScript** pipeline only |
| Selection latency | `performance.now()` around `selectProbeDrop` | **JavaScript** |
| JS rAF FPS sample | `requestAnimationFrame` count over ~1s after `onRegionWillChange` | **JS thread** frame callback rate — **not** GPU FPS |
| Frame times / jank | `adb shell dumpsys gfxinfo com.clash.mapprobe` via `npm run device:profile` | **Native UI** frame timing (Skia/OpenGL pipeline) |
| Memory | `adb shell dumpsys meminfo com.clash.mapprobe` | Process PSS / heap / graphics |
| Hit path | On-screen `Last hit · …` label | Direct map / GeoJSONSource press resolution |

Do **not** treat JS rAF FPS as MapLibre render FPS. Do **not** invent values when dumpsys samples are thin.

## Interaction model (Step 6)

1. **Default render strategy:** `geojson-layers` for **all** dataset sizes (50–5000).
2. **Direct taps:** `GeoJSONSource.onPress` + expanded `hitbox` → `resolvePressFeatures` (clusters preferred over drops; lowest id wins).
3. **Empty map:** `Map.onPress` with no features → dismiss open preview.
4. **Camera settle:** selection blocked ~500ms during cluster ease / Aim / Reset so camera moves do not re-fire selection.
5. **RN Marker chrome:** optional toggle (**off** by default). On A50, Marker views **intercept touches** and block GeoJSON hit-testing even with `pointerEvents="none"` on children. Treat Marker chrome as visual-only / experimental.

## Device evidence — direct interaction

| Check | Result |
| --- | --- |
| Direct GeoJSON Drop tap (50) | **Pass** — `Last hit · geojson:drop:perf-50-23`; Select **0.8ms**; preview **Still 24** / Image · IMG / Close |
| Cluster expand (5000) | **Pass** — `Last hit · geojson:cluster:h:352:1679:33`; Zoom **11 → 13**; Visible **1903 → 114** |
| Preview correctness | **Pass** — title/summary match selected Drop |
| Empty-map dismiss | **Implemented** + unit-tested; device corner taps often still hit nearby features — use Clear / Close when dense |
| Sample Drop control | Present for regression only — **not** used as the acceptance path |
| RN Marker direct tap | **Blocked** when Marker chrome enabled (native intercept). Default path does not mount Markers |
| Camera move ≠ selection spam | **Pass** — settle window + no select on `onRegionDidChange` |
| Overlap selection | **Pass** (unit) — clusters beat drops; deterministic id order |

## FPS / memory (A50) — three runs where practical

Pan gesture after `gfxinfo reset`. Frame counts vary with gesture length; thin samples noted.

### Native gfxinfo (frame time percentiles)

| Dataset | Run | Frames | Janky | 50th | 90th | 95th | 99th |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 50 | 1 | 87 | 5.75% | 10ms | 11ms | 17ms | 48ms |
| 50 | 2 | 43 | 4.65% | 8ms | 10ms | 13ms | 19ms |
| 50 | 3 | 8 | 0% | 9ms | 10ms | 10ms | 10ms |
| 250 | 1 | 86 | 10.47% | 10ms | 30ms | 48ms | 69ms |
| 250 | 2 | 39 | 5.13% | 8ms | 10ms | 17ms | 17ms |
| 250 | 3 | 13 | 0% | 7ms | 9ms | 10ms | 10ms |
| 1000 | 1 | 11 | 0% | 6ms | 10ms | 11ms | 11ms |
| 1000 | 2 | 10 | 0% | 7ms | 10ms | 10ms | 10ms |
| 1000 | 3 | 9 | 0% | 8ms | 9ms | 9ms | 9ms |
| 5000 | 1 | 15 | 0% | 6ms | 10ms | 12ms | 12ms |
| 5000 | 2 | 10 | 0% | 8ms | 11ms | 11ms | 11ms |
| 5000 | 3 | 10 | 0% | 7ms | 9ms | 9ms | 9ms |

**Approx UI FPS from 50th percentile:** ~1000/8–10 ≈ **100–125** when frames are smooth; jank spikes appear mainly on denser Marker-era / first-run pans (see 250 run1). With GeoJSON default, 1k/5k samples were short but low-jank.

### Memory (TOTAL PSS after pan samples)

| Dataset | Run1 PSS | Run2 PSS | Run3 PSS | Notes |
| --- | --- | --- | --- | --- |
| 50 | ~269 MB | ~268 MB | ~269 MB | Native heap ~110 MB; Graphics ~50 MB |
| 250 | ~289 MB | ~283 MB | ~279 MB | |
| 1000 | ~289 MB | ~282 MB | ~282 MB | |
| 5000 | ~285 MB | ~277 MB | ~277 MB | No large PSS cliff vs 50 at Goa z11 (viewport filter) |

Post-stress snapshot earlier in the session: TOTAL PSS **~225–262 MB** depending on history; Graphics ~48–50 MB stable.

### JS pipeline (on-device panel, hierarchical)

| Action | Observed |
| --- | --- |
| 50 load | Pipe ~0.3–3.3ms · strategy `geojson-layers` |
| 250 switch | Pipe ~2.0ms |
| 1000 switch | Pipe ~9–11ms |
| 5000 switch | Pipe ~3.6–47ms (cold prepare ~45ms; warm lower) |
| Select Drop | ~0.8ms |
| JS rAF during pan | typically **55–60** |

### Host microbench

`npm run bench:cluster` — all sizes now report `geojson-layers`. Cluster CPU remains well under 10ms on desktop Node for these fixtures.

## Stress testing

| Scenario | Result |
| --- | --- |
| Rapid pan / double-tap zoom | No crash; camera events increment; JS rAF ~57–60 |
| Stress switch 50↔5000 | Stress cycles **6**; no crash; selection cleared between sizes |
| Cluster expand / contract | Expand verified (z11→z13); further zoom via gestures OK |
| Repeated select / dismiss | Preview opens on Drop hit; Close control works |
| Background / foreground | HOME → resume; map remained loaded; App state `active` |
| Airplane mode briefly | No process crash; tiles may blank until network returns (demo tiles) |
| Extended 10+ minute soak | **Not fully executed** as a continuous timed soak; multi-scenario session on device was longer than 10 minutes wall-clock without FATAL/ANR |

### Failures / limitations

- **RN Marker hit-testing:** blocker when Marker chrome is enabled — documented; default path avoids it.
- **Empty-map dismiss in dense views:** hard to find a feature-free pixel; prefer Clear button.
- **gfxinfo sample size:** some runs captured few frames after short pans — percentiles less reliable when Frames &lt; ~20.
- **GPU FPS counter:** not available as a single MapLibre API; use gfxinfo + JS rAF distinction above.
- **Demo tiles only:** blank tiles under network loss expected; no production basemap SLA.

No `FATAL EXCEPTION` / `ANR in com.clash.mapprobe` observed in scanned logcat during these passes.

## Automated correctness tests

`src/probeInteraction.test.js` covers:

- Direct feature selection from press payloads  
- Deterministic overlapping cluster vs drop preference  
- Cluster expansion zoom bounds  
- Selection blocking during camera settle  
- Empty-tap dismiss rules  
- Selection invalidation when items change  
- Rapid dataset switching including empty set  
- Camera-block ordering vs selection  

`npm test` → **37** passing (includes prior coordinate/cluster/perf suites).

## Recommendations (evidence-based)

1. **Practical dataset size on A50 (current prototype):** **5,000** with viewport filter + hierarchical clustering remains usable (pipe tens of ms cold; warm low; PSS ~280 MB; no crash). Prefer hierarchical for fewer on-screen items at mid zoom.
2. **GeoJSON layers should be the default** — required for reliable direct taps on this MapLibre RN build.
3. **World-grid clustering** remains acceptable for comparison but produces more items (worse for visual density); hierarchical preferred.
4. **Supercluster / MapLibre-native clustering:** not required yet for ≤5k with viewport filter; revisit if unfiltered global datasets or &gt;10k in-viewport become product requirements.
5. **Bottlenecks:** JS prepare on cold 5k; RN Marker touch interception; demo-tile network; occasional UI-thread jank on heavier first pans — not a GeoJSON draw cliff in these samples.
6. **Before production integration:** isolate MapLibre from root CLASH (PR #7 still blocked), replace demo tiles, decide Marker chrome strategy (likely GeoJSON-only or native symbol icons), add production basemap + offline policy, run longer soak + Play vitals, wire real Drop ids/security.

## Production isolation

- Changes confined to `experiments/maplibre-probe/**`.
- Root CLASH dependencies, Supabase, Docker, app data, location permissions: **unchanged**.
- PRs #7 / #8 / #9: **not merged**.
- Android rebuild: **not authorized / not performed**.

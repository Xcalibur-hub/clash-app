# CLASH — Explore E2.9: Automatic Globe Navigation

Branch `arena-ui-review` · device **Samsung Galaxy A50** (`RZ8M30DE9NL`, 1080×2340 @420dpi,
density 2.625) · debug build + Metro (`localhost:8081`) · local Supabase (`127.0.0.1:55321`,
`adb reverse`) · checked after ordinary dev-menu reloads of the new bundle (no rebuild).

Baseline for this phase: E2.8 `docs/evidence/explore-e28/REPORT.md` (D4 / D5 / D8 closed, D3 / D7
open, `arena-ui-review` @ `e69075a`).

Delivered as a single commit on `arena-ui-review` — *feat(explore): rotate the globe only when a
country is chosen* (`git log -1 -- docs/evidence/explore-e29/REPORT.md`).

## 1. Verdict

| # | requirement | verdict | evidence |
|---|---|---|---|
| **R1** | the globe never rotates by drag / swipe / momentum | **PASS** | no gesture surface exists (0 hits for `PanResponder` / `GestureDetector` / `onPress` in `GlobeSurface` + `ExploreWorldCanvas`); device: 540 px swipe → **0 / 155 236 sampled globe pixels changed** (`42` vs `43`); earlier pair byte-identical (`21` = `22`, 326 413 B) |
| **R2** | tapping the globe selects nothing | **PASS** | tap on the globe → label still `World globe centered on Nigeria`, panel still `Nigeria` (`43` + `43-ui.xml`); same for Japan (`23` / `23-ui.xml`) |
| **R3** | a picker selection rotates the globe to that country | **PASS** | `18` `jap` → `19` mid-turn → `20` settled, label `World globe centered on Japan`; final pass `40` Nigeria → `41` settled, label `World globe centered on Nigeria` |
| **R4** | Surprise Me rotates to the picked country | **BLOCKED (environment)** — same code path as R3 (`selectCountry`), 4 unit tests; the local pool is empty (§6 O2) | `38`; §5 |
| **R5** | every turn is the shortest arc | **PASS** | `globeShortestArc` = wrapped delta, unit-tested incl. the ±180° edge; device: JP `137.32°` → BR `−53.10°` is raw `−190.42°`, travelled **`+169.58°` east** (`29` / `30`), not 190° the long way |
| **R6** | reduced motion snaps instead of animating | **PASS (code + unit) / unverified on device** | `globeAlignPlan` returns `snap` when `reduced`; 2 unit tests; the device toggle never reached the running bundle (§6 O1) |
| **R7** | selection, panel, back-navigation and mode switches keep state | **PASS** | `24` country page → `25` back → still Japan; `26` map tap → `27` globe → Japan kept; `41` Nigeria survives the panel and a swipe |
| **R8** | ambient drift survives, but only with nothing selected | **PASS** | `globeIdleDriftAllowed` gate (unit-tested); measured 14.3 % of globe pixels changing in 1.5 s with no selection vs **0 %** with Nigeria selected (`44` / `45` vs `42` / `43`) |
| **R9** | obsolete gesture / spin / cache code removed | **PASS** | drag, coast, the shared `setInterval` loop, the path cache and `spinToken` / `spinLng` are gone; `components/explore/ExploreGlobe.tsx` deleted (orphan) |
| — | regressions (map mode, picker, rails, panel actions, dark theme) | **none** | `26` / `27`, `40` / `41`, `41` (dark) |

**GO for E2.9.** The globe is now a visualisation of the selection: it moves when — and only when — a
country is chosen, along the shortest arc, and it cannot be moved by touch. One device check
(Surprise Me) is environment-blocked and one (reduced motion) is not observable on this platform;
both are covered by unit tests and share the single, already-verified selection path.

## 2. What was wrong (measured, not guessed)

`00-baseline` is the E2.8 build on the same device: **Russia is selected** in the panel while the
globe **faces the Americas**, and the copy under the canvas still asks for a gesture
("Tap a country to open its challenges…", "Drag to explore").

`components/explore/ExploreWorldCanvas.tsx` @ `e69075a` had **four writers** of the same angle, plus
a tap target on every country path:

| writer | code @ `e69075a` | problem |
|---|---|---|
| pan gesture | `GestureDetector` + `dragOrigin.current − translationX * 0.42`, then `{ kind: 'coast', velocity }` | the viewer could move the globe away from the selected country; the panel kept the old country and the globe stopped representing it |
| focus tween | `selectedCode` effect, `delta: wrapRotation(target − from)`, `duration: 560` | correct arc, but it only re-ran when `selectedCode` changed, so a drag could desync it permanently |
| spin tween | `spinToken` effect, `duration: 720`, target `spinTargetLng ?? Math.random() * 360 − 180` | a second tween for the same event; for a teleport without a country it spun to a **random** longitude |
| drift timer | `setInterval` `+1.2° / 900 ms`, sharing one motion loop with the tweens and the coast | another writer, with no notion of the selection |
| per-path tap | `onPress` on every land `Path` (line 319) | a sliver of a country near the limb was tappable and re-selected it |

None of the maths was "wrong" — the **model** was: the angle was UI state that both the viewer and the
selection could write. E2.9 makes it a derived value.

### Model after E2.9

```
picker / rail / map / Surprise me / teleport
                    │  selectCountry(code, source)          (app/(tabs)/explore.tsx)
                    ▼
            selectedCountry ──────────────► WorldCountryPanel, rails, country page
                    │  countryByCode → lng
                    ▼
        useGlobeRotation({ targetLng, busy, reduced })       (hooks/useGlobeRotation.ts)
                    │  globeAlignPlan → tween | snap
                    ▼
              rotation ──► GlobeSurface (no touch handlers)
```

One writer, one arc, one animation. `globeAlignPlan` is pure, so every rule — shortest arc, epsilon
snap, reduced-motion snap, "no target → keep the angle" — is unit-tested without a renderer.

## 3. Changes

| file | change |
|---|---|
| `utils/exploreGlobeRotation.ts` | **new** (88 lines) — `globeShortestArc`, `globeAlignPlan` (tween / snap / `null`), `globeEasedProgress`, `globeRotationFrame`, `globeIdleDriftAllowed`, `globeHintLabel`; `GLOBE_ALIGN_MS = 560`, `GLOBE_ALIGN_EPSILON = 0.75`, drift `1.2° / 900 ms` |
| `hooks/useGlobeRotation.ts` | **new** (114 lines) — owns the angle: rAF tween, snap path, drift `setInterval` gated by `globeIdleDriftAllowed`, cancels on unmount and on map mode |
| `components/explore/GlobeSurface.tsx` | **new** (126 lines) — SVG sphere, meridians, activity fills, selected-country highlight, a11y label (`World globe centered on <country>` / `World globe, rotates to the country you pick`); **no** gesture or press handlers |
| `components/explore/WorldMapSurface.tsx` | **new** (96 lines) — the tap-to-find map, behaviour unchanged, extracted so the canvas renders exactly one surface |
| `components/explore/worldCanvasStyles.ts` | **new** (13 lines) — shared canvas wrapper / hint styles |
| `components/explore/ExploreWorldCanvas.tsx` | rewritten **412 → 88 lines** — drag, coast, path cache, `spinToken` / `spinTargetLng`, both tweens and the shared motion loop deleted; now composes `useGlobeRotation` + one surface + the hint |
| `app/(tabs)/explore.tsx` | `selectCountry(code, source)` is the single entry point (picker, rail, map, Surprise me, teleport); `spinToken` / `spinLng` state removed; the random spin on a country-less teleport removed; copy updated to "Pick a country — the globe turns to it on its own." |
| `components/explore/ExploreGlobe.tsx` | **deleted** — orphan, never imported (flagged in `docs/EXPLORE_AUDIT.md`) |
| `utils/exploreWorldModel.ts` | `surpriseCountry(pool, selectedCode, random)` extracted from the screen so the pick rule is testable: empty pool → `null`, single-country pool still returns one, hostile `random()` values clamped |
| `utils/exploreGlobeRotation.test.ts` | **new** (177 lines) — 14 regression tests (shortest arc, ±180° edge, epsilon snap, reduced snap, `null`/`NaN` target, frame maths, drift gate, hint copy) |
| `utils/exploreWorldModel.test.ts` | +4 tests for `surpriseCountry` (avoids the current country, falls back when it is the only one, empty pool, clamps) |
| `package.json` | `exploreGlobeRotation.test.ts` added to `test:unit` |

Rules honoured: no `any`, every file ≤ 150 lines (canvas 88, surface 126, hook 114), no device
constants, no backend or database change.

## 4. On-device QA (Samsung A50)

### 4.1 Touch is inert (R1 / R2) — `42` vs `43`

Final build, Nigeria selected. A **540 px horizontal swipe** across the globe
(`input swipe 320 900 860 900 180`), then a **tap on the globe centre**, then the same screen captured
again:

| region | sampled px | differing px |
|---|---|---|
| status bar (0–100 px) | 27 000 | **90** — the clock ticked `09:50` → `09:51` |
| header / search / banner | 108 000 | **0** |
| globe `136,503 → 923,1291` | 155 236 | **0** |
| panel + rail + tab bar | 280 800 | **0** |

The globe is pixel-identical after a swipe and a tap: no drag, no momentum, no tap-to-select. The
a11y tree agrees — `World globe centered on Nigeria` and `Nigeria` / `Explore Nigeria` before and
after (`41-ui.xml` vs `43-ui.xml`). The earlier pass measured the same on Japan: `21` and `22` are
**byte-identical** (326 413 B, same SHA) and `23` (tap) still reads `centered on Japan`.

### 4.2 The selection drives the rotation (R3 / R5) — `17` → `20`, `40` → `41`

| step | evidence | observation |
|---|---|---|
| picker opened | `17` | search + sections; the globe behind it is untouched |
| `jap` typed | `18` | single result `Japan` |
| after the tap | `19` | mid-turn: the face has left Africa/Europe and is swinging towards Asia on the 560 ms tween |
| settled | `20`, `20-ui.xml` | `World globe centered on Japan`, panel `Japan`, hint `Rotation follows your pick` |
| final pass | `40` → `41` | picker `niger` → **Nigeria**; settled globe shows West Africa face-on with **Nigeria filled white**, panel `Nigeria` / `Explore Nigeria`, dark theme |

Arc check on device: Japan `137.32°` → Brazil `−53.10°` is a raw `−190.42°`; the globe travelled the
**`+169.58°` way east** — `29` → `30` shows the Pacific and then the Americas coming round, not a
190° westward sweep through Europe and Africa. That is `globeShortestArc`, which also has explicit
unit tests for the ±180° edge.

### 4.3 Nothing is lost around the rotation (R7)

- `24` country page for Japan → `25` back → globe **still** centred on Japan, panel intact.
- `26` switch to **Map**, tap a country → `27` back to **Globe** → the selection is kept and the
  globe is already aligned (no re-flight).
- `41` → `43`: opening the panel, tapping around it and swiping the globe leave the selection, panel,
  rail and tab bar untouched.

### 4.4 Idle drift still reads — and stops with a selection (R8)

Measured on the final build over the same globe rectangle (`136,503 → 923,1291`), sampled every 2 px:

| state | captures | differing pixels |
|---|---|---|
| **nothing selected** (panel closed with ✕ → `44`) | `44` then `45`, 1.5 s apart | **22 205 / 155 236 (14.3 %)** — the globe is drifting (`1.2°` per 900 ms) |
| **Nigeria selected** (`42` / `43`) | before / after a swipe + tap | **0 / 155 236** |

The a11y label swaps with the state: `World globe, rotates to the country you pick` when empty
(`44-ui.xml`) vs `World globe centered on Nigeria` when a country is chosen. Drift is gated by
`globeIdleDriftAllowed` (globe only, not reduced motion, not busy, **no target**, not already
animating), so a selected country can never slide out from under the reader.

### 4.5 Cold start and modes

`37` is a cold start onto Explore → World → Globe in the dark theme with no selection: the globe
renders, drifts, and the panel is empty — no auto-selection and no rotation on open. `13` / `14` are
the light-theme Map and Globe states; `26` / `27` cover the Map → Globe round trip.

## 5. Automated checks

| check | result |
|---|---|
| `npx tsc --noEmit` | **clean** — exit 0, 0 diagnostics (`tsc.log` is empty by design) |
| `npm run test:unit` | **764 / 764 pass**, exit 0 (`unit-suite.log`) |
| new rotation tests | **14 / 14 pass** (`npx tsx --test utils/exploreGlobeRotation.test.ts`) |
| world-model tests | **8 / 8 pass**, 4 of them new for `surpriseCountry` |
| BOM scan (11 touched files) | **none** — `bom=False` on every file |
| gesture scan | `GlobeSurface.tsx` + `ExploreWorldCanvas.tsx`: **0** hits for `PanResponder` / `GestureDetector` / `onPress` / `onTouch` |

The `.log` files are gitignored by `*.log`; they stay on the machine that ran the checks. Regenerate
them with:

```powershell
npx tsc --noEmit                                        # > docs/evidence/explore-e29/tsc.log
npm run test:unit                                       # > docs/evidence/explore-e29/unit-suite.log
npx tsx --test utils/exploreGlobeRotation.test.ts utils/exploreWorldModel.test.ts
```

Coverage of the new maths: shortest arc sign and magnitude in both hemispheres, the ±180° wrap,
`null` / `NaN` targets (`→ null`, the caller keeps its angle), the 0.75° epsilon snap, the
reduced-motion snap, ease-out progress clamping, per-frame wrapping, the drift gate (globe only, not
reduced, not busy, no target, not already moving), and hint copy that never invites a gesture the
surface does not have.

## 6. Remaining items / observations

| # | item | status |
|---|---|---|
| **O1** | **Reduced motion could not be observed on this build.** Reanimated's `useReducedMotion()` is a **module-level constant** (`node_modules/react-native-reanimated/lib/module/ReducedMotion.js`: `const IS_REDUCED_MOTION_ENABLED_IN_SYSTEM = isReducedMotionEnabledInSystem()`), documented as *"changing the reduced motion system setting doesn't cause your components to rerender"* — a value read once when the bundle is evaluated. Lowering `animator_duration_scale` to `0` mid-session cannot reach an already-running bundle, and the pick after the next reload still animated (`29` / `30`, then `33` / `34`). The same hook is used by ~60 other components app-wide, so this is a platform-integration question, not an E2.9 regression. **To close:** enable Settings → Accessibility → *Remove animations*, force-stop and cold start the app, then re-run §8. The E2.9 side is one branch — `globeAlignPlan({…, reduced}) → { kind: 'snap' }` — with explicit unit tests. | unverified on device / covered by unit tests |
| **O2** | **Surprise Me has no pool on the local stack** (environment). Measured: `20` profiles, **`0`** with `public_country_code`; `get_explore_world_summary` only reports a country with `having count(*) >= 3` (`supabase/migrations/20261003180000_explore_global.sql:229`), so it returns `[]`. `surpriseCountry([], …)` → `null` → no selection and no rotation: the designed behaviour, not a defect (`38`). The same empty pool is why the banner reads "No accessible teleport destinations" (`38`, `41`). **To close:** seed ≥ 3 profiles per country and repeat §8's Surprise me step. | environment-blocked |
| **O3** | Hint copy — `Rotation follows your pick` is shown even before the first pick (`14`, `44`). Arguably fine as an instruction; if preferred, `globeHintLabel` can return `Pick a country` until a selection exists. One-line change, no geometry. | nuance, not blocking |
| **O4** | E2.7 **D3** (globe drag: 81 % janky frames, p50 105 ms in debug) — **closed by removal**: there is no drag surface left to jank. The only remaining motion is the 560 ms rAF tween over the current path set, and the quarter-degree path cache is gone with the continuous input that needed it. | closed |
| **O5** | A teleport that resolves a country now emits `explore_country_selected` (`source: 'explore_teleport'`) in addition to `explore_teleport`, because it goes through `selectCountry`. Deliberate — one funnel for every selection — but it changes event volume per teleport. | by design |
| **O6** | E2.7 **D7** (duplicated "Quiet right now" on the country page) still needs backend data to reproduce; `41`'s panel shows the intended single instance. | unchanged from E2.8 |

## 7. Evidence index (`docs/evidence/explore-e29/`)

| prefix | contents |
|---|---|
| `00-baseline*` | **before** — E2.8 build: `Russia` selected in the panel, globe facing the Americas, "Drag to explore" |
| `13` | World in **Map** mode |
| `14` | Globe with nothing selected (drift, new copy) |
| `17`–`20` | picker open → `jap` → mid-turn → settled **Japan** (`20-ui.xml`) |
| `21`, `22` | swipe across the globe — byte-identical captures (same SHA) |
| `23` | tap on the globe — no change (`23-ui.xml`) |
| `24`, `25` | country page → back — Japan preserved (`25-ui.xml`) |
| `26`, `27` | Map tap-selection → back to Globe — selection kept |
| `28`–`34` | reduced-motion attempts (`animator_duration_scale=0`): `28` picker `bra`, `29` immediate, `30` settled — still animated; `33` / `34` the same after a reload (see O1) |
| `37` | cold start, dark theme, globe, nothing selected |
| `38` | Surprise me / Teleport with an empty pool (O2) |
| `40`, `41` | final pass: picker `niger` → **Nigeria** settled in the dark theme (`41-ui.xml`) |
| `42`, `43` | final pass inertness: before / after a 540 px swipe + tap (`43-ui.xml`) |
| `44`, `45` | final pass drift: nothing selected, captures 1.5 s apart (`44-ui.xml`) |
| `*.log` | `tsc.log`, `unit-suite.log` — **gitignored** (`*.log`), local run artifacts |

`*-ui.xml` are raw `uiautomator` dumps (a11y labels + bounds); PNGs are 1080×2340 captures. Pixel
comparisons in §4 were made on the PNGs with `System.Drawing` on a 2 px grid over the stated
rectangles, so a whole-screen difference caused only by the status-bar clock is reported separately
instead of as globe movement.

## 8. Reproduction

```powershell
adb reverse tcp:8081 tcp:8081        # Metro
adb reverse tcp:55321 tcp:55321      # local Supabase (.env.local) — needed for the World rail
adb shell input keyevent 82          # dev menu → Reload
adb shell input tap 311 2105         # Explore tab
adb shell input tap 971 1593         # World mode
adb shell input tap 937 425          # Globe toggle
adb shell input tap 416 1236         # Search → country picker
adb shell input text jap             # 18
adb shell input tap 445 780          # Japan row → the globe turns on its own (19 → 20)
adb shell input swipe 320 900 860 900 180   # R1: no rotation (21 vs 22)
adb shell input tap 560 980                 # R2: no selection (23)
adb shell uiautomator dump /sdcard/e29.xml; adb pull /sdcard/e29.xml dump.xml
```

Inertness measurement (PowerShell, from the repo root):

```powershell
Add-Type -AssemblyName System.Drawing
$b=[System.Drawing.Bitmap]::FromFile((Resolve-Path 'docs/evidence/explore-e29/42-final-before-swipe.png'))
$a=[System.Drawing.Bitmap]::FromFile((Resolve-Path 'docs/evidence/explore-e29/43-final-after-swipe-tap.png'))
$d=0; for($y=503;$y -lt 1291;$y+=2){ for($x=136;$x -lt 923;$x+=2){ if($b.GetPixel($x,$y).ToArgb() -ne $a.GetPixel($x,$y).ToArgb()){ $d++ } } }
"differing=$d"   # expect 0
```

Coordinates are for the A50 frame (1080×2340, `uiautomator` clip 0,0 → 1080,2131); re-derive them
from a dump if the layout shifts. Clear the selection with the panel's ✕ (`805 1670`) to watch the
drift resume (`44` / `45`).

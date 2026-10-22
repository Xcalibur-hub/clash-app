# CLASH — Explore E2.8: Country Picker Hotfix

Branch `arena-ui-review` · device **Samsung Galaxy A50** (`RZ8M30DE9NL`, 1080×2340 @420dpi,
density 2.625) · debug build + Metro (`localhost:8081`) · checked **after one ordinary dev-menu
reload** of the new bundle (no rebuild, no Metro restart).

Baseline for this phase: E2.7 `docs/evidence/explore-e27/REPORT.md` (D4 / D5 / D8 open).

Delivered as a single commit on `arena-ui-review` — *fix(explore): make the country picker
reachable, reset on close, and IME-safe* (`git log -1 -- docs/evidence/explore-e28/REPORT.md`).

## 1. Verdict

| defect | verdict | evidence |
|---|---|---|
| **D4** bottom rows clipped / last result unreachable | **PASS** | `22`/`23`/`24`, final pass `53`/`54`/`55` |
| **D5** search query survives close/reopen | **PASS** | `25`/`27`/`28`, final pass `46`/`47` |
| **D8** keyboard pushes the picker behind the IME | **PASS** | `21`/`26`, final pass `42`/`45`/`51` |
| regressions (search, selection, World context, modes, globe) | **none** | `20`, `30`/`31`, final pass `56` |

**GO for the E2.8 picker hotfix.** All three defects are fixed on device, the country picker is now
usable end-to-end with the keyboard up, and no regression was observed in the surrounding Explore
flows.

## 2. Root causes (measured, not guessed)

The old sheet was a `78 %` `maxHeight` box with no insets:

- **D4** the `FlatList` used `flexGrow: 0` inside a height-capped sheet, so a long list overflowed
  the sheet's `paddingBottom` and painted under the navigation bar (E2.7: `Mexico 2079 → 2131`,
  filtered row `2129 → 2131`). On top of that `MAX_RESULTS = 40` silently dropped the last two
  catalogue countries (**China**, **Russia**), so the "final result" could not be reached at all.
- **D5** `query` lived in component state with no visibility reset, so a closed picker kept both the
  text and its filtered result set.
- **D8** edge-to-edge (`edgeToEdgeEnabled: true` + `decorFitsSystemWindows=false`) means the IME
  overlays the window instead of resizing it. The sheet had no keyboard compensation, so it slid
  behind the keyboard (E2.7: sheet top `1771`, IME from ≈`1360`).

### Coordinate space (the part that made a naive fix wrong)

Runtime instrumentation on the A50:

| value | dp | px |
|---|---|---|
| `Dimensions.window` height | 811.8 | 2131 |
| measured modal surface (`onLayout`) | 891.4 | 2340 |
| status-bar inset | 31.6 | 83 |
| navigation-bar inset | 48 | 126 |
| RN keyboard height | 325.7 | 855 |
| system IME inset top (`dumpsys window` → `ITYPE_IME`) | 517.7 | 1359 |

RN reports the keyboard against `Dimensions.window`, which excludes the system bars, while a
full-screen `Modal` surface spans them. Subtracting only the reported height left the sheet
**126 px (48 dp) too low** — exactly the navigation bar. The fix adds only the *measured* difference
between the modal surface and the window (minus the status bar), never a device constant.

## 3. Changes

| file | change |
|---|---|
| `utils/explorePickerLayout.ts` | **new** — viewport maths: `exploreKeyboardOverlap` (surface vs window vs IME), `explorePickerBackdropLift`, `explorePickerUsableHeight`, `explorePickerSheetHeight`, `explorePickerBottomInset`; row/target constants |
| `utils/explorePickerModel.ts` | **new** — `pickerSections` (recent / happening-now / results), `pickerQueryAfterVisibility` (D5 reset), `PICKER_MAX_RESULTS = 60` (whole catalogue browsable) |
| `hooks/usePickerViewport.ts` | **new** — measures the modal surface (`onLayout`), tracks the keyboard, and returns the sheet height, backdrop lift and bottom inset for the current insets |
| `components/explore/CountryPickerSheet.tsx` | applies the computed height, lift and bottom inset; resets the query when hidden (142 lines) |
| `components/explore/CountryPickerRow.tsx` | **new** — row with a 48 dp minimum target |
| `components/explore/CountryPickerListHeader.tsx` | **new** — Recent / Happening now / All countries head, scrolls with the list |
| `components/explore/countryPickerStyles.ts` | **new** — sheet styles; `list: { flex: 1 }` (was `flexGrow: 0`), no percentage cap |
| `utils/explorePickerLayout.test.ts` | **new** — 13 regression tests (D4 + D8 geometry, target sizes, source guards) |
| `utils/explorePickerModel.test.ts` | **new** — 8 regression tests (D5 reset, sections, catalogue completeness) |
| `package.json` | both new test files added to `test:unit` |

Rules honoured: no `any`, every file ≤ 150 lines, no device-specific pixel offsets (only insets, the
measured surface and the reported keyboard height), no backend or database change.

## 4. On-device measurements (Samsung A50)

### D8 — picker with the IME up (`21-picker-ime`, `26-field-focus-ime`)

| node | bounds (px) | note |
|---|---|---|
| sheet | `[0,359] → [1080,1328]` | bottom is 31 px (12 dp) above the IME top `1359` |
| close control | `[922,413] → [1037,529]` | 115×116 px = **43.8×43.8 dp** |
| search field | `[43,559] → [1037,685]` | fully above the IME |
| first result (`Japan` for `jap`) | `[43,717] → [1037,843]` | tappable while typing |

`mInputShown=true` in the same state. Closing with ✕ while the keyboard is up works
(`27-closed-while-typing`: picker nodes `0`, IME dismissed).

### D4 — no keyboard, scrolled to the end (`22`, `23`)

| node | bounds (px) | note |
|---|---|---|
| sheet | `[0,678] → [1080,2340]` | anchored to the screen bottom |
| list viewport | ends `2193` | 56 dp bottom padding = 48 dp nav bar + 8 dp breathing |
| last row `Russia` | `[43,2044] → [1037,2170]` | fully visible, 44 px (17 dp) above the nav bar top `2214` |
| row above it `China` | `[43,1918] → [1037,2044]` | also fully visible (`54-bottom-russia`) |
| tap `Russia` | → panel `Russia` + `Clear Russia` + `Explore Russia` | final result reachable, World context kept |

Row target = 126 px = **48 dp**; close control = 115 px ≈ **44 dp** (at the 44 dp minimum).

### D5 — query reset (`25`, `27`, `28`)

Typed `jap` → single result `Japan` (`25-query-jap-ime`). Closed with ✕ while typing
(`27-closed-while-typing`). Reopened (`28-reopened-d5`): the field shows only its placeholder and the
list is unfiltered again (`ALL COUNTRIES` → `India`, `Japan`, …), i.e. text **and** filtered results
were reset. The catalogue now lists all 42 countries (`China`, `Russia` included).

## 5. Automated checks

| check | result |
|---|---|
| `npx tsc --noEmit` | **clean** — 0 diagnostics (`tsc.log` is empty by design) |
| `npm run test:unit` | **746 / 746 pass**, exit 0 (`unit-suite.log`) |
| new picker tests | **21 / 21 pass** (`picker-tests.log`: 13 layout + 8 model) |
| BOM scan (11 touched files) | **none** — `bom=False` on every file |

The three `.log` files are gitignored by `*.log`; they stay on the machine that ran the checks.
Regenerate them with:

```powershell
npx tsc --noEmit > docs/evidence/explore-e28/tsc.log
node --experimental-strip-types --test utils/explorePickerLayout.test.ts utils/explorePickerModel.test.ts
npm run test:unit
```

New regression tests cover: keyboard overlap with and without a surface/window mismatch,
double-compensation when a platform resizes, clamp at the surface top, the IME gap, "grows back,
never collapses", minimum sheet height on short screens, row/target minimums, query reset on close,
section integrity, and full-catalogue reachability.

## 6. Remaining defects / observations

| # | item | status |
|---|---|---|
| **O1** | `autoFocus` does not *reliably* re-raise the IME on reopen — the same build reopened with the keyboard up (`50-picker-noime`) and with it down (`52-reopen-check`). Tapping the field always raises it and the sheet lifts correctly (`45-field-ime`). | observation — device/OS focus timing, not a D4/D5/D8 failure |
| **O2** | A dev-only warning toast ("Open debugger to view warnings.") can overlay the bottom ~2 rows of the sheet in a debug build (`53-bottom-d4`); dismissed, the last rows are fully visible (`54-bottom-russia`). Not reproducible in the picker's own code path. | observation — debug overlay, worth a look at the source warning |
| **D3** | Globe drag smoothness (E2.7: 81 % janky, p50 105 ms in debug) | still open — needs a release/profile build |
| **D7** | Duplicated "Quiet right now" on the country page | unverified — no backend data |
| — | Data-backed flows (country CTA with real activity, sign-out reset) | not testable: local Supabase down / guest session |

## 7. Evidence index (`docs/evidence/explore-e28/`)

| prefix | contents |
|---|---|
| `00-devmenu*`, `01-after-reload*` | dev-menu reload onto the new bundle |
| `02`–`05` | onboarding skip → Explore → World (`02-home` … `05-world`) |
| `06`,`07` | pre-correction instrumented geometry pass |
| `08`–`10b` | first post-fix pass: `jap`, close, reopen (D5), settled layout |
| `11`,`12` | instrumented IME / bottom state |
| `20` | World before opening the picker |
| `21`,`26` | picker with the IME up (D8) |
| `22`,`23` | picker without the IME, list at the end (D4) |
| `24` | last row tapped → `Russia` selected (reachability) |
| `25`,`27`,`28` | `jap` typed, closed while typing, reopened empty (D5) |
| `30`,`31` | regression: Globe, For You |
| `40`–`56` | **final pass on the finished code** (after the `usePickerViewport` extraction): `41-world-ready` → `42` picker + IME → `44` picker resumed without IME → `45` field tap raises the IME (D8) → `46` ✕ while typing → `47` reopen empty (D5) → `50` reopen (IME up) → `51` `jap` → `52` reopen without IME → `53`/`54` list end incl. `China`/`Russia` (D4) → `55` `Russia` selected → `56` Globe regression |
| `*.log` | `picker-tests.log`, `unit-suite.log`, `tsc.log` — **gitignored** (`*.log`): local run artifacts, reproduce with §9 |
| `e28-runtime-log.txt` | instrumented viewport values (surface 891.4 / IME 325.7 / overlap 373.7 dp) |

`*-ui.xml` are raw `uiautomator` dumps; PNGs are 1080×2340 screen captures. `uiautomator` bounds and
`input tap` share one space (`0,0 → 1080,2131`); the sheet's own bottom sits below that clip at
`2340`, which is why row bounds in `22`/`23` look cut at `2131` — the screenshots show the real
layout.

## 8. Reproduction

```powershell
adb reverse tcp:8081 tcp:8081
adb shell input keyevent 82                      # dev menu → Reload
adb shell input tap 961 172                      # skip onboarding
adb shell input tap 311 2105                     # Explore tab
adb shell input tap 971 1593                     # World mode
adb shell input tap 416 1236                     # Search → country picker (IME opens)
adb shell input text jap                         # D8: field + result stay above the IME
adb shell input tap 980 471                      # ✕ while typing (D8) → picker closes, IME drops
adb shell input tap 416 1236                     # reopen → D5: empty field, full list
adb shell uiautomator dump /sdcard/e28.xml; adb pull /sdcard/e28.xml dump.xml
```

Keyboard-free geometry: tap `Done` on the keyboard (or drop focus), then scroll the list to the end
to inspect the final row clearance.

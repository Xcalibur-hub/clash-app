# CLASH 2.0 — Explore E2.6: D1 + D2 remediation

**Scope:** the two blocking defects from the E2.5 World acceptance run
(`docs/evidence/explore-e25/REPORT.md`) — **D1** (country panel obscured under the
modes rail) and **D2** (World context lost on navigation).

- **Branch / HEAD:** `arena-ui-review` — landed as
  `fix(explore): clear country panel from modes rail and keep World context`,
  directly on top of `e8888d6` (`feat(explore): ship World Experience rail, country
  panel, and surprise`)
- **Device under test (E2.5 run):** Samsung Galaxy A50 (SM-A505F), 1080×2340 @ 420 dpi
- **Verification here:** `tsc --noEmit`, targeted suites, full unit suite, BOM/EOL scan.
  On-device re-test is the checklist at the end (no device attached to this session).

## D1 — "Clear {country}" and the CTA were under the modes rail

### Root cause

Two independent surfaces computed their own geometry:

- The rail floats `16dp` from the right edge with a `52dp` resting width, i.e. it owns
  `x = W-68 → W-16` (`ExploreModeRail.tsx` local `RAIL_RIGHT` / `COLLAPSED_W`).
- The World scroll content reserves only `screenX + 8 = 24dp` of right padding, so the
  country panel stretched to `x = 16 → W-24` and ran 52dp **beneath** the rail.

On the A50 (411dp) that put the panel's trailing close target under the rail's black
"World" pill — invisible, and the tap was absorbed by the rail, matching the E2.5
capture (`x 880→995` px, `10-clear-hit-test.txt`).

### Fix

1. **One geometry source** — `utils/exploreWorldLayout.ts` owns the rail footprint
   (`EXPLORE_RAIL_COLLAPSED_W`, `EXPLORE_RAIL_RIGHT`, `EXPLORE_RAIL_GUTTER`), the World
   content gutter (`EXPLORE_WORLD_CONTENT_RIGHT`), and the derived bands.
2. **Reserve the footprint** — `worldPanelRailInset()` returns
   `railLeft − contentRight + gutter = 52dp`; `WorldExperience` applies it as a
   `marginRight` on the panel shell only (activity rail and surprise card unaffected).
3. **Never widen under the panel** — the rail gained an `expandable` prop. When a
   country panel is open (`exploreRailExpandable(countryPanelOpen) === false`) label
   expansion is suspended and any in-flight label band collapses immediately.
   Mode **navigation stays available** — every row still fires `onChange`. Hiding the
   rail was rejected: it is the only way out of World, so hiding it would trap the user.

### Geometry (411dp device)

| | before | after |
|---|---|---|
| Rail band | `343.4 → 395.4` | unchanged |
| Country panel | `16 → 387.4` | `16 → 335.4` |
| Close target | under the rail (hidden) | `291.4 → 335.4` (44dp, clear) |
| Gap panel → rail | **−44dp (overlap)** | **+8dp** |

The gutter is asserted at 320/360/411/393/768dp so tablets and small phones keep the
same invariant, and the panel body stays ≥ 280dp wide at the smallest phone width tested.

## D2 — World context lost on country page / tab switch

### Root cause

`withExploreAccount` (`components/explore/ExploreAccountBoundary.tsx`) rendered the
screen with `key = userId + ':' + usePathname()`. Every Explore route lives under
`/explore…`, so:

- `Explore Japan` push → pathname becomes `/explore/country/JP` → key changes →
  the **tab** screen remounts (while blurred, then again on return) → `mode`,
  `worldVisual` and `selectedCountry` reset to `for_you` / `map` / `null`;
- same for switching tabs (`/` vs `/explore`).

Nothing was missing from React state — it was being thrown away by the boundary's key.
That is why the E2.5 capture shows *For You* + no selection on back
(`15-back-to-world.txt`).

### Fix

- `utils/exploreAccountScope.ts` centralises the key: `exploreAccountKey({ userId, path,
  retainAcrossPaths })`. Identity (`user.id`, else `guest`) is **always** in the key, so an
  account change still wipes local discovery state; the path is only included for screens
  that want per-route scoping.
- `app/(tabs)/explore.tsx` opts in: `withExploreAccount(ExploreScreen, {
  retainAcrossPaths: true })`. Detail screens (`country/[code]`, `challenge/[id]`,
  `treasure/[id]`, `play/my`) keep the default path-scoped key — unchanged behaviour.
- Context is preserved by React Navigation's normal mounted-screen lifecycle: no global
  store, no Zustand, no serialized snapshot, no `useFocusEffect` restore hack.

Result: `Explore Japan` → Back returns to **World**, Map/Globe as left, Japan still
selected — and the globe stays centred, because the canvas never unmounts.

## Regression tests

Plain TS run with `node --experimental-strip-types --test` (no Jest), added to
`npm run test:unit`:

| File | Tests | Covers |
|---|---|---|
| `utils/exploreWorldLayout.test.ts` | 6 | inset math, no-overlap at 5 widths, 44dp dismiss target, panel usability, expansion gate, source wiring |
| `utils/exploreAccountScope.test.ts` | 7 | key stability across country push / tab switch, identity reset, default path scoping, guest/blank normalisation, wiring |

## Verification performed

```
npx tsc --noEmit                                                     # 0 errors
node --experimental-strip-types --test \
  utils/exploreWorldLayout.test.ts utils/exploreAccountScope.test.ts   # 13/13 pass
npm run test:unit                                                     # 725 tests, 171 suites, 0 fail
```

BOM/EOL scan over every touched file: no UTF-8 BOM, LF line endings.

### On-device re-test checklist (Samsung A50)

1. Explore → World → select Japan → **✕ is visible and clears the panel on first tap**
   (`uiautomator` close-target bounds must end left of `x ≈ 900px`).
2. With Japan selected the rail stays collapsed and still switches modes.
3. `Explore Japan` → Back → **World, Japan still selected**, Map/Globe unchanged.
4. Explore (World, Globe) → Home → Explore → **World + Globe**, same country.
5. Sign out (or switch account) → Explore starts at For You with no selection.
6. Repeat with a country that has activity so the panel CTA is fully exercised.

## Not addressed (unchanged, tracked in E2.5)

- **D3** globe drag jank (perf; needs a release-build profile).
- **D4** picker bottom safe-area inset, **D5** picker keeps its previous query,
  **D7** duplicated "Quiet right now" on the country page.

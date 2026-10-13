# Explore Implementation Audit — Scope, Evidence and Open Items

**Branch:** `audit/explore-implementation` (off `8700a44`). **Type:** read-only audit.
**This branch contains no changes to application code, migrations, tests or configuration.**

## 1. Purpose

Establish an evidence-based picture of the Explore surface before any implementation work in it:
what exists, what it is made of, where the specification and the code diverge, and which areas need a
deeper review. Findings below are limited to what the repository itself evidences; everything else is
recorded as an open item rather than an assertion.

## 2. Surface inventory (measured, not estimated)

**Routes (9):** `app/(tabs)/explore.tsx`, `app/explore/_layout.tsx`,
`explore/{challenge,country,play,treasure,meet}/…` (incl. `meet/video/*`).

| Route / file | Lines |
|---|---|
| `app/(tabs)/explore.tsx` | **937** |
| `app/explore/play/my.tsx` | 237 |
| `app/explore/_layout.tsx` | 17 |

**Components (16):** `ExploreGlobe` (312), `ExploreWorldCanvas` (331), `ExploreModeRail` (216),
`ExploreMediaTile` (175), `ExploreFilterWheel` (140), `ExploreDiscoveryCard` (138),
`ExploreMosaicRow` (124), `ExploreSearch` (111), `WorldSection` (87), `ExploreMosaic` (58),
`ExploreHeading` (52), `ExploreAccountBoundary` (12), `ExploreModeBar` (4), `exploreStyles.ts` (9);
plus `components/vault/world/{useCreatorWorld,creatorWorldLoader}.ts` (165 / 129) and
`components/play/{WorldArtifactsSection,WorldDropsShelf}`.

**Migrations touching Explore (14):** `20261003180000_explore_global`,
`…190000_explore_vault_preview`, `…200000_explore_for_you_ia`, `…120000_explore_play_system`,
`…120100_explore_treasure_gameplay`, `…160000_vault_storefront_preview`,
`…181000_vault_discover_worlds`, `…200100_creator_world_drop_rpcs`,
`…110400_legacy_visibility_helpers`, `…110500_private_viewer_helpers`,
`…110600_canonical_topic_visibility`, `…130000_arena_casual_questions`,
`…180000_explore_security_contract`, `…190000_world_read_security`.

**Automated tests covering Explore: none found.** Existing tests cover scripts, `utils/`, and the
isolated-Supabase tooling — no Explore routes, components or RPCs.

## 3. Initial findings (each one evidenced above)

| ID | Finding | Evidence |
|---|---|---|
| F1 | **A monolithic screen.** `app/(tabs)/explore.tsx` is 937 lines, against the project rule of ≤150 lines per file and "never generate monolithic screens" | file length |
| F2 | **Spec traceability gap.** `CLASH_SPEC.md` (1391 lines) contains **no** heading naming Explore; the surface is described indirectly ("For You" §251, "Create a discovery/community screen" §579, "Discover" §939) | spec grep |
| F3 | **Large, dedicated security surface.** Two Explore-specific security migrations plus three visibility-helper migrations | migration list |
| F4 | **No automated coverage** for any Explore route, component or RPC | test inventory |
| F5 | **Vocabulary drift** across the surface: `explore` (routes/files) vs `world`/`worlds` (components, migrations) vs `discover`/`for_you` (migrations) | filenames above |

These are stated as *observations to verify*, not as defects proven by reading every line. F1 and F5
are mechanical facts; F2–F4 are coverage gaps whose impact still needs assessment.

## 4. Audit plan (next pass, still read-only)

1. **Spec traceability** — map each Explore element to a spec clause; list unspecified behaviour and
   any element the spec requires but the code appears to lack. (Method: read the four named spec
   regions; build a traceability table.)
2. **Data access and RLS** — review `explore_security_contract`, `world_read_security`, and the three
   visibility helpers; confirm no world/creator/private row is reachable without entitlement, and that
   "legacy" helpers cannot widen a canonical policy. (Method: migration diff + policy enumeration.)
3. **RPC contracts** — enumerate every Explore RPC, its `security definer`/`search_path` posture, its
   grants, and its input validation; check for definer functions without `set search_path = ''`.
4. **Client/server boundary** — confirm no screen assumes a value the server does not own (counts,
   entitlement, ordering) and that every fetch path handles denial/empty/error distinctly.
5. **Decomposition risk (F1)** — identify which concerns inside `explore.tsx` are separable, and the
   smallest safe extraction order; no refactor is proposed on this branch.
6. **States and failure modes** — loading, empty, offline, signed-out (`ExploreAccountBoundary`), and
   partial-data rendering for each route.
7. **Cost and performance** — `ExploreGlobe` (312) and `ExploreWorldCanvas` (331) are the heaviest
   surfaces; review re-render triggers, list virtualization, and image sizes.

## 5. Deliverable and status

Subsequent passes will append findings here (or to a sibling file), each with the command or file that
evidences it. **This document is the audit's starting point: the surface inventory and the five initial
findings above. No conclusion about production readiness is drawn yet.**

Nothing in this branch was executed against hosted staging or production; no data, functions or
configuration were touched.

---

# Part 2 — Completed audit (the seven items)

**Correction to Part 1.** F4 as originally written ("no automated tests covering Explore") is
**wrong** and is retracted: the first inventory only scanned `scripts/`. Nine Explore logic suites
exist under `utils/` and run inside the project's own `test:unit` script, which I executed:

```
npm run test:unit  ->  # tests 539   # pass 539   # fail 0   (73 test files)
```

Explore suites: `exploreCountries`, `exploreForYouRank`, `exploreMosaic`, `exploreNav`, `exploreGeo`,
`exploreGlobeMath`, `exploreTeleport`, `exploreVaultVisibility`, `exploreWorldCanvas` (plus
`worldMapAdapter`, `vaultWorldPersonality`, `vaultWorldRows`, `creatorWorldDrops`). What is missing is
narrower, and is stated precisely in §6.6.

## 6.1 What already works (verified)

The whole data path is **server-first**: no Explore screen or component touches Supabase directly —
`services/exploreService.ts` (682 lines) is the only gateway, and it calls seven deployed RPCs.

| Capability | RPC | Client entry point |
|---|---|---|
| World globe data (countries, activity, challenge/treasure flags) | `get_explore_world_summary()` | `fetchExploreWorldSummary` (309) |
| Country page | `get_explore_country(p_code)` | `fetchExploreCountry` (345) |
| Global viral rail | `get_global_viral(p_limit)` | `fetchGlobalViral` (432) |
| Vault shelf (FREE/PREVIEW only) | `list_explore_vault_previews(p_limit)` | `fetchExploreVaultPreviews` (465) |
| For You feed + cursor paging | `get_explore_for_you(p_limit, p_cursor)` | `fetchExploreForYou` (499) |
| Live topics + takes | `get_explore_live(p_limit)` | `fetchExploreLive` (518) |
| Teleport / random discovery | `get_teleport_candidate(...)` | `fetchTeleportCandidate` (560) |
| Search (groups, countries) | `search_explore(p_query, p_limit)` | `searchExplore` (590) |

Also verified working in the screen: the five-mode IA (For You | World | Live | Play | Meet) driven by
`EXPLORE_MODES`, debounced search (280 ms) with grouped results, client-side filter chips
(all/trending/arena/vault/video/challenges), a virtualized For You feed packed into mosaic rows,
teleport history/memory helpers, and Play/Meet delegating to `PlayHomePanel` / `MeetHomePanel`
(explore.tsx 343–587). Loading, empty and error-with-retry states exist for the feed.

## 6.2 Incomplete, dead or disconnected

| Item | Evidence | Reading |
|---|---|---|
| `ExploreModeBar.tsx` — 4 lines | file length | Effectively empty; `ExploreModeRail` (216) is the real rail. **Verify it is referenced; if not, delete it** (dead code) |
| `ExploreAccountBoundary.tsx` — 12 lines | file length | A thin `withExploreAccount` gate; signed-out behaviour unverified |
| Mappers silently drop malformed rows | `toChallenge`/`toTreasure`/`toVaultPreview` return `null`, then `.filter(Boolean)` (336–340) | If a server field is renamed the UI degrades to **"Nothing here yet"** instead of surfacing a contract failure — the highest-value robustness gap |
| Two `get_explore_world_summary` definitions | `20261003180000` (188) then `20261003190000` (508) | Last definition wins; the client must match the **later** contract. Needs a parity check, not a rewrite |
| Route data flow | `treasure/[id]` 454, `challenge/[id]` 569, `country/[code]` 495, `meet/[sessionId]` 355, `play/my` 237 — each imports services, none calls `rpc(` directly | Layering is correct; **per-route rendering of live data is not verified in this pass** (open item) |

No Explore surface was found wired to a mock/placeholder service: every mode resolves through a
documented RPC. "Disconnected" applies to the two tiny components above, not to the feature set.

## 6.3 Security and RLS posture (read from the migrations; no new testing phase)

**Verified sound:**

* Every Explore RPC and helper is `security definer` with `set search_path = ''` — e.g.
  `explore_country_activity_count`, `explore_public_media_ready`, `explore_actor_hidden`,
  `world_drop_readable` (20261009180000 lines 4–35; 20261009190000 lines 10–29).
* Grants are explicit and narrow: `revoke all … from public` then `grant execute … to anon,
  authenticated` — anonymous discovery is intentional, and `explore_readable_challenges` /
  `explore_readable_treasures` are **revoked from every role** (20261009180000 line 66).
* Per-table policies were added for challenges, treasures, entries, results, participation, progress
  and reactions, all caller-scoped (same file, lines 40–52).
* The Vault shelf is limited to FREE/PREVIEW **public** media: the server returns only
  `publicMediaPath` via `explore_vault_preview_rows`, and the client applies
  `isExploreVaultVisible` / `normalizeExploreVaultAccess` as defence in depth (exploreService 285–307).
  No subscriber-only source path is reachable from Explore.
* Geography uses `profiles.public_country_code`, documented as explicit and public (service header).

**Residual risk (documented, not newly tested):**

* **Default privileges.** The security migration records that "explicit anon default privileges
  survived older REVOKE FROM PUBLIC clauses" and fixes it with a dynamic revoke loop (lines 152–165).
  The class recurs whenever a new function lands, so a *standing* check belongs in the existing
  migration-lint scripts — a follow-up recommendation, not a new phase.
* `search_explore` and the discovery RPCs are anon-callable with client-supplied limits; throttling is
  not evidenced here (recommendation R2 in the roadmap).
* Nothing in Explore reads device location; location handling lives entirely in the World service
  (§6.7), which documents server-side fuzzing and no position persistence.

## 6.4 Performance

| Surface | Lines | memo/useMemo/useCallback | Animation | Geo paths |
|---|---|---|---|---|
| `ExploreGlobe.tsx` | 312 | 5 | 0 | 0 |
| `ExploreWorldCanvas.tsx` | 331 | 7 | 1 | 4 |
| `ExploreMosaicRow.tsx` | 124 | **0** | 0 | 0 |

* **Feed — the real cost.** `FlatList` over *packed rows* with a varying-height hero span, **no
  `getItemLayout`**, and `ExploreMosaicRowView` is **not memoised** while `renderItem` builds a new
  element per row (explore.tsx 350–376) → every parent re-render re-renders every visible row.
  Row-level memoisation plus stable row heights are the cheapest wins.
* **Scroll — already correct.** `onScroll` only writes the shared value `headerCollapse` (no React
  re-render) and the header animates on the UI thread (282–297).
* **Globe/canvas — not a hot loop.** No per-frame animation; the cost is the `globePaths` / `land`
  geometry `useMemo`s and the SVG path count. Geometry helpers are pure and already tested
  (`exploreGlobeMath`, `exploreGeo`, `exploreWorldCanvas`), so hoisting them to module scope is safe.
* **Live rail.** A horizontal `ScrollView` renders all takes (bounded by `p_limit = 24`) — acceptable
  while the bound stays small.
* **Paging.** Cursor-based with a generation guard against stale pages (226–237) — correct.

## 6.5 Safe decomposition of the 937-line screen

Declared inside `app/(tabs)/explore.tsx`: `ExploreScreen` (78), `RoundControl` (610), `SearchHub`
(643), `styles` (822). The screen body is therefore ~530 lines of mixed state, fetching and layout.

Extraction order — pure moves first, so each step is verifiable by compiling and by the existing unit
suite before any behaviour is touched:

| Step | Move | Why it is safe |
|---|---|---|
| D1 | `SearchHub` (643–820) → `components/explore/SearchHub.tsx` | Already fully props-driven (`results`, `group`, `onGroup`, `onCountry`) — a move with no state |
| D2 | `RoundControl` (610–642) → `components/explore/RoundControl.tsx` | Dumb presentational component |
| D3 | `styles` (822–937) → `components/explore/exploreScreenStyles.ts` | Static `StyleSheet.create`; colours are applied inline |
| D4 | Mode panels → `ExploreForYouPanel`, `ExploreWorldPanel`, `ExploreLivePanel` (551–580) | Explicit props for data + handlers; all state stays in the screen |
| D5 | Teleport flow → `hooks/useExploreTeleport.ts` | Helpers already unit-tested (`exploreTeleport`) |
| D6 | Feed + summary → `hooks/useExploreFeed.ts`, `hooks/useExploreSummary.ts` | Target: the screen file ending below the 150-line project rule |

**Non-negotiable reuse.** `ExploreModeRail`, `ExploreMediaTile`, `ExploreDiscoveryCard`,
`ExploreMosaicRowView`, `ExploreFilterWheel`, `CountryPickerSheet`, `diversifyByCreator`,
`dedupeExploreItems`, `packExploreMosaicRows`, `EXPLORE_MODES` and `FOR_YOU_FILTERS` already exist and
are tested — decomposition must **move** code, never re-implement it. No second feed, ranking or
mosaic implementation may be introduced.

## 6.6 Missing automated tests (precise)

Present: pure logic — 539 tests green, including 9 Explore suites. Absent:

1. **No render/behaviour test of any Explore screen or component.** Nothing imports `app/explore*` or
   `components/explore/*` for rendering; the existing `*-check.cjs` scripts only scan component
   *source* statically.
2. **No service-boundary test.** `toChallenge`, `toTreasure`, `toVaultPreview` and `toViralItem` are
   untested — exactly where the silent-empty-state class in §6.2 lives.
3. **No contract-parity test** between the keys the mappers require and the columns the migrations
   return (the drift the two `get_explore_world_summary` definitions make likely).
4. **No test for `ExploreAccountBoundary`** (signed-out gate) or for the feed's loading/empty/error
   branches.
5. Accessibility helpers (`exploreModeAccessibilityLabel`, `forYouFilterAccessibilityLabel`,
   `isDuplicateForYouFilterLabel`) *are* tested — keep it that way while extracting.

## 6.7 Explore discovery vs World location-based experiences

Three different concepts share the word "world" — the clearest single source of confusion:

| Concept | What it is | Data path | Used by |
|---|---|---|---|
| **Explore World** (discovery) | Globe, country pages, teleport — **no device location** | `get_explore_world_summary`, `get_explore_country`, `get_teleport_candidate` (exploreService) | `app/(tabs)/explore.tsx` mode `world`, `app/explore/country/[code]` |
| **World** (location-based) | Missions + location-safe drops; precise coordinates go only into RPCs, the server fuzzes before persistence, `nearby` never stores the viewer's position; explicitly "no live markers, trails, heatmaps or background tracking" | `world_active_missions`, `world_mission`, `world_nearby` (worldService header, lines 2–9) | `WorldMissionCard/Beacon`, `WorldDropCard/Marker/Preview`; surfaced from `index.tsx` / `compose.tsx` — **not** Explore |
| **Creator World** (profile) | A creator's page and modules | `fetchCreatorWorld` + `useCreatorWorld` (`components/vault/world`) | Vault routes |

**Recommendation (documentation and navigation only):** keep the three separate and never merge their
state. Label the Explore globe as *discovery* (countries and themes, not "near me"); if a bridge is
wanted, add one explicit **Nearby** entry point in Explore's world mode that *navigates* to the World
missions surface. That preserves the current privacy posture — the fuzzing and no-persistence
guarantees live in `worldService` and must not be re-implemented in Explore.

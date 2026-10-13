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

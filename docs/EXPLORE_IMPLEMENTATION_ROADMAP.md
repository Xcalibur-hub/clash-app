# Explore — Implementation Roadmap

**Companion to** `docs/EXPLORE_IMPLEMENTATION_AUDIT.md` (branch `audit/explore-implementation`).
**Status:** proposal only — no implementation has begun.
**Prioritisation:** steps that change something a user can touch, or that unblock testing, come first;
pure refactors are front-loaded only where they are provably behaviour-free.

## Ground rules for every step

1. **One step, one testable claim.** Each step names the command that proves it.
2. **Move, never re-implement.** `exploreService`, `utils/explore*`, `ExploreModeRail`,
   `ExploreMediaTile`, `ExploreDiscoveryCard`, `ExploreMosaicRowView`, `ExploreFilterWheel` and
   `CountryPickerSheet` are the single implementations. No parallel feed/rank/mosaic code.
3. **No backend change** in P0–P2 — no new RPC, migration, hosted call or configuration change.
4. **Green gate:** `npm run typecheck` and `npm run test:unit` (539 tests) stay green after every step,
   and each step's own new test is added to `test:unit`.
5. **Reversible:** one commit per step, revertible alone.

## Phase P0 — Unblock testing (zero behaviour change)

**S1 — Extract `SearchHub`.** Move the component at explore.tsx:643–820 into
`components/explore/SearchHub.tsx`; the screen keeps `searchResults`/`searchGroup` state and passes the
same four props. *Done when:* it is imported back, `npm run typecheck` passes, and a new `SearchHub`
render test asserts group switching calls `onGroup` and a country row calls `onCountry`.
*Not done:* no styling change, no prop rename.

**S2 — Extract `RoundControl` and the style module.** `RoundControl` (610–642) →
`components/explore/RoundControl.tsx`; the `styles` block (822–937) →
`components/explore/exploreScreenStyles.ts`. *Done when:* typecheck passes and a static length check
confirms the screen shrank by exactly the moved ranges.

**S3 — Delete dead code if it is dead.** Confirm whether `ExploreModeBar.tsx` (4 lines) is referenced
anywhere; if not, delete it. *Done when:* a repo-wide grep returns no import and the suite stays green.
If it *is* referenced, keep it and record why.

## Phase P1 — User-visible robustness (small, high value)

**S4 — Service-boundary tests.** Add service mapper tests covering the challenge, treasure,
vault-preview and viral mappers with valid, partial and wrong-type payloads. *Done when:* the tests pin
the current null-dropping behaviour and run inside `test:unit`. This is the regression net for the
silent-empty-state risk (audit §6.2).

**S5 — Surface a contract failure instead of "Nothing here yet".** When a payload contains items but
every mapper rejected them, set an error state ("Could not read Explore data") rather than the empty
copy. *Done when:* a unit test over the decision helper asserts items-present-but-all-dropped → error,
while a genuinely empty payload → empty copy.

**S6 — RPC contract-parity check.** A static check (in the style of the existing `scripts/*-check.cjs`)
that every key a mapper requires appears in the corresponding migration definition — including the
**later** `get_explore_world_summary` (20261003190000) that supersedes 20261003180000. *Done when:* the
check runs green and fails if a required key is renamed.

## Phase P2 — Interactable features (the feed and its panels)

**S7 — Memoise the mosaic row and stabilise row heights.** `React.memo` the row view, hoist the
`renderItem` callback, and give rows deterministic heights where spans allow. *Done when:* a render test
counts row renders across a parent state change and shows the count no longer grows with feed size;
feed behaviour unchanged.

**S8 — Extract `ExploreForYouPanel`.** FlatList + filters + load-more, with data and handlers passed
in. *Done when:* a render test covers loading, empty, error and `onEndReached` paging, and the screen
file shrinks accordingly.

**S9 — Extract `ExploreLivePanel`** (topics + takes rail, including its empty state, explore.tsx
541–580).

**S10 — Extract `ExploreWorldPanel` + `useExploreWorldSummary`.** Globe/canvas stay as they are; only
the panel and its data hook move. *Done when:* a test asserts country selection calls `goCountryPage`
and that a failed summary shows retry rather than an empty globe.

**S11 — `useExploreTeleport` hook.** Move teleport state, fetch and history into a hook. *Done when:* a
test covers success, failure-with-retry and history read/clear (the pure helpers are already tested).

## Phase P3 — Boundary clarity (documentation + navigation only)

**S12 — Document the three "world" concepts in code** (audit §6.7): a doc comment on
`exploreService`'s world functions, on `worldService`, and on `components/vault/world`.
*Done when:* comments are merged and no behaviour changes.

**S13 — One explicit "Nearby" entry point.** In Explore's world mode, add a labelled control that
**navigates** to the existing World missions surface. *Done when:* the destination is the existing
route (no new screen), state is not merged, and a test asserts the navigation target.

**S14 — Finish decomposition.** Extract the remaining hooks and confirm `app/(tabs)/explore.tsx` is
under 150 lines, with a static length check added to the existing check scripts so it cannot regress.

## Explicitly out of scope

* New security testing — the audit reads existing contracts only. The single standing recommendation is
  a default-privileges lint appended to the existing migration checks (*recommendation R2*), at the
  owner's discretion.
* Any change to the location-based World service, Creator World, or their privacy guarantees.
* Backend changes: no new RPC, migration, hosted call, cron or quarantine action.
* Rewrites for their own sake — the 539-test logic layer is green and stays the reference.

## Suggested first step

**S1 — Extract `SearchHub`.** A pure, props-driven move inside the largest file, needing no new
abstraction, which also produces the first render test for the Explore surface — the pattern that then
serves S2 and S8–S11.

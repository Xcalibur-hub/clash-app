# Phase 5B — final UI integration corrections

27 October 2026. Original checkout `C:\Users\91962\Desktop\Clash`, `arena-ui-review`, unchanged HEAD **`cbe216a3c212a83c432f71b37b59a1debe5caa63`**.

**The three targeted corrections are implemented. TypeScript, full npm tests, the new regressions, Duel/render and repaired settlement-history checks pass. Native Live/Groups/Discover navigation and bounded scrolling checks pass within the available data. The expanded optional legacy Live V2 suite still has two independently reproduced pre-existing harness failures. Therefore the complete expanded check set is not all green. NO-GO for public release; conditional GO for review of these uncommitted integration corrections.** No settlement, security or production acceptance is inferred.

## Exact corrections

### Live scrolling

`app/(tabs)/index.tsx` now gives `clashes` a bounded `flex: 1` View. Only `community` and `topics` use the parent vertical ScrollView. `ArenaClashes.tsx` is unchanged and retains its FlatList, pull-to-refresh, bounded discovery snapshot, onEndReached and bottom padding. The prior Groups/Discover scrolling and `ArenaSideRail` stacking/touch correction remain intact.

`scripts/ui-phase5b.test.cjs` mounts the production Arena screen with React, drives its real rail callback through Live → Groups → Discover → Live → Home, and inspects the resulting ancestors. It also mounts the production ArenaClashes with the parent's actual props to assert a bounded FlatList with refresh/pagination handlers and dock padding. Native/services are controlled boundaries; this is not a native list-performance test. The obsolete combined-condition assertion in `arenaHomePresentation.test.ts` and whitespace/old-two-branch assertion in `arena-live-v2-check.test.cjs` were updated. Neither is the primary proof of scroll ownership.

### World fallback reads

`app/world/index.tsx` tracks Mission read status separately from Drop loading/searching/failure. Initial Mission and Recent Drop reads start independently; a Mission failure no longer prevents the Drop request. Each completion/error observes its existing request generation. Focus/unmount invalidation, location consent, map filtering and pagination/query contracts are preserved.

`WorldMapUnavailable.tsx` uses the existing themed `ReadFeedback` component. Empty Mission/Drop copy requires that section's successful read. Loading/error never masquerades as empty. Each error has its own wired Retry action; Mission retry does not reread Drops, and Drop retry does not reread Mission metadata. The other section's successful content remains visible. No MapView opt-in, fake pins or fabricated content was added.

Four new mounted screen/component tests exercise deferred reads, both successful-empty states, populated partial success in both directions, both failures, actual visible Retry callbacks, successful recovery and departure cancellation. Existing World runtime tests were adjusted only where they assumed sequential startup: they now resolve both original in-flight reads and continue to assert no post-departure writes or stale refocus results. All 36 runtime cases pass.

### Settlement-history harness

Before the fix, the unchanged script passed nine service checks, then failed with `Invalid hook call` / `Cannot read properties of null (reading 'useSyncExternalStore')`. Its custom hook-cell runner manually invoked the production hook without a React dispatcher.

The script now reuses `arena-mounted-room.cjs`: actual React/ReactDOM mount, `React.act` for refresh, and unmount in `finally`. The historical message double now uses the existing complete message factory, including `reactions`; the current production transcript store freezes/validates those fields. All nine settlement/service assertions and both historical-read assertions remain: a nonmember can retain the readable settled Room while transcript/evidence stay locked; a subsequently authorized refresh unlocks the historical transcript. **11/11 pass.** No production settlement hook/service was modified and no real settlement was executed.

### Acceptance classification

The [Phase 5A report](PHASE_5A_REPORT.md) now recognizes [Phase 4H.2](../ui-completion-phase4h-groups/PHASE_4H2.md) as the later native **Members read/About↔Members/Back/re-entry PASS**. It removes the superseded unresolved Members claim from triage and next tasks. Groups membership mutations, new discussion features and broad theme/accessibility coverage remain unaccepted. Phase 5A's historical integration findings/test outputs are retained as historical evidence; this report supplies their correction status.

## Automated results

Tests execute the current working tree. Counts overlap; do not add them as unique coverage. All requested checks use offline/native/service doubles and no database mutations.

| Command / suite | Actual result |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS, exit 0 |
| `npm test` | PASS **816 unit + 239 lifecycle/UI = 1,055**, zero failures/skips |
| `node --test scripts/ui-phase5b.test.cjs` | PASS **5/5**; included in npm test |
| Focused Room text/runtime chrome/Crowd focus/Vault collection/Take profile/reaction/World accessibility, plus new Phase5B suite | PASS **29/29** |
| `node --test scripts/personalized-live-discovery.test.cjs` | PASS **16/16** |
| GroupDiscovery + Take detail + Take challenge + legacy Live V2 | **48 PASS / 2 FAIL of 50**; details below |
| `node --test scripts/arena-design-check.test.cjs` | PASS **17/17**, controlled dark/light and responsive rendering |
| `npm run test:duel` | PASS **29/29** |
| `npm run test:duel:render` | PASS **22/22**, controlled render scenarios |
| `node scripts/settlement-history-check.cjs` | PASS **11/11** |
| `node scripts/official-service-check.cjs` | PASS **14/14** |
| `node scripts/world-discovery-runtime-check.cjs` | PASS **36/36** |
| World consent / empty / pan / request-order scripts | PASS **8 / 13 / 8 / 21**, source contracts only |
| `git diff --check` | PASS, exit 0; configured LF/CRLF notices are not whitespace errors |

Expanded focused command:

```text
node --test components/arena/groups/GroupDiscovery.test.cjs scripts/take-detail-check.test.cjs scripts/take-challenge-check.test.cjs scripts/arena-live-v2-check.test.cjs
```

Remaining failures in `scripts/arena-live-v2-check.test.cjs`:

- Line 36, “demo keyboard avoids stale Android offsets…”: source regex expects `developerOpen ? <DemoSheet` directly. Existing DemoArena composition no longer has that exact spelling/shape. This is not a demonstrated keyboard failure.
- Lines 38–51, “compact Stage gives all free space…”: the old native double lacks `useWindowDimensions`, so invocation fails before its layout assertions. The production Stage and demo files are unchanged by Phase5B.

An in-memory run of these two tests from the **original committed harness** reproduces both failures against the unchanged pre-existing component files (`legacy-baseline.log`: **0/2**). Their unrelated harness repairs are deferred rather than changing Stage/demo production behavior or suppressing assertions. The directly relevant obsolete Live-parent assertion was corrected and passes; its production-composition counterpart also passes.

File-free fault injection independently restored (a) the original Live outer ScrollView and (b) unconditional Mission empty copy in memory. The new suite failed respectively **1** and **3** tests. No source was replaced on disk. Local outputs: `.expo/phase5b/fault-results.json`, `fault-live-parent.log`, `fault-world-empty.log`.

## Samsung A50 native evidence

Device **SM-A505F**, serial **RZ8M30DE9NL**, installed **com.clash.v2.dev 2.0.0 / versionCode 1**, DEBUGGABLE. Existing sole Metro listener **PID 10920, 127.0.0.1:8081**, manifest project root verified as the original checkout. No restart, cache reset, reinstall or native rebuild.

QA identity endpoint verified `clash-ui-qa-phase4a` at **127.0.0.1:55481**. Read-only database checks: system identifier **7700622043081482277**, application/Storage/Auth/Realtime ledgers **111/74/82/88**, cron **off**. Runtime Auth context confirmed existing fictional A signed in; actual Supabase client URL remains QA55481. Cached native development bundle has the matching public QA key and none of the three checked QA server-secret values. No key value is included here.

**Execution evidence boundary:** Metro Fast Refresh delivered the changed Arena composition: the active `ArenaClashes` fiber has `ArenaScreen → View/RCTView → View/RCTView` ancestors, with no ScrollView above it, and its own FlatList/VirtualizedList below. This matches the new branch and differs from the pre-correction combined ScrollView. Groups/Discover use their separate ScrollViews, and mode changes were observed after real taps. This is actual device execution, not host compilation alone. A fresh cold/full JS reload was not performed. The on-disk cached full bundle (23,808,542 bytes, SHA256 `1747b3c74aa5098ca794a79631b471a88c5bd34cd2a29713ffe97a37b17de3e0`) predates the new World callback marker. **No new World native read-state or cold-bundle acceptance is claimed.**

| Native check | Result and exact limit |
|---|---|
| Crew detail Back to Arena Groups | PASS, measured real Go back action; retained auth/QA target |
| Groups → Live → Discover → Groups → Live | PASS, real rail taps; runtime modes `community/clashes/topics` match |
| Live scroll owner | PASS structural execution: bounded View above ArenaClashes, own list below; bottomPadding **148dp** |
| Live populated rows / windowing / pagination / Watch | BLOCKED: actual successful snapshot displayed **No live Clashes in this snapshot**. No replacement duel created |
| Groups content and vertical scrolling | PASS, existing fictional QA Repair Circle visible; scrolling exposes pagination/status and Back to Home above dock |
| Discover vertical scrolling | PASS, real catalogue nodes and lower questions/discussions presentation; scrolling moves lower content above dock |
| Rail targets after scrolling | PASS, rail remains reachable. Live `[269,276,452,402]`, Groups `[468,276,700,402]`, Discover `[716,276,970,402]`, raw px; **126px / 2.625 = 48dp** tall |
| Dock/system navigation | No overlap of measured destination actions; dock bottom **y2213**, system navigation starts **y2214**. Full content ScrollViews extend under dock by design and use content padding |
| Groups Members/membership mutations | Later4H.2 read/navigation PASS recognized; no new mutation acceptance or writes here |
| Light / 1.3× / keyboard / populated Live | NOT TESTED this pass; native captures are dark, font scale 1.0. Prior bounded passes remain historical |
| World loading/failure/retry/partial-success | PASS automated component/callback checks only; NOT TESTED natively in this pass |

All private screencaps are genuine ADB native **1080×2340** PNGs, unchanged. Relevant local paths:

- `.expo/phase5b/02-groups.png` — populated Groups before scroll.
- `.expo/phase5b/03-live.png` — current empty Live and controls.
- `.expo/phase5b/04-discover.png` — current topic map.
- `.expo/phase5b/05-discover-scrolled.png` — lower Discover content reachable above dock.
- `.expo/phase5b/06-groups-scrolled.png` — lower Groups controls reachable above dock.
- `.expo/phase5b/07-live-return.png` — returning to Live after both scrolling destinations.

`01-before-back.png` records the retained crew screen at entry. Native raw bounds and sanitized fiber/route observations are in the corresponding `.json` files; screenshot bytes/dimensions/hashes in `.expo/phase5b/screenshot-manifest.json`. Screenshots were visually inspected for nonblank content and requested state. All remain ignored/private; none staged or published. The collector is the reviewed read-only UiAutomation helper, compiled as a standalone inspection JAR, **not an app build or installation**.

## Change boundary and preservation

Exact Phase5B source/test/config paths:

1. `app/(tabs)/index.tsx`
2. `app/world/index.tsx`
3. `components/world/WorldMapUnavailable.tsx`
4. `scripts/settlement-history-check.cjs`
5. `scripts/ui-phase5b.test.cjs` — new, untracked
6. `scripts/world-discovery-runtime-check.cjs`
7. `scripts/arena-live-v2-check.test.cjs` — Live-parent assertion only
8. `utils/arenaHomePresentation.test.ts`
9. `package.json` — include new suite in existing npm test command

Evidence changes: the specifically requested Phase5A classification correction and this report. The [36-file Phase5A manifest](UI_CHANGE_MANIFEST.md) remains preserved as the original inventory, not an updated stage command. Phase5B adds six previously clean/new source/test paths, bringing the source/test/config candidate boundary to **42**; no staging has occurred.

At entry: **27** tracked modifications, **2,295** untracked files, stage empty. At handoff: **32** tracked modifications, **2,297** untracked files (new test and this report), stage empty. Of the 2,322 entry pending files, only the three intended existing source/test/config files and the requested Phase5A report changed; every other entry file hash matches. All **1,920 original unrelated untracked baseline hashes** match. All **111 frozen application migration hashes** match. Commits `6ca9222` and `cbe216a` remain ancestors of unchanged HEAD. The production Room hook, settlement services, ArenaClashes, rail fix and accepted Arena/Vault/Meet changes were not overwritten.

Device preference bytes, system font scale, night setting, `.env`/`.env.local` hashes and ADB reverses **8081/55481** match the captured baseline. Existing A authentication and actual QA target remain intact. Final app surface is Arena Live at `/`; navigation was exercised, not restored to the entry crew-detail route. QA system ID, all four ledger counts, postmaster start time, cron-off, cron-run count, Auth-user count and Storage-object count are unchanged. Normal SDK/session behavior is not a claim of byte-identical authentication storage or every database row. No fixture or application mutation was requested/performed; no shared/hosted/E3.5.7 operation, infrastructure change or source commit occurred. The task-owned inspection JAR remains recorded under `/data/local/tmp` in `.expo/phase5b/inspector.json`; app data/configuration is untouched.

## Remaining gates / stop

1. Review these uncommitted corrections; separately repair the two old Live V2 harness failures before calling the entire expanded suite green.
2. Populated Live virtualization/refresh/pagination/Watch needs a valid authorized fixture. Do not create another timed duel automatically.
3. World read-state native acceptance, light/large-text breadth and cold-start execution are not added by this pass.
4. Phase5A release gates remain: font-change route reset/release artifact behavior, authoritative Clash conclusion, unaccepted Play/Vault/Groups mutation/access flows, release-target environment/operations and Meet policy/compatibility.

No commit, push, merge or deployment. Stop after Phase5B.

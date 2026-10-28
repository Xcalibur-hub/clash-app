# UI Phase 3D — Explore failure versus empty states

25 October 2026. **Code/tests: PASS. Samsung A50 offline failure recheck: PASS for both fixes.** Successful-empty/populated responses are verified with offline mocks, not a live backend.

Original checkout `C:\Users\91962\Desktop\Clash`, branch `arena-ui-review`. Starting HEAD verified **6d677144df7349bc798cba7cc13a738ac9767500**, tracked/staged tree clean. Read `.clinerules`, `CLASH_SPEC.md` and Phase 3C evidence. One scoped local implementation commit is created after validation; its resulting SHA is reported in the completion response. No push or merge.

## Correction

The initial Explore request used `Promise.all` for World and For You. A failure prevented either result being adopted, while both views could describe their empty arrays as successful empty results. Pagination failures also escaped into the shared header and could automatically trigger another initial-page read through `onEndReached`.

- **For You:** independent feed success/error state; successful-empty copy requires a completed successful read and zero eligible rows. Failure uses the existing `ReadFeedback` error/retry presentation. Existing rows remain visible during explicit retry and after pagination failure. Failed reads cannot cause automatic pagination retries. Filters, virtualization, cursor ordering and existing route contracts remain.
- **World:** its existing summary service now uses the existing `useRetryableRead` hook independently. `WorldExperience` receives the actual status and retry callback. Loading/error/denied/unavailable states cannot become “No public activity.” That message appears only after a successful zero-activity result. Retry temporarily withholds activity metadata until the new response is ready; it never invents pins or counts.
- **Navigation:** map, country picker and existing selection callbacks remain. When a country is selected but activity is unavailable, explicit Explore/Clear country controls remain available without claiming that country has zero activity. Successful activity retains the existing country panel.
- **Isolation:** World retry does not reread For You; feed retry does not reread World. Background feed errors no longer appear over World, Live or Play. Existing independent Live/Play reads are unchanged. Search/Teleport operation errors retain their own handling.

Changed implementation/test paths:

1. `app/(tabs)/explore.tsx`
2. `components/explore/WorldExperience.tsx`
3. `scripts/explore-read-states.test.cjs` — new behavioral regressions
4. `scripts/ui-completion-harness.cjs` — one-line support for imports that already include `.ts`/`.tsx`
5. `package.json` — registers the new suite in `npm test`; no dependency changes

No service, schema, authentication, Meet lifecycle, World geometry or unrelated design changes.

## Automated verification

| Command/check | Actual result |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS, exit 0 |
| `node --test scripts/explore-read-states.test.cjs` | PASS, **8/8**, zero failed/skipped |
| `npm.cmd test` | PASS, **806 unit + 232 follow-up = 1,038**, zero failed/skipped, exit 0 |
| `git diff --check` | PASS |
| In-memory original For You guard restored | Expected RED: **2 failed / 6 passed**; production source reads mutated in all eight test cases, no file mutation |
| In-memory World status guard removed | Expected RED: **3 failed / 5 passed**, no file mutation |

The eight focused tests are included in the 1,038 total. They mount the production Explore component/hooks with deferred service promises and mocked native/visual boundaries. World presentation and retry callbacks are executed from production code. Coverage includes loading, failed read, successful empty, populated results, eligible-filter emptiness, isolated retries, selected-country navigation during failure, retained rows after pagination/retry failure, suppression of repeated end-reached reads, Live/Play parent-state isolation and unmount cancellation. Existing full-suite tests also exercise the real independent Live/Play components. These are not database/RPC or native successful-data tests.

Initial test runs exposed the harness's explicit-extension resolution issue, whitespace normalization and a real country-name expectation; these were corrected. The first feed fault probe targeted the shelf condition rather than ListEmptyComponent, and another probe encountered mixed line endings. The final probe targets the actual ListEmptyComponent guard and fails behaviorally as recorded above. No assertions or application guards were weakened.

[Exact validation results and source hashes](validation.json). Raw logs remain private under `.expo/ui-completion-phase3d-20261025/`.

## Fresh native execution and actual recheck

Reused the authorized, unlocked **Samsung SM-A505F**, existing `com.clash.v2.dev` installation and single **Metro PID 10428**, **127.0.0.1:8081**. Backend configuration remains **http://127.0.0.1:55471**, with no listener/backend startup and no shared 55321 fallback.

The initial peer guard found an additional unlabeled diagnostics connection and stopped **before** sending a reload. Read-only enumeration identified exactly one A50 app peer. Using the installed Metro protocol, one correctly originated **targeted reload notification** went only to that peer (`socket#0`); the unknown peer was untouched. No origin bypass, preference edits or Metro restart.

- Fresh Android HTTP **200**, **23,780,079 bytes**, SHA-256 **38daba53cda80949c1572e409f4ca2b3fac0d6d79fa79be42a5e700dec4f16c4**.
- Updated native cache **23,779,415 bytes**, SHA-256 **930e73d3cbacd53527f4f9307fa8c19dd996779ce58b03cfd25115aadb680aa0**.
- Response and cache contain the new feed success/error state and World status wiring. Source hashes were recorded before assessment and verified unchanged before commit. Native cache/HTTP byte equality is not claimed.
- Normal onboarding Skip and Explore navigation were used. The actual new error text then rendered in native hierarchies, establishing execution of the patch beyond bundle compilation.

| Native check | Result | Evidence |
|---|---|---|
| For You failure | PASS | **Couldn't load Explore feed. This is not an empty result.** Retry present; “Nothing here yet” absent. |
| For You retry | PASS | Actual Retry Explore feed press; explicit failure remains while backend is offline; contradictory copy absent. |
| World failure | PASS | **Couldn't load World activity. This is not an empty result.** Retry present; “No public activity to map yet” absent. Map/Search/Teleport controls remain. |
| World retry | PASS | Actual Retry World activity press; correct failure state remains. No backend data fabricated. |
| Return to For You | PASS | Actual For You press after World retry; correct feed error/retry remains, not World copy or successful emptiness. |
| Successful empty/populated backend responses | BLOCKED natively | Backend intentionally offline; covered by deferred offline tests only. |
| Full map navigation/entitlements/backend authorization | BLOCKED / outside this recheck | No fixtures or backend changes authorized or used. |

[Native response, cache, source identity and hierarchy assertions](native.json).

## Screenshots and preservation

BEFORE evidence remains the actual Phase 3C captures `13-discover-owner.png` (Explore For You) and `19-world.png`, referenced by the Phase 3C report. They were not recreated or edited.

Six real 1080×2340 AFTER/launch captures remain private. Relevant fix captures:

```text
C:\Users\91962\Desktop\Clash\.expo\ui-completion-phase3d-20261025\sanitized\02-for-you-after.png
C:\Users\91962\Desktop\Clash\.expo\ui-completion-phase3d-20261025\sanitized\03-for-you-retry.png
C:\Users\91962\Desktop\Clash\.expo\ui-completion-phase3d-20261025\sanitized\04-world-after.png
C:\Users\91962\Desktop\Clash\.expo\ui-completion-phase3d-20261025\sanitized\05-world-retry.png
C:\Users\91962\Desktop\Clash\.expo\ui-completion-phase3d-20261025\sanitized\06-for-you-return.png
```

Original PNGs and XML are alongside the sanitized directory. Review copies mask the top 650px notification-prone region and bottom 144px system strip without resizing; originals are unchanged. The broad top mask can conceal part of the For You feedback, so its exact native text is independently asserted in the XML evidence. Black areas are redactions, not blank app UI. [Dimensions, paths and hashes](screenshot-manifest.json). No raw screenshots, bundle bodies, device logs or credentials are staged.

Saved development preferences and USB reverse mappings remain **byte-identical**; appearance unchanged; normal guest Arena left open. No login/logout, account operation, message, match, purchase, fixture, database operation, backend startup, reinstall, data clearing, native rebuild, permission reset, cache reset, push, merge or deployment. All **1,695 pre-existing untracked files** are preserved; only explicit scoped paths are committed.

**GO for this scoped local UI fix.** Broader native completion, working-backend acceptance and production readiness are not established. Stop after the single local commit.

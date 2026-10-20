# Step 6G.5A.6 — per-message application ordering

Baseline: `f73c2a733747f8e0deb5751e5b9d48a25a62d03c`, branch `arena-ui-review`. Tracked/staged state was clean and the 17 unrelated untracked entries were verified before work. This checkpoint fixes the two application-ordering findings only; no Step 6G.5B primitive or scheduler work is included.

## Ordering model

Operation acceptance and React updater execution are separate events. Authoritative visibility responses establish removals immediately when their checked-ID response is accepted. Authoritative null reaction reads establish absence for their single message ID. Both use the existing visibility barrier, while retaining their different sources and checked scopes.

`VisibilityBarrier.mark` still invalidates existing admission tickets and maintains the same bounded tombstone watermark. It now also returns a deferred removal function. At execution, that function removes its checked IDs only if the existing live-admission registry has no later authorized admission for the ID. Any registry entry present after `mark` necessarily belongs to a later admission: `mark` removed all earlier entries. Another later removal clears that new entry again. This makes removal/reintroduction ordering depend on accepted authority rather than updater execution order, without another revision map or relying on retained tombstones. Filtering remains per ID and preserves pending placeholders.

Non-null reaction-only writes receive application tickets through `SnapshotGuard.beginReactionWrite`, using the guard's existing monotonic sequence. This orders optimistic, success, rollback and authoritative read writes by their local acceptance into the cache writer. A newer write invalidates the previous ticket for that message immediately. Updaters check their captured mounted/access generation and ticket at execution. They still map existing rows only and cannot insert a missing row.

When a full-row snapshot actually accepts its reaction fields, its newer read token also invalidates any older reaction-only application ticket. Existing pending-mutation, authoritative reaction, applied-snapshot and eviction barriers continue to decide whether that snapshot may accept reactions. A newer reaction mutation continues to protect against an older full-row read through the existing committed barrier. Body/moderation ordering remains the Step 6G.5A.5 local read-start policy.

Null writes invalidate previous reaction application tickets but use the visibility removal function for deletion eligibility. A later full-row admission can therefore supersede null deletion without making a non-null reaction-only write a full-row visibility admission. Later authoritative removals still dominate earlier admissions.

The latest reaction application ticket for each affected ID survives eviction from the 256-entry snapshot metadata map. Otherwise eviction could discard an already accepted deferred write. A newer accepted snapshot or scope reset releases it. This registry is proportional to distinct reaction-written IDs retained in the current scope, not capped at 256. Resetting these application tickets does not reset snapshot sequencing or complete a user mutation.

## Executed before-fix RED

Before production changes, the expanded callback suite executed **50 tests: 45 passed, 5 failed, 0 cancelled**, exit 1. All original 41 tests remained green.

1. R1: fresh `gap1` hydration was erased by the old visibility removal. After completing 50-message recovery and another refresh, `gap1` remained absent with cursor `gap50`.
2. R2: a real null reaction read queued deletion; newer authorized hydration applied; the old null updater erased it.
3. R3: two actual serialized toggles produced final cache count 1/selected true under reversed state application, instead of 0/false.
4. R4: later authoritative reconciliation was overwritten by queued mutation writes.
5. R4: an older queued authoritative reconciliation overwrote a later mutation result.

Transport is mocked; callbacks and the mutation bridge, reaction queue, visibility barrier, snapshot coordinator and recovery drain are actual production code. Toggle counts refer to simulated transport calls, not live RPC operations.

## Production changes

- `utils/transcriptOrdering.ts`: extend `mark` to return a removal function that consults existing admission eligibility at application time. Whole-request admission, stable accepted batches and the 500-ID pruning floor remain unchanged.
- `utils/reactionSnapshots.ts`: accept/invalidate reaction application tickets in the existing coordinator; coordinate newer accepted snapshots with those tickets; provide ticket-only scope reset independently of mutation ownership and bounded snapshot-entry eviction.
- `hooks/useLiveArenaRoom.ts`: use the returned removal functions for visibility and null-row deletion; validate non-null reaction tickets inside deferred updates; reset application tickets on private-thread invalidation, room initialization and unmount. Execution-time scope checks remain in place.

The drain, cursor progress, page/read bounds, mutation bridge and reaction queue implementations are unchanged. No automatic reaction toggle replay, mutation completion change, RPC/interface change, permission change, route/UI change, Crowd/Next-Clash change or overflow mechanism replacement.

## Deferred and reversed outcomes

All **54 callback tests** pass. Added coverage verifies:

- Full 50-message recovery with fresh readmission overtaking an older visibility removal: all rows present, cursor `gap50`, pending placeholder retained and no duplicate IDs.
- Real authoritative null reads: fresh reintroduction survives an older queued deletion; without reintroduction, deletion still removes the stale row without issuing a toggle.
- Two serialized actual toggles: final 0/false under reversed application, exactly two simulated toggle calls, exactly two completions and no pending mutation.
- Mutation/reconciliation interactions in both directions, using the actual queue.
- Full-row snapshot/reaction-only write interactions in both directions.
- Execution-time generation/unmount rejection.
- Later authoritative eviction after reintroduction.
- Deferred latest reaction write surviving snapshot-entry eviction after 264 actual hydration insertions.
- Removal after watermark pruning preserving only the readmitted ID while removing another genuinely evicted ID and preserving placeholders.

One additional snapshot unit test verifies that application-ticket reset cancels deferred writes without completing or releasing a pending user toggle. Existing first-insertion, body freshness, cursor, empty/excluded-page and placeholder tests remain unchanged and pass.

## File-free sensitivity

Each fault was applied only in child-process memory, required a matching executed source transformation, and ran all 54 callback tests. All exited 1 with no cancellations.

| Disabled protection | Passed | Failed |
|---|---:|---:|
| Visibility removal ordering | 52 | 2 |
| Null-removal ordering | 53 | 1 |
| Reaction application ordering | 48 | 6 |
| Deferred reaction scope validation | 51 | 3 |

The removal faults target their respective production callback branches independently. The scope fault removes the execution-time guard while leaving ticket and visibility protection intact. Direct generation/unmount cases avoid reset masking the missing guard.

## Validation

| Check | Result |
|---|---|
| Expanded callback suite (within lifecycle validation) | 54 passed |
| Focused transcript/reaction/eviction suites | 35 passed / 21 suites, exit 0 |
| Full `npm.cmd run test`, unit portion | 617 passed / 150 suites, exit 0 |
| Full `npm.cmd run test`, lifecycle portion | 64 passed: 10 presentation + 54 recovery/composer, exit 0 |
| TypeScript `--noEmit --incremental false` | Passed, exit 0 |
| Duel tests | 29 passed, exit 0 |
| Duel render smoke | 22/22 passed, exit 0 |
| `git diff --check` | Passed |

Counts overlap. Existing Node experimental/module-type and render `pointerEvents` warnings remain. Node tests required execution outside the filesystem sandbox because of workspace path-resolution permissions. No live service, database, migration, device or Metro operation occurred.

## Limits and delivery

These are controlled functional-updater simulations, not mounted React, native or backend acceptance tests. Arbitrary reversal does not prove every React priority-lane/rebasing behavior. The snapshot coordinator retains its existing stateful updater model. No new server freshness guarantee is claimed: body/moderation still use conservative local ordering, and reaction application tickets order local write acceptance rather than server transaction revisions. In-flight transport is not cancelled. Existing overflow recovery defects and scheduling remain outside scope.

All 17 unrelated untracked entries remain untouched. Only the three production files, existing callback test script, snapshot test file and this report belong to the single local commit. Its exact SHA is returned in the delivery response. No push, merge, reset, stash, clean, branch/worktree change, scheduler implementation or Step 6G.5B work. Stop after Step 6G.5A.6.

# Step 6G.5A.4 — stable recovery admission with deferred state updaters

Baseline: `d090f3cbeb47ac811c380016ade6e649c22e41c6`, branch `arena-ui-review`. This checkpoint addresses only the deferred recovery-admission race. Step 6G.5B is not implemented.

## Executed RED evidence

Before changing production code, the expanded callback suite ran **24 tests: 21 passed, 3 failed**, exit 1.

- The first 40-row page was accepted and the cursor advanced to `gap40`. Its state updater remained queued while the next response was pending. Six actual visibility-reconciliation calls evicted 501 distinct loaded rows and raised the pruning floor. Flushing the queued updater produced **0 of the 40 accepted rows**, failing the required count of 40.
- Generation invalidation before queued execution allowed a stale insertion.
- Unmount before queued execution allowed a stale insertion.

The existing 17 tests stayed green; their synchronous state setters had not exercised these interleavings.

## Production correction

`hooks/useLiveArenaRoom.ts` now computes `admittedRows` synchronously after the whole-request admission check and before enqueuing the merge or advancing the cursor. The queued updater uses that stable accepted batch; it does not re-evaluate whole-request visibility admission against a later watermark.

The updater still checks mounted state and access generation when executed, and still calls the reaction snapshot coordinator at execution time. Newer reaction count/selection therefore remain protected. Later authoritative visibility removals remain queued after the accepted merge and remove their checked IDs in state-update order; the frozen batch does not override those removals.

No changes to the drain API, page/read limits, RPCs, visibility predicates, composer ownership or scheduler were required. Accepted empty and individually excluded responses retain the existing coverage semantics.

## Deferred callback coverage

`scripts/arena-recovery-lifecycle.test.cjs` retains its synchronous mode and adds an optional queued-state mode. Both execute the actual extracted hook callbacks and existing production helpers. Queued updates are applied in order, and can be flushed individually to observe cancellation before application.

Seven added cases cover:

1. Accepted page, later 501 evictions, preserved pending placeholder, complete subsequent recovery of all 50 messages, and no duplicate IDs.
2. Authoritative removal after acceptance but before queued execution; the removed message stays removed.
3. Generation invalidation before execution.
4. Unmount before execution.
5. Newer authoritative reaction state before execution; count and viewer selection survive the stale transcript row.
6. Concurrent refresh while a page updater is queued; no overlapping drain.
7. Conservative whole-request rejection before acceptance; cursor stays at its prior position, with no tight retry.

These are callback-level simulations with deferred transports and controlled state queues, not mounted React, device or live backend tests. The reaction case arranges a newer committed cache value and advances the real coordinator; it does not claim a real reaction RPC or native tap. The unchanged overflow scheduler remains stubbed and outside this checkpoint's validation.

## File-free fault sensitivity

Each fault was applied only in memory, with an explicit check that its source transformation matched. Each run executed all 24 callback tests.

| Injected fault | Expected test failures observed |
|---|---:|
| Restore visibility admission inside the deferred updater | 1: accepted 40-row page disappears |
| Remove deferred generation/mounted check | 2: generation and unmount allow stale insertion |
| Bypass reaction coordinator for the queued merge | 1: newer reaction count is overwritten |

No repository files were changed by these probes.

## Actual final validation

| Check | Result |
|---|---|
| Full unit suite via `npm.cmd run test` | 616 passed / 150 suites, exit 0 |
| Lifecycle portion of that command | 34 passed: 10 existing presentation + 24 recovery/composer cases, exit 0 |
| Focused transcript/reaction/Crowd/Next-Clash suites | 44 passed, exit 0 |
| TypeScript `--noEmit --incremental false` | Passed, exit 0 |
| Duel payload/presentation suites | 29 passed, exit 0 |
| Duel render smoke | 22/22 scenarios passed, exit 0 |
| `git diff --check` | Passed |

Counts overlap across commands. Existing Node experimental/module-type warnings and the render harness's `pointerEvents` warning remain.

## Scope and limitations

Only the hook, its existing callback test harness and this report change. All 17 unrelated untracked entries are preserved. One local commit is authorized; its SHA is returned after creation. No push or merge.

Actual React priority lanes, render replay and native behavior were not exercised. The FIFO queue tests demonstrate the specified acceptance/application interleaving and later removal ordering. Existing overflow recovery defects and Option B scheduler work remain outside this change. No database, device, Metro, RPC, migration, permission or UI-design operations occurred.

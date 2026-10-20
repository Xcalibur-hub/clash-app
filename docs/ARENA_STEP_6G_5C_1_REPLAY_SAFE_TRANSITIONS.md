# Step 6G.5C.1 — Replay-safe transcript state transitions

## Scope and precheck

Implementation base: `arena-ui-review`, HEAD
`07fcae406f6aaf6e4f2c78d30ed4c2496c840e75`, parent
`f73c2a733747f8e0deb5751e5b9d48a25a62d03c`.
Tracked/staged tree was clean; all 17 unrelated untracked entries were retained.
No database, device, Metro, navigation, service/RPC or schema work was performed.
Step 6G.5B and the existing overflow scheduler were not changed.

## Architecture decision

Chosen: **B, an authoritative external owner**, local to each mounted room hook.
`utils/arenaTranscriptStore.ts` owns the message snapshot, SnapshotGuard and
visibility barrier. Every message write calls its synchronous `update` method.
The transition evaluates exactly once against the owner's current rows, completes
its ordering effects, publishes a frozen message snapshot, and then notifies
subscribers. No transport await or React setter is inside that boundary.

React subscribes through `useSyncExternalStore`. Its snapshot getter only reads
the current immutable array, returning the same identity until publication.
StrictMode evaluation, Suspense abandonment, snapshot rechecks and render retries
cannot run a cache transition. The owner's commit can precede a React view
commit; rows and their ordering metadata have already committed together in the
owner while React is suspended. Message refs also read this owner, rather than
being assigned from a possibly abandoned render. Pagination reads the owner.

Alternative A, immutable rows plus immutable ordering state in pure transitions,
would require migrating SnapshotGuard, visibility tickets, pending mutation
ownership and queue completion integration together. That is a substantially
larger change. Wrapping today's mutating guard in a reducer would retain the
defect. The external owner preserves existing guard/queue algorithms and the
controller API while removing React's authority over their evaluation.

The boundary relies on normal synchronous JavaScript execution: there is no
async transition callback, transport cancellation facility or database-style
exception rollback. Internal transition callbacks must remain synchronous and
must not be called from React render. Published arrays, row objects, reaction
arrays and reaction records are frozen. Nested author/media objects are not
deep-frozen; existing consumers treat them as immutable values.

## Operation inventory

| Operation | Ordering effects | Message publication / React relationship |
| --- | --- | --- |
| Initial load and explicit latest-page load | Local read token, visibility admission, accepted coverage decision | Merge synchronously in owner; never replace history/placeholders merely because absent from a page |
| Gap recovery and rollup | Snapshot token, stable row eligibility, forward cursor acceptance | Owner transition completes before gap cursor advances; rollup does not advance gap cursor |
| Older pagination | Snapshot token, visibility admission; raw page length determines exhaustion | Owner merge; oldest anchor reads current owner rows |
| Realtime hydration | Local read token, up to 12 IDs, visibility admission | Owner merge after scope checks |
| Posted-message completion | Send owner, generation, read token, visibility admission | Owner removes only this placeholder and merges the eligible posted row |
| Visibility removal/reintroduction | Eviction revision/floor, row tickets; later authorized admission supersedes older removal | Owner applies removal or admitted merge synchronously |
| Reaction optimistic/result/repair writes | Application ticket, null-read visibility removal, queue ordering | Owner writes the reaction vector or removes the row |
| Mutation completion | Existing queue authoritative marker and exactly one hook `finishMutation` per enqueue | Still imperative completion; never depends on React committing |
| Generation invalidation/unmount | Generation/mounted gates; reset visibility and write tickets; clear initial retry obligation | Scope clear publishes empty owner rows; late callbacks cannot publish |

Read-start tokens, admission and mutation lifecycle events remain imperative
events outside React. They need no React commit. Evidence and other UI state
retain their existing pure React setters. No other transcript hook was migrated.
No automatic reaction-toggle replay was introduced and no correctness metadata
was pruned to bound memory.

## Confirmed roots and mandatory RED evidence

**P1-A:** the previous functional React message setter evaluated
`createTranscriptUpdater`, which called mutable `SnapshotGuard.merge`.
At 257 loaded messages, the bounded 256-entry registry can evict an entry and
advance its global eviction watermark during the first evaluation. React's
repeated evaluation then rejects the same read against the original message
base. Mounted React 19.1 StrictMode reproduced:

```text
[{"rendering":true,"count":7},{"rendering":true,"count":0}]
committed count: 0; expected: 7
```

**P1-B:** `load` initialized the forward cursor from an initial raw response even
when its visibility epoch was below the pruning floor. A retained older row
anchors backward pagination below the missing page; newer-only recovery starts
above it. Additional latest-page loads can move past the missing window. Neither
direction necessarily covers it again.

Before production edits, the original 54 callback tests plus four new mandatory
regressions produced **58 tests: 55 pass, 3 fail**. Failures were mounted
StrictMode count 0 versus 7, mounted render-time guard mutation, and acknowledgement
of rejected initial coverage. The individually excluded accepted-page case
already passed and remains a compatibility requirement.

## Coverage semantics and bounded initial retry

- A request at or above the visibility floor is accepted coverage, even when
  individual row tombstones exclude every row. Raw page boundaries and raw page
  length remain authoritative for that accepted page. `hasOlder` is never derived
  from admitted row count.
- A whole-request rejection acknowledges no new boundary. If no forward cursor
  exists, retain at most the original 40 IDs and its proposed head as an
  **unacknowledged obligation**, separate from the forward cursor.
- Existing refresh triggers retry these IDs through existing `fetchMessage`
  reads, in at most four batches of 12 and at most 40 calls per pass. A batch
  acknowledges IDs only after a fresh, scope-valid, floor-accepted response and
  owner transition. Null is authoritative absence and evicts stale cached content.
  Errors or another floor rejection retain the unfinished IDs. Successful earlier
  batches are not fetched again. Concurrent latest-page loads cannot replace the
  retained obligation with a newer window.
- Only after all retained IDs are freshly covered or authoritatively absent is
  its original head installed as the forward cursor. Existing newer-only gap
  recovery then covers later traffic, retaining its five-page bound. An empty
  rejected initial response instead requires a fresh accepted bootstrap page.
- There is no new timer, scheduler or immediate retry loop. A later existing
  refresh resumes unfinished work; generation reset and unmount discard it.

The regression rejects initial messages 1–40 while keeping an older cached row,
then advances traffic to 90. A refresh, latest-page load and older pagination
recover all 1–90 without cursor regression. A 40-row accepted page with every row
individually excluded still acknowledges its raw head, retains `hasOlder=true`,
and permits older history. Additional cases cover partial transport failure,
another pruning-floor rejection, null reads, newer latest-page load overlap,
generation/unmount completion, and an empty rejected bootstrap.

## Mounted React and callback confidence

`scripts/arena-transcript-state.test.cjs` mounts the **actual full hook and actual
owner** with installed React/ReactDOM 19.1. Transport, native AppState, focus and
timers are controlled. The real reconciler uses an in-memory event container;
the component renders no host nodes. No renderer dependency was added.

Five mounted cases cover the 257-message StrictMode boundary, actual Suspense
abandonment followed by resume, two real serialized queue toggles completing once
each, and late hydration after generation invalidation/unmount. The Suspense case
asserts suspension occurred, the prior React commit remains count 0 while owner
rows are count 7, 100 snapshot reads retain identity without another merge, and
resume commits count 7 without replaying the owner transition. Neither mounted
render path calls the guard's mutating merge.

Eight callback coverage cases execute the production callback bodies with
controlled network responses. The previous 54 cases are preserved unchanged;
their shared extraction harness moved to `scripts/arena-room-harness.cjs`.
Legacy queued mode deliberately delays **imperative commands** to stress helper
invariants. It does not pretend those commands remain React setters in production;
the mounted suite verifies the real owner integration. Existing cases retain
coverage of removals/readmission, reversed response/command order, reaction and
body/moderation ordering, placeholders, scope cancellation and bounded reads.

## Fault injections

Performed in child processes with `fs.readFileSync` source transformations only;
no production or test file was changed for injection.

1. Replace the external snapshot subscription/writer with a React message state
   setter and restore the render-assigned message ref. Mounted R1 and R2 both
   fail: **0/2 pass, exit 1**. Diagnostic capture confirms the first render-time
   merge returns 7, the second returns 0. R2 also detects mutating merge during
   the abandoned render.
2. Force initial `accepted=true`, allowing a wholly rejected initial page to
   seed its cursor. R3 fails: **0/1 pass, exit 1**, because rejected coverage was
   acknowledged. Diagnostic capture after refresh, latest-page load and older
   pagination shows cursor `m90`, the older `base` row retained, and exactly
   `m1` through `m40` still absent.

The non-injected mounted/coverage suite passes **13/13** and is part of `npm test`.

## Final validation

| Command / scope | Result |
| --- | --- |
| `npm test`: full unit | **617/617**, 150 suites |
| `npm test`: lifecycle + mounted/coverage | **77/77** = 10 presentation + 54 previous callback + 13 new |
| Focused transcript/reaction/repair/correctness/overflow files | **35/35**, 21 suites |
| `tsc --noEmit --incremental false` | **exit 0**, no diagnostics |
| Duel unit tests | **29/29** |
| `scripts/duel-render-smoke.cjs` | **22/22** |
| `git diff --check` | Pass |

Focused files: `transcriptOrdering.test.ts`, `reactionSnapshots.test.ts`,
`reactionOrderingFoundation.test.ts`, `reactionRepairOrdering.test.ts`,
`reactionCorrectness.test.ts`, `correctness6g2.test.ts`, `overflowRecovery.test.ts`.
Counts overlap where focused/Duel files also run in the full unit command; they
are separate validation runs, not an additive unique-test total.

## Remaining limitations and next action

ReactDOM tests establish the reproduced React evaluation defect and ownership
boundary; they do not establish full React Native scheduling, native host or
device integration. In-flight transport is gated on completion, not aborted.
Body/moderation ordering still uses local read-start order, not a server revision.
Existing eligibility/write/commit metadata lifetimes and conservative visibility
floors are preserved. Repeated network failures or repeated authoritative
invalidations may defer recovery until a later successful refresh. Existing
overflow-scheduler limitations remain outside this step.

P1-A and P1-B are closed within these tested boundaries. Next action: independent
review of this state-ownership change and the coverage protocol before separately
authorizing Step 6G.5B. No Step 6G.5B work was started. The final response records
the single local commit SHA and final working-tree check.

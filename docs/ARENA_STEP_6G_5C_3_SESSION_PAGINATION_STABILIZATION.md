# Step 6G.5C.3 — Session ownership and pagination stabilization

## Base and scope

Branch `arena-ui-review`; implementation base
`9cf2cdf4f0ee6ce69a7d90d05fe3707c4d880eb0`, parent
`0349127899b748e6526221243fb5fd205035194d`.
Tracked/staged files were clean before work. The 17 unrelated untracked entries
were preserved. This step changes local session/pagination ownership and the
existing external owner's synchronous failure semantics. It adds no shared
authoritative-read primitive, scheduler, RPC, schema, dependency or navigation
feature. No database, device, Metro, push or branch/worktree operation occurred.

## Actual before-fix RED

Production code was unchanged while the mounted fixture was extracted and new
regressions were added. The following command ran against the original
production implementation, before any production edit:

```text
node --test scripts/arena-session-stability.test.cjs scripts/arena-transcript-state.test.cjs
38 tests: 23 pass, 15 fail, 0 cancelled; exit 1
```

All 23 prior transcript cases passed; all 15 newly added cases failed. This is
actual RED evidence, not a reverse-fault approximation. An earlier run contained
the 11 core cases before four additional public-action cases were added; it
reported 34 tests, 23 pass and 11 fail.

| Regression | Actual failure/trace |
| --- | --- |
| R1 public refresh | After switching A to B, resolving A produced another A rollup and B load; two B-owner read tokens; request count 5 rather than 3 |
| R1 pagination ownership | B inherited `loadingOlder=true`; expected false |
| R2 same-turn pagination | Two active requests; newer full response followed by older short response left `hasOlder=false`; expected one active request |
| R3 root StrictMode | Initial authoritative count 7 was absent: `undefined !== 7` |
| R1 sibling actions, four cases | Late side vote, argument vote, final stance and upgrade completions modified B's room state |
| R4 raw backward coverage | Requests used `[base, base]`; expected second request from `hidden-60` |
| R5 outer exception | Accepted queued callback never ran: false rather than true |
| R5 queued exception | Later queued authoritative read stayed count 0 rather than 5 |
| R5 ownership/tickets | An aborted reaction write invalidated the original ticket |
| R5 visibility | An aborted removal left the earlier admitted read ineffective: 0 rather than 5 |
| R5 subscriber exception | First listener prevented later listener/write: final count 7 rather than 9 |
| R5 self-enqueue | Child process exceeded its six-second deadline: `ETIMEDOUT` |

The self-enqueue RED was isolated in a child process so the test runner remained
responsive and terminated the pathological process. No temporary probe files
were created.

## Root causes and architecture

### Complete operation ownership

The old public `refresh` awaited one session's recovery and then started a load
that captured whichever session was current. Recovery also continued beyond a
cancelled gap drain before checking its lease again. Room switching reset some
busy state, but omitted pagination; its stale completion correctly refused to
clear the new session and therefore left that inherited flag stuck.

Public refresh now captures one immutable-by-convention `RoomSession` value at
entry and passes it through recovery and load. Helpers validate before starting
work, after awaited continuations, and after owner publication before changing
coverage refs. An old public callback cannot target a different room. Recovery
does not allocate another token or start another transport read after its lease
expires. The existing session check still protects recovery-lock release.

Refresh, pagination, send and evidence busy ownership use synchronous symbols.
Only the operation that owns its symbol can release it. Session initialization
and private-access invalidation reset those owners and their UI flags. Load
counts belong to the current session, so overlapping loads cannot prematurely
clear its initial/refresh indicators. Old completions cannot decrement the next
session's counters.

The public action inventory also exposed the same issue in side/argument votes,
final stance and upgrade continuations. Those operations now retain their session
through awaited work, scope-gate deferred UI setters, and suppress stale notices.
Evidence completion uses its own busy owner; an old room cannot release a newer
evidence request. Existing durable request confirmation and reaction completion
ownership remain intact. No ambiguous reaction toggle is automatically replayed.

Subscription/focus/background entry points bind a current session for each new
event and pass it to their helper work, checking the originating room. A new
event is distinct from a continuation of an already cancelled operation.

### Pagination coverage

React's rendered `loadingOlder` flag is no longer the serialization mechanism.
A synchronous session-scoped owner admits one active pagination request; same-turn
duplicates return without starting another read.

The acknowledged raw backward anchor is authoritative whenever present. A
rendered oldest row is only a bootstrap fallback. Accepted page metadata advances
after owner publication succeeds and only if the request still owns the session
and the anchor it began from. This also handles a newer initial page establishing
coverage while a fallback pagination request is pending.

Whole-request floor rejection does not change the boundary or exhaustion flag.
For accepted pages, raw length determines exhaustion, including short and empty
pages; filtered length is never used. Latest-page loads preserve already
established backward coverage. Forward recovery and backward pagination retain
independent cursors.

An initial response retains its bounded ID obligation until publication succeeds.
A thrown transition or listener notification therefore cannot silently seed a
forward cursor over discarded coverage. Retry continues to use at most the
original 40 IDs, in the existing bounded batches, followed by the unchanged
bounded gap drain. The retained initial obligation also carries its backward
boundary and raw exhaustion information for acknowledgement after recovery.

### Root StrictMode and Suspense

The old room binding survived passive effect cleanup, while visibility cleanup
invalidated the initial read. Root StrictMode layout replay then skipped
initialization, leaving no current initial request.

Passive detach now invalidates the old session and clears the room binding.
Layout setup restores mounted status and establishes a fresh session before
starting its initial read. Genuine unmount remains cancelled. Suspense layout
hiding does not perform this passive detach, so it preserves the already
authoritative owner snapshot rather than resetting it on reveal.

The mounted fixture supports StrictMode at the root, outside Suspense. The
original nested StrictMode eviction-boundary regression and Suspense resume
regression remain in the suite.

## External-store transaction and reentrancy policy

The external owner remains the authority; React only reads immutable snapshots.
No mutable coordinator runs in a React state updater or reducer.

Each synchronous transition checkpoints **both** owned coordinators:

- SnapshotGuard copies application/body barriers, pending ownership, eviction
  watermark and reaction-write ticket membership/flags. Failure restores them,
  including invalidating newly created tickets and restoring prior predicates.
- Visibility checkpoints eviction/floor data, eligibility membership and ticket
  flags. It journals newly created batch associations so failed admissions lose
  authority on rollback, including nested coordinator transactions.
- Read-token and visibility-revision allocators remain monotonic. Rollback does
  not recycle an issued token/epoch into a future operation.
- Rows and reaction values are frozen/prepared before publication. A transition
  exception restores coordinator metadata and leaves the published snapshot
  unchanged. No listener observes that aborted transition.

Transactions are atomic **individually**, not across the entire drain. Successful
earlier transitions remain committed. A failed transition does not silently drop
accepted independent queued work: every admitted queued command is evaluated
once against the then-current authoritative state. Errors are collected and
reported by the outer update as an `AggregateError` after draining.

Notifications run after commit, outside rollback. A listener exception cannot
undo published state or suppress peer listeners and queued commands. Listener
iteration uses a snapshot of the listener set. Nested update calls acknowledge
queue admission, not completion; aggregate failure is reported to the outer
drain caller.

A drain admits at most **64 transitions**, including the initiating transition.
The next recursive enqueue is explicitly rejected before admission. Already
accepted commands finish; the rejection is surfaced, and the store remains
usable. There is no automatic transition retry or deferred scheduler.

This is transactional protection for the owned registries and immutable message
values. It does **not** roll back arbitrary caller side effects, external refs,
network work, or in-place mutations of unrelated nested objects. Callbacks must
remain synchronous. Nor can the queue interrupt arbitrary infinite code inside
one callback. The implemented bound covers recursive queue admission/draining.
Checkpoints cost temporary memory/time proportional to the retained registries;
no correctness fences were pruned to reduce that cost.

## Regressions and fault sensitivity

`arena-session-stability.test.cjs` now contains **22 cases**: the original 15 RED
cases plus seven interaction checks added afterward. These include competing
initial/pagination coverage, simultaneous forward recovery/backward pagination,
failed initial/older publication recovery, allocator safety across aborted
resets, queued scope invalidation, and evidence busy ownership.

The shared actual-hook fixture moved to `arena-mounted-room.cjs`; it supports
root StrictMode and observes production read-token allocation. Nine of the new
cases mount the complete hook with real React/ReactDOM 19. The remaining cases
execute actual callbacks, store and coordinators with controlled transport. The
prior 54 callback cases still support delayed imperative-command stress testing;
they are not represented as mounted React setters.

All eleven post-fix faults were applied only through in-memory source reads in
child processes. Each corresponding positive regression failed with exit 1:

| Removed protection | Failing regression |
| --- | --- |
| Public refresh retains its session | R1 public refresh |
| Recovery stops after cancelled drains | R1 public refresh |
| New-session pagination UI reset | R1 pagination busy ownership |
| Synchronous pagination admission | R2 same-turn requests |
| Passive-detach binding reset | R3 root StrictMode |
| Raw anchor precedence | R4 acknowledged boundary |
| SnapshotGuard rollback | R5 queued exception |
| Visibility rollback | R5 failed visibility change |
| Subscriber error isolation | R5 throwing subscriber |
| Continuing accepted queued work | R5 outer exception |
| Recursive drain limit | R5 self-enqueue timeout |

The previous exhaustion regression now uses a rejected ten-row page rather than
a full page, so it actually detects false exhaustion. Historical fault matchers
were updated for the changed production syntax, including the queue's error
collector argument; their intended incorrect outcomes remain asserted.

## Validation

| Validation | Result |
| --- | --- |
| Full `npm test` unit run | **617/617**, 150 suites |
| Full `npm test` lifecycle/mounted run | **109/109**, 0 cancelled |
| Focused transcript/reaction files | **35/35**, 21 suites |
| TypeScript `--noEmit --incremental false` | **exit 0**, no diagnostics |
| Duel tests | **29/29** |
| Render smoke | **22/22** |
| File-free protection-removal faults | **11/11 detected** |
| Whitespace check | `git diff --check` passes |

Lifecycle count is 10 presentation + 54 existing callback + 23 previous
transcript + 22 new stabilization cases. Focused and Duel test counts overlap
the full unit run and must not be added as unique coverage.

The first full run found a missing `errorText` dependency in the extracted
callback harness's newly exercised error path; supplying the production-shaped
formatter fixed that harness error. The final full run is the successful result
reported above. All production changes passed TypeScript and focused validation.

## Exact files and limitations

Changed files:

1. `hooks/useLiveArenaRoom.ts`
2. `utils/arenaTranscriptStore.ts`
3. `utils/reactionSnapshots.ts`
4. `utils/transcriptOrdering.ts`
5. `scripts/arena-mounted-room.cjs` (new fixture extraction)
6. `scripts/arena-session-stability.test.cjs` (new regressions)
7. `scripts/arena-room-harness.cjs`
8. `scripts/arena-transcript-state.test.cjs`
9. `package.json`
10. This report.

ReactDOM tests do not establish native host, device or full React Native
scheduling behavior. In-flight transport is scope-gated rather than aborted.
Body/moderation freshness is still local read-start ordering, not a server
revision. Snapshots freeze arrays, rows and reaction values; unrelated nested
author/media objects are not recursively frozen. Existing metadata retention and
overflow-scheduler limitations remain. No Step 6G.5B work was started.

All five requested findings are addressed within these stated boundaries.
Next action is independent review of session ownership, pagination coverage and
transaction failure semantics. The final response records the one local commit
SHA and final working-tree status. Stop after Step 6G.5C.3.

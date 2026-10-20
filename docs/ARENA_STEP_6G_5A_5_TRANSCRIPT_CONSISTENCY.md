# Step 6G.5A.5 — deferred transcript consistency

Baseline: `7e9705044a5770aff169876a9f31539310e7bbe2`, branch `arena-ui-review`. Tracked and staged state was clean. All 17 unrelated untracked entries are preserved. This checkpoint does not implement Step 6G.5B or change the overflow scheduler.

## Architecture and linearization

Coverage acceptance remains synchronous: the recovery consumer checks the whole-request visibility watermark, derives the admitted batch, enqueues its updater and advances the cursor without an intervening await. Later pruning cannot discard this acknowledged coverage wholesale. The existing drain API, cursor checks, five-page bound and 40-row page size are unchanged.

Cache application happens when React evaluates the functional updater. All six server-message paths (hydration, gap recovery, rollup, initial/explicit load, pagination and post completion) use `createTranscriptUpdater`. It checks the captured access generation and mounted state at execution, filters the accepted batch by row eligibility, removes only its own optional post placeholder and calls the existing snapshot coordinator. Invalid scopes return the existing state unchanged.

Visibility removals come from authoritative checked-ID responses and authoritative null message reads. `VisibilityBarrier.admit` assigns shared eligibility tickets to admitted IDs. `mark` invalidates the affected tickets before enqueueing removal. Deferred batches retain those invalidated tickets even after the individual tombstone is pruned. Fresh admission gets a new ticket; it cannot reactivate an older batch. The original 500-ID tombstone history and whole-request floor remain bounded and unchanged in purpose. Reset invalidates tickets and advances the floor at scope changes/unmount.

Ticket storage is proportional to distinct admitted, still-eligible IDs in the current scope, as is the accumulating loaded transcript; eviction and scope reset release the registry entries. Batch records use a WeakMap. This intentionally avoids a second fixed-size eviction policy that could forget pending accepted rows.

Reaction metadata is now recorded on first insertion as well as updates. Pending mutations and authoritative reaction barriers still gate reactions independently of full-row fields. Equal applied read tokens support reevaluation against an earlier base, while inherited reaction eviction floors remain excluded. No toggle is replayed and mutation completion remains owned by the existing toggle `finally`.

Each recovery page and the separate rollup receive their own snapshot token at local read start. Full-row fields have a separate `lastBodyApplied` token, so a newer applied read protects body, media/redaction fields and other non-reaction data against older deferred reads without treating a reaction mutation as a body edit. After ordering metadata eviction, an old read conservatively preserves current full-row fields; a fresh read can update them.

`ArenaMessage` exposes creation time, including precise creation time, but no trustworthy edit revision or moderation-update timestamp. Creation time is not an edit clock. The implemented policy is local read-start ordering only: it does not prove which response reflects a newer server state, order concurrent backend transactions, or make out-of-coordinator cache writes authoritative. No server ordering guarantee is invented.

## Executed before-fix RED

Before any production edit, the expanded callback suite executed **32 tests: 26 passed, 6 failed, 0 cancelled**, exit 1. All original 24 tests remained green.

- R1: authoritative removal applied before the accepted updater resurrected its row, including after tombstone pruning.
- R2: absent-row reverse execution lost newer reactions; the already-loaded forward case also exposed recovery and rollup sharing one snapshot token.
- R3: deferred rollup wrote after generation invalidation and after unmount (two failures).
- R4: reversed refresh batches restored older body/media values over the newer redacted response.

Tests execute extracted production callback AST bodies and production helpers with deferred transport and controlled state queues. They do not copy the callback implementation.

## Production changes and outcomes

- `utils/transcriptOrdering.ts`: shared scope/eligibility application gate; stable row eligibility tickets, execution-time filtering and scope reset.
- `utils/reactionSnapshots.ts`: first-insertion tracking, separate full-row ordering, conservative eviction behavior and same-read reevaluation.
- `hooks/useLiveArenaRoom.ts`: route all deferred server-message batches through the gate; capture separate read tokens for recovery pages and rollup; scope-check deferred reaction-only writes, evidence row writes and visibility removals; register null-row removals with visibility; prevent old-generation clears/catches from affecting a newer scope. Room initialization advances generation and releases outgoing send ownership. A completed send cannot subsequently insert its queued placeholder.
- Existing drain, reaction queue/bridge, RPCs, permissions, routes, Crowd, Next-Clash, and UI rendering are unchanged. Evidence paths receive scope checks only; no evidence freshness protocol is claimed.

The final **41 callback tests** retain the original 50-message/501-eviction recovery regression and add reversed visibility with pruning, all four loaded/absent and forward/reverse reaction combinations, rollup generation/unmount rejection, reversed body/redaction updates, scope checking independent of visibility reset, deferred hydration/load/pagination/post cancellation, actual reaction write-callback null removal, reaction-write scope cancellation, stale thread-clear cancellation and reversed successful-send placeholder handling. IDs remain unique and unrelated pending placeholders survive. The existing concurrent refresh, empty/excluded coverage and cursor tests remain green.

Two helper cases additionally verify invalidation across pruning, fresh readmission and repeated updater evaluation, and reevaluation of body/reactions against an original base. A source-shape assertion was updated for the shared helper. The old eviction test's unconditional old-body overwrite expectation was deliberately changed to conservative preservation, with an explicit fresh-body adoption assertion retained.

## File-free fault sensitivity

Each fault altered source only in a child process's memory, asserted that the transformation executed, and ran all 41 callback tests. Every run exited 1, with no cancelled tests.

| Injected fault | Passed | Failed |
|---|---:|---:|
| Remove row-level visibility filtering | 39 | 2 |
| Disable first-insertion reaction snapshot tracking | 40 | 1 |
| Remove rollup updater generation/mounted gate | 39 | 2 |
| Bypass full-row freshness selection | 40 | 1 |

The independent generation test avoids visibility reset masking removal of the rollup's scope gate. The first-insertion fault leaves body protection intact, so the reaction regression detects reaction ordering itself.

## Final validation

| Check | Result |
|---|---|
| Expanded recovery callback suite | 41 passed, exit 0 |
| Focused transcript/reaction suites, including ordering/eviction/replay | 34 passed / 21 suites, exit 0 |
| `npm.cmd run test` unit portion | 616 passed / 150 suites, exit 0 |
| `npm.cmd run test` lifecycle portion | 51 passed: 10 existing presentation + 41 recovery/composer, exit 0 |
| TypeScript `--noEmit --incremental false` | Passed, exit 0 |
| Duel payload/presentation | 29 passed, exit 0 |
| Duel render smoke | 22/22 scenarios passed, exit 0 |
| `git diff --check` | Passed |

Counts overlap across commands. Existing Node experimental/module-type and render `pointerEvents` warnings remain. Node path resolution required running tests outside the filesystem sandbox; no database, device, network-service or Metro operation was performed.

## Limitations and delivery

Controlled reversed execution does not model every React priority lane, interrupted render or rebasing behavior. The added repeated-evaluation tests cover specific replay cases, not a mounted React or native correctness proof. Transport is not cancelled. Full-row consistency is the documented local ordering policy, not server revision consistency. The accumulating transcript and its live eligibility registry have no fixed row cap. Existing overflow recovery behavior remains outside this checkpoint.

At most one local implementation commit is authorized after validation. Its SHA is returned in the delivery response (embedding the commit's own SHA here is not possible). No push, merge, reset, stash, clean, branch/worktree change, scheduler work, migration, database/device operation or Metro restart. Stop after Step 6G.5A.5.

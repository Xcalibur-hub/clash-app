# Arena Step 6E.1 correctness fixes

Base: Step 6E commit `2fad26a` on `arena-ui-review`. Step 6E's verdict hierarchy,
canonical percentages, next-Clash suggestions and checked navigation remain intact.
No schema, RPC, permission, settlement, notification, Follow or Activity service changed.

| Finding | Status | Root cause and correction | Regression evidence |
| --- | --- | --- | --- |
| Reaction ordering | FIXED | Message-wide sequence invalidation discarded unrelated emoji responses; snapshots could include failed optimism. Toggle RPCs now serialize per message, with a fresh authorized read before each operation. Different messages remain independent. Failed/lost responses trigger a targeted read, never an automatic toggle retry. Failed repairs are retained for bounded periodic/focus/reconnect reconciliation, including older loaded messages. | Eight deferred-promise tests: different/same emoji taps, cross-message out-of-order completion, consecutive rejection, committed lost response, offline older-message recovery, delayed server commit and account-scope invalidation. |
| Entrance deadline | FIXED | An inline callback reset the effect timer on parent renders. The timer now invokes a callback ref and excludes callback identity from its dependencies. Skip and timer share a completion guard; cleanup and reduced-motion duration remain. | Actual component executed with controlled hooks and fake timers: repeated parent renders, latest callback, Skip, cleanup and reduced motion. |
| Terminal Crowd | FIXED | Independently refreshed Crowd context could remain writable after authoritative Room closure. ImmersiveClash immediately supplies a read-only override for terminal/non-open canonical status. Historical messages remain available where authorized; cancellation still hides Crowd. | Actual Crowd render transition retains stale `canSend=true` while verifying input/Send disappear and read-only copy appears. Existing terminal render scenarios also pass. |
| One-shot lifecycle | FIXED | The parent consumed entrance keys before loading/error branches rendered an overlay; an offscreen inline verdict consumed sheet motion. Entrance claims now occur in the mounted visible overlay effect. Inline outcomes are static; only explicitly visible result sheets claim reveal/haptic keys. Demo result sheets opt in explicitly. | Aborted/inactive render does not claim; visible commit claims; offscreen outcome does not consume; ordinary entrance/result remount suppresses replay. |
| New-message affordance | FIXED | Any latest-ID change was treated as arrival. The Crowd now maintains a precise timestamp/ID high-water cursor, without moving it backward on removal. | Actual Crowd component tests a history reader with pagination, newest removal, reconciliation replay and a genuine newer arrival. |
| UTF-8 literals | FIXED | Earlier encoding corruption affected the default fire emoji, entering label and share separator. Restored intended Unicode literals and removed BOMs in the two affected files. | Strict UTF-8 decoding and mojibake scan of changed source files; no reaction vocabulary change. |

## Validation

- `npx tsc --noEmit`: PASS, exit 0.
- `npm run test`: PASS: 575 unit tests plus 10 component lifecycle tests; zero failures/skips.
- `npm run test:duel`: PASS: 29 tests, zero failures/skips.
- `node scripts/duel-render-smoke.cjs`: PASS: 22 controlled render scenarios.
- `node scripts/crowd-service-check.cjs`: PASS: 7 reported controlled checks.
- `node scripts/official-service-check.cjs`: PASS: 14 controlled service/store checks.

The package previously had no `test` script. It now runs the existing full unit
command plus the new component lifecycle suite; no existing suite was removed.
The initial full run failed one obsolete source-text assertion requiring the removed
`reactionSequence` implementation. Its replacement checks the queue wiring and
retains the prohibition on locally incremented totals. The subsequent full run passed.

## Limits

These are offline production-code tests using deferred transport doubles and a
controlled React hook/timer harness, not native Reanimated/TalkBack/keyboard proof.
No device operations, live Supabase checks or database tests were performed.
Targeted repairs require network access and current authorization; they remain
pending while offline, and never retry the non-idempotent toggle itself.
Ambiguous targets remain eligible for rotating, bounded rereads while the scope
is active: an immediate successful read may still precede a delayed server commit.
Serialization is per mounted room hook; it does not coordinate separate devices.
Native visual/accessibility acceptance remains Step 6F and was not started.
No push or merge is authorized for this checkpoint.

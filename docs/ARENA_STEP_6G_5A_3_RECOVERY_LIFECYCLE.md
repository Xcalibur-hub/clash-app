# Step 6G.5A.3 — recovery cursor and composer lifecycle

Implemented on `arena-ui-review`, starting from `0218cb0532ba1fcec962dec566ad41b785200cf1`. Only the two confirmed recovery/composer defects are addressed. No Step 6G.5B scheduler work, backend changes, device operations or deployment took place.

## Corrections

- `hooks/useLiveArenaRoom.ts`: gap-page acceptance checks `visibilityBarrier.allows(threadEpoch)` before merging rows or advancing the external cursor. Conservative whole-request rejection returns `false`; individual visibility exclusions still constitute accepted coverage and may advance the cursor. Fresh rollup retains its separate epoch.
- `utils/officialRecovery.ts`: consumers may return `false` to stop a bounded drain without advancing its internal cursor. Existing `void` consumers retain their behavior. Empty valid pages terminate normally; fetch failures still propagate. Page/read limits and ordering are unchanged.
- `hooks/useLiveArenaRoom.ts`: each send owns a unique symbol and captures its access generation before account/request preparation. Thread invalidation releases the outgoing owner, resets `sending`, and clears its placeholders through the existing thread-clear path. Preparation, success, failure and final cleanup check ownership. Old completions cannot insert rows, report success, issue notices or release a newer send's busy state. Unmount suppresses UI writes. Existing official request keys, confirmation and RPC payloads are retained.
- `scripts/arena-recovery-lifecycle.test.cjs`: 17 deferred callback regressions, including the 50-message gap, 501 real visibility-callback evictions, subsequent complete recovery, individual exclusions (including a fully excluded accepted page), empty pages, failures, cancellation, normal sends, confirmation delays, preflight invalidation, duplicate sends and overlapping generations.
- `package.json`: `npm run test` now includes the new callback suite alongside the existing lifecycle suite.

The visibility API already exposes `allows()` separately from `admit()`. The correction uses that distinction rather than adding a second admission system.

## Executed RED evidence

Before changing production code, the first 13 callback tests ran with exit 1: **8 passed, 5 failed**.

1. The rejected recovery advanced to `gap50` instead of retaining `base`.
2. The drain ignored a consumer's rejection and fetched again, producing `Recovery cursor did not advance`.
3. Successful send completion after invalidation inherited `sending=true`.
4. Failed send completion after invalidation inherited `sending=true`.
5. Invalidation while request confirmation was pending inherited `sending=true`.

Four additional preparation/duplicate-send/fully-excluded-page cases were added after the production correction. The final suite passes all 17 cases.

## Production coverage and fault sensitivity

The new harness extracts and executes the actual `refreshThread`, `reconcileVisibility`, `clearPrivateThread` and `send` callback bodies from the hook using the installed Babel tooling. It executes the real drain, visibility, snapshot and merge helpers. Network/account/request-store functions use deferred mocks; refs and state setters are controlled in memory. Callback logic is not copied into the tests.

This is **callback behavioral coverage**, not a mounted React renderer, backend integration or Android acceptance. The unchanged overflow scheduler is stubbed out. The consumer-rejection test additionally exercises the drain helper directly.

The 50-message regression verifies that the rejected pass makes only one gap read and leaves the cursor unchanged. Its separate newest-40 rollup cannot restore the first ten messages. A fresh authorized pass subsequently recovers all 50 with no duplicate IDs or automatic mutation retries.

File-free fault injections each ran the then-current 16-test suite against altered production code in memory; repository files were not modified:

| Fault | Tests detecting the fault |
|---|---:|
| Restore unconditional internal drain progress | 2 |
| Treat conservative rejection as accepted empty coverage and advance | 1 |
| Remove outgoing sending-ownership reset | 3 |
| Let old `finally` release a newer owner | 2 |

The first reset-fault probe did not match Windows CRLF line endings and was rejected as undetected. The probe was corrected to require a matching transformation and handle CRLF; all four faults were then applied and detected. No production assertions were weakened.

## Validation actually executed

| Command/check | Result |
|---|---|
| Pre-fix callback suite | Expected RED: 8 passed / 5 failed, exit 1 |
| Final callback suite | 17 passed, exit 0 |
| `npm.cmd run test` | 616 unit tests / 150 suites, plus 27 lifecycle tests (10 existing + 17 new); all passed, exit 0 |
| Focused transcript/reaction/Crowd/Next-Clash suites | 44 passed, exit 0 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Passed, exit 0 |
| `npm.cmd run test:duel` | 29 passed, exit 0 |
| `node scripts/duel-render-smoke.cjs` | 22/22 controlled render scenarios passed, exit 0 |
| Four file-free fault injections | Every fault detected; 2 / 1 / 3 / 2 failing tests respectively |
| `git diff --check` | Passed |

Focused and Duel checks overlap the configured unit suite and are not additional unique-test totals. Existing Node experimental/module-type warnings and the render harness's `pointerEvents` deprecation warning remain.

## Boundaries and remaining risks

- The existing overflow scheduler and its previously identified defects are unchanged. This checkpoint does not certify reaction recovery as a whole or implement Option B.
- Rejected coverage waits for an existing later refresh/reconnect/foreground action; no tight retry loop or automatic reaction-toggle replay was introduced.
- In-flight requests are not transport-cancelled. Their stale local effects are rejected by generation and owner checks.
- Real React scheduling, Android keyboard/composer interaction and actual backend authorization were not exercised in this file-only task.
- No Supabase migration, permission, Crowd, Next-Clash, World, Vault or gameplay changes. No push, merge, device operation or Metro restart.
- Stage only the hook, drain utility, test script, package manifest and this report (five files total). Preserve all 17 pre-existing unrelated untracked entries. The report belongs to the single local implementation commit; its exact SHA is reported after commit creation.

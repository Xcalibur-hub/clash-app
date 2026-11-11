# NATIVE INTEGRATION READINESS  - Offline Adapters

Preparation of the Arena acceptance scheduler for a future authorized Samsung A50
run. **Offline only:** no ADB, database, Auth, gateway, fixture or live Arena
action was performed. No commits, installs or cleanup.

Builds on [`ARENA_MASTER_VERIFICATION.md`](ARENA_MASTER_VERIFICATION.md); the
scheduler itself was not rewritten.

---

## 1. Critical integration defect resolved

**Unbounded duplicate-ballot attempts (fail-open).** The engine capped *successful
spending* per category but not *request attempts*. A plan with **50 expected-rejection
ballots armed successfully** against a 2-ballot approval  - it could have hammered the
server with unlimited duplicate votes.

Fixed with an explicit, per-category request-attempt allowance:

| Plan | Attempt cap | Result |
|---|---|---|
| 50 ballot attempts | none | **refused**  - `ballot: 50 attempts, no attempt cap` |
| 4 ballot attempts | none | **refused**  - fail-closed |
| 4 ballot attempts | `ballot: 4` | accepted |
| 2 ballot attempts | `ballot: 4` | accepted |

`attemptCaps` lives in the authorization object, so it cannot be widened by editing
a schedule. Successes and attempts are now counted separately (`countDemand` /
`countAttempts`); owner-approved limits were **not** expanded.

## 2. Adapters implemented

`scripts/lib/arena-acceptance-adapters.cjs`  - thin wrappers over the **existing**
controllers. Nothing is a second scheduler, and no controller was duplicated or
modified.

| Adapter | Wraps | Seam | Contract |
|---|---|---|---|
| `createControllerAdapter` | `execute-owner.cjs` (not importable; own REPL) | injected `spawn` | `api_write` handlers, `reconciles: true` |
| `createDeviceAdapter` | `device-evidence.cjs` (hard-coded run dir + serial) | injected `adb` | taps = `device_write`, captures = `device_read` |
| `createJournalAdapter` |  - | injected `append` / `readBack` | append-only NDJSON, failure recorded not thrown |
| `createApprovalGate` |  - | injected `verifier` | artifact-based approval |

Every adapter is inert by default: with no seams supplied nothing runs, and all
tests use mocks.

**Safety properties enforced by the adapters:** command tokens validated; tap
coordinates must be integers; a tap refuses to fire unless the CLASH package is
foreground; capture names restricted to safe tokens; a journal write failure is
surfaced as state, never swallowed.

## 3. Trusted approval gate

A JSON `approved: true` alone cannot activate a run. The gate requires an artifact
obtained through a separately injected verifier, and refuses when it is:

`artifact_missing`  - `artifact_unverified`  - `artifact_manifest_mismatch`  - 
`artifact_plan_mismatch`  - `artifact_expired`  - `invalid_manifest_hash`

**Correction (final review #1):** when the scheduler pins a `planDigest`, the artifact
must contain **exactly** that digest. Previously a missing artifact digest passed
because the check was `digest && artifact.planDigest &&  - `. Now:

| Scheduler supplies | Artifact digest | Result |
|---|---|---|
| pinned | absent | **refused**  - `artifact_missing_plan_digest` |
| pinned | different | **refused**  - `artifact_plan_mismatch` |
| pinned | identical | accepted |
| none | any | accepted (artifact is not unpinned-unsafe) |

## 4. Device foreground  - real component parsing

**Correction (final review #2).** The previous check was a substring test, so
`com.android.chrome/ - com.clash.v2.dev.Web` matched as foreground. Now the dump is
parsed for `mCurrentFocus=`/`mFocusedApp=` window entries and the **package before the
slash** must equal `packageId` exactly.

| Dump | Verdict |
|---|---|
| `mCurrentFocus=Window{ - com.clash.v2.dev/com.clash.v2.dev.MainActivity}` | foreground |
| ` - com.android.chrome/com.clash.v2.dev.Web` | **not** foreground |
| ` - com.evil.com.clash.v2.dev/.Main` | **not** foreground |
| two distinct focus entries | **ambiguous ? refused** |
| empty / `mCurrentFocus=null` | **not** foreground |

A refused or ambiguous check blocks the tap before any `input tap` is issued.

## 5. Journal persistence  - durable and ordered

**Correction (final review #3).** The scheduler's journal interface is
synchronous and it dispatches immediately after calling it. Therefore:

- `append` must be a genuinely synchronous durable append; the adapter confirms it
  returned before `write()` returns `true`.
- A **synchronous throw** marks the journal failed and returns `false`.
- An **asynchronous (promise) append** is rejected outright:
  `journal_append_async_unsupported`  - an unresolved promise is never counted as durable.
- Once failed, the journal never silently resumes; all later writes return `false`.
- **The scheduler now acts on this:** a `write()` returning `false` sets
  `BLOCKED` / `journal_write_failed`, so no further mutating action proceeds without a
  durable record of what already happened.
- The synchronicity probe never persists: it uses an optional caller-supplied
  throwaway sink and performs no write by default.

## 6. `reconciles` claim corrected

**Correction (final review #4).** Handlers previously declared `reconciles: true`
with no reconciliation mechanism. That was a false capability claim. Now:

- Adapter handlers declare `reconciles: false` and supply no `reconcile()`.
- The scheduler accepts a handler that makes **no** claim, but rejects
  `reconciles: true` without a callable `reconcile()`.
- **Uncertain writes remain blocked:** a timed-out mutating step still yields
  `BLOCKED` + `requiresReconciliation`, and is never replayed.

Reconciliation is therefore explicitly unimplemented rather than falsely implied.

## 7. Defect found while building adapters

`verifyAuthorization()` did not return the manifest hash, so the gate received
`undefined` and every live arming failed with `invalid_manifest_hash`. Fixed by
returning the verified hash  - the gate now receives exactly what was checked.

## 8. Verification (mocked only)

```text
npm run test:arena-acceptance   ?  # tests 151   # pass 151   # fail 0   (exit 0)
npx tsc --noEmit                ?  exit 0, zero diagnostics
npm test                        ?  # tests 1387  # pass 1387  # fail 0   (exit 0)
                                   834 unit + 488 lifecycle + 65 release-scope
```

Additions this pass: digest-pinning (3), foreground parsing and ambiguity (4),
journal durability/ordering/async rejection (4), reconciliation claim (3), plus the
**35-test integration suite** below. All prior coverage retained.

---

## 8a. Real seams wiring (final pass)

Three previously-unimplemented seams now exist. **None executes anything at import
time**  - `node:child_process` is required lazily inside a function, and every
operation is gated behind an explicit call plus validation.

### Process seams  - `scripts/lib/arena-acceptance-process.cjs`

| Seam | Behaviour |
|---|---|
| `createControllerSpawn` | Drives `execute-owner.cjs` through its **actual JSON-lines REPL** (see below). Command must be in a **13-entry allowlist** and match `^[A-Za-z0-9._\-/:]+$` with no shell metacharacters. Always terminates the process. |
| `createAdbTransport` | Requires an explicitly configured **serial**; prefixes `-s <serial>`; rejects any arg containing `;&|`$<>` or newlines; caps arg count. |
| `assertSafeToken` | Rejects shell-special characters before any transport call. |

**Controller contract  - resolved.** `execute-owner.cjs` reads `process.argv`
**zero times**: `--command <name>` is **not supported**. The seam was wrong and has
been adapted to the real interface without touching the controller:

```text
startup  ? {"ready":true,"run":..,"dir":..,"pid":..}
input    ? {"command":"<name>"}\n        (one per line)
success  ? {"command":"<name>","result":..}
failure  ? {"command":"<name>","status":"STOP_FAILED_OR_UNKNOWN","message":..}
```

The seam launches `node execute-owner.cjs` from the repository root, waits for
`ready`, writes exactly one command line, reads exactly one verdict, and closes the
child in a `finally` block  - including on handshake failure, read timeout or
unparsable output. `STOP_FAILED_OR_UNKNOWN` maps to `{ok:false, fenced:true}`
carrying the controller's own message.

### Durable journal  - `scripts/lib/arena-acceptance-journal.cjs`

Synchronous and durable by construction: `fs.writeSync` + `fsyncSync` on a
`0o600` descriptor opened append-only, so a write is on disk before `write()` returns.

- A write before `open()` returns `false` **without** latching failure.
- A genuine write failure latches `failure`; all later writes return `false`.
- `recover()` tolerates a **truncated tail** (crash mid-write) and raises
  `requiresReconciliation`; **interior corruption is a hard error**.
- A trailing `started`/`timeout` record also raises `requiresReconciliation`.

### Authorization artifact  - `scripts/lib/arena-acceptance-authorization.cjs`

Versioned JSON document (manifest hash, plan digest, run id, window, budget, attempt
caps) signed with **HMAC-SHA256** over a canonical (sorted-key) serialization.

- **No secret is stored in the repository.** The key is read from
  `CLASH_ARENA_APPROVAL_KEY` (or injected); a missing/short key yields
  `key_unavailable`, never a default.
- Signature comparison is `timingSafeEqual`.
- Distinct refusals: `artifact_bad_signature`, `artifact_manifest_mismatch`,
  `artifact_plan_mismatch`, `artifact_expired`, `artifact_not_yet_valid`,
  `artifact_missing_field:*`, `artifact_unsigned`.

### Runner  - `scripts/lib/arena-acceptance-runner.cjs`

Composes scheduler + gate + durable journal without reimplementing any of them.

- **A live runner refuses to construct without a durable journal file.**
- **Real operations cannot start without a fresh artifact**: no key, absent,
  expired, tampered or mismatched artifacts all refuse activation.
- Authorization is validated in **both** dry-run and live modes; only side effects differ.
- `preflight()` reports every missing precondition and any unresolved journal
  uncertainty before a session begins.
- `resumeFromJournal()` refuses to resume a journal needing reconciliation.

**Fail-closed preserved:** an uncertain write still blocks; the scheduler now also
blocks when a journal write fails (`journal_write_failed`), so no mutation proceeds
without a durable record.

## 9. Remaining blockers

1. **Nothing has touched hardware or a server.** All seams were verified with mocked
   transports only; `execFile`, `adb` and the signing key are never exercised for real here.
2. **The controller has never been launched by this seam.** The REPL contract is now
   read from the controller source and matched exactly, but no process has actually
   started against it. First real launch is the live-risk moment.
3. **Controller startup has side effects.** With no arguments it prints `ready` and
   opens a REPL; the earlier assumption that it accepted a one-shot flag was wrong and
   is now corrected. The controller's own startup validation must be confirmed during
   the authorized session.
4. **HMAC trust root is process-local.** The key must be provisioned out-of-band for
   the authorized session; there is no key rotation, revocation or audit of issuance.
5. **No reconciliation mechanism exists.** A timed-out or uncertain write still blocks
   the run and requires manual reconciliation plus fresh authorization.
6. **Device geometry unknown.** Tap coordinates are placeholders; real ones must come
   from a live screenshot during the run.
7. **No recovery test against a real crash**  - journals were replayed synthetically.

**Verified this pass:** `approved: true` in a configuration file cannot initiate
signing or activation. With no key and no artifact, arming returns
`artifact_missing`, and preflight reports both `approval_key_unavailable` and
`artifact_missing`. There is no code path that mints a signature from configuration.

## 10. Verdict

# **PARTIAL**

**PASS**  - offline scheduler, attempt-capped budgets, adapters, digest-pinned gate,
parsed foreground checks, durable synchronous journaling, honest reconciliation
reporting, complete seam wiring, and the controller REPL contract matched to source;
all mock-verified, nothing executed.

**BLOCKED**  - live or native use: no seam has run for real, no key is provisioned for
an authorized session, and no device evidence exists.

---

## 11. Phase 6  - Integration preflight (controller lifecycle & readiness)

### 11.1 Controller session-lifecycle verdict  - **PERSISTENT PROCESS REQUIRED (BLOCKING defect, fixed)**

`execute-owner.cjs` keeps run state in **module scope for its process lifetime**:
`material`, `actors`, `ids`, `deadlines`, `gateway`, plus the `done` dedupe set and
the `fenced` flag. `preflight` populates `ids`/`deadlines`; every in-duel command
(`official-*`, `crowd-D-*`, `ballot-D`, settlement) dereferences them.

The Phase 5 adapter launched **one process per command**, which discards that state:

```text
persistent process, official after preflight ? {"ok":true}
per-command spawn (fresh process)            ? FAILS: ERR_ASSERTION ids/deadlines undefined
```

It would also have re-run startup side effects on every command and broken
`reserve()`'s `done` dedupe.

**Fixed** by adding `createControllerSession()`: one controller process, commands
serialized through a promise queue so a verdict can never be attributed to the wrong
line, idempotent `close()`, and automatic fencing after `STOP_FAILED_OR_UNKNOWN`.
`createControllerSpawn()` is retained but documented as valid only for stateless commands.

### 11.2 Command compatibility  - **allowlist was wrong (fixed)**

The allowlist contained two commands the controller does not have (`verify`,
`final-inspection`) and omitted seven real ones (`create`, `accept`, `gateway`,
`broadcast`, `load-recover`, `snapshot`, `close-actors`). Corrected to the **exact**
19-command surface, with a regression test that parses the controller source and
fails if the allowlist and the controller ever diverge again.

| Group | Commands |
|---|---|
| Read-only / pre-fixture | `preflight`, `load-recover`, `status`, `snapshot`, `broadcast` |
| Fixture creation (ordered) | `create` ? `accept` ? `gateway` |
| In-duel | `official-{A,B}-{OPEN,FINAL}`, `crowd-D-{OPEN,FINAL}`, `watch-D`, `ballot-D` |
| Post-close | `settle-first`, `settle-idempotency`, `close-actors` |

Payload format is `{"command":"<name>"}` per line; success is
`{"command":..,"result":..}`; failure is `{"command":..,"status":"STOP_FAILED_OR_UNKNOWN"}`.

### 11.3 Safe operations before a fixture exists

**Safe (no fixture, no mutation):** `preflight`, `status`, `snapshot`,
`load-recover`, plus offline log inspection. `broadcast` performs a single
authenticated WebSocket probe and is **not** fixture-safe by default.

**Not safe before authorization:** `create`, `accept`, `gateway` (creates the
fixture and replaces a service), everything in-duel, and settlement.

### 11.4 Owner authorization procedure

1. Owner decides on the run and states the bounded scope.
2. Owner supplies `CLASH_ARENA_APPROVAL_KEY` **out-of-band** (=32 chars, never committed, never logged).
3. An artifact is signed listing manifest hash, plan digest, run id, window, budget and attempt caps.
4. The runner verifies signature, manifest, plan digest and window before `arm()`.
5. **No configuration flag can substitute for steps 2 - 3**  - `approved: true` alone yields
   `artifact_missing` (regression-tested).

### 11.5 Preflight checklist (owner runs, in order)

| # | Check | Expected |
|---|---|---|
| 1 | `npm run test:arena-acceptance` | 160/160 pass |
| 2 | `npx tsc --noEmit` | exit 0 |
| 3 | `preflight({artifact,key,journalFile,manifestHash,planDigest})` | `ready: true`, no blockers |
| 4 | Journal file absent or ends `completed` | `requiresReconciliation: false` |
| 5 | Controller `preflight` in a **session** | `{"ready":true}` then `result` |
| 6 | Device: A50 connected, unlocked, CLASH foreground | focus component = `com.clash.v2.dev` |
| 7 | Capture baseline screenshots + old-DRAW hashes | recorded |
| 8 | Arm scheduler before `opens_at` | `activated: true` with plan digest |

**Stop conditions:** any failed step, clock drift > 5 s, journal failure, fenced
controller, ambiguous device focus, or any write outside its phase window. Uncertain
writes remain `BLOCKED` and are never replayed.

### 11.6 Remaining blockers

1. **No controller process has ever been launched** by these seams; the session
   handshake is source-matched and mock-verified only.
2. Controller startup side effects are unverified in a real environment.
3. HMAC trust root is process-local; no rotation, revocation or issuance audit.
4. No reconciliation mechanism  - uncertain writes block by design.
5. Device geometry unknown; tap coordinates are placeholders.
6. No recovery test against a real crash.

### 11.7 Verdict

# **PARTIAL**

**PASS**  - offline suites green (160 arena tests), controller lifecycle defect fixed,
allowlist proven equal to the controller surface, approval cannot be forged from config.

**BLOCKED**  - live: no process launched, no key provisioned, no device evidence.

### 11.8 Recommended next action

Owner authorizes **one** controlled controller session launch (step 5 of the
checklist) against the local stack with no fixture creation, to confirm the
`ready`/`result` handshake and observe startup side effects. Only after that should
the bounded native run be requested.

### 11.9 Exact bounded authorization request

> I authorize **one** bounded Samsung A50 Arena acceptance run on
> `clash-live-b4-20261101`, bound to the execution manifest SHA-256 and plan digest
> stated in the signed artifact. I authorize one controller session that performs:
> `preflight`, `create` (1 Take), `accept` (1 challenge), `gateway` (1 replacement on
> loopback 55626), `watch-D`, 4 official arguments, 4 Crowd messages, 2 ballots plus
> **2 expected duplicate-ballot attempts** (attempt cap 4), `settle-first` and
> `settle-idempotency`, `snapshot`, `close-actors`. I authorize at most one magic
> link and one OTP each for actors A, B and D; no C recovery. I authorize scripted
> ADB control for at most 40 minutes. The run stops at the artifact expiry or on any
> mismatch, missed window, journal failure or uncertain write. Copying the settled
> DRAW fixture, altering the unsettled partial duel, changing any deadline, cron,
> migration, grant or RLS policy, or any production access is **not** authorized.

**Verification:** `npm run test:arena-acceptance` ? 160/160 PASS; `npx tsc --noEmit` ? exit 0;
`npm test` ? **1,396/1,396 PASS** (834 unit + 497 lifecycle + 65 release-scope), 0 fail.

1. **Launch approval**  - one controlled first launch of `execute-owner.cjs` through
   the seam against the local stack, to confirm the `ready`/`result` handshake and the
   controller's startup side effects. This is the first real process and needs its own
   authorization.
2. **Key provisioning**  - `CLASH_ARENA_APPROVAL_KEY` supplied out-of-band for the
   authorized session only; never committed, never logged.
3. **Artifact issuance**  - a signed authorization artifact naming the manifest hash,
   plan digest, run id, window, budget and attempt caps.
4. **Fresh bounded run authorization**  - actors with link/OTP allowances, one gateway
   replacement, ~40 minutes of ADB control, a hard expiry. **The 5 November approval is
   spent and must not be reused.**
5. **Device control consent**  - scripted taps, text entry and screenshots on the A50.

Until 1 - 5 are granted: no live execution, no device commands, no fixtures.


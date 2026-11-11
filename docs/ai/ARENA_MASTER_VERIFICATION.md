# ARENA MASTER VERIFICATION — Offline Scheduler

Consolidated offline verification of the Arena acceptance scheduler. This is the
single report for Phases 5, 5B, 5C and the consolidated pass.

**Scope:** offline only. No ADB, database, Auth, gateway, remote API, fixture or
live Arena action was performed. No dependencies installed, no commits, no cleanup.

---

## 1. What is implemented

| Component | File | Role |
|---|---|---|
| Scheduler engine | `scripts/lib/arena-acceptance-scheduler.cjs` | Pure orchestration: injected clock/server-clock/handlers/journal/budget. No I/O beyond `node:assert` and `node:crypto`. |
| Autonomous runner | same file — `runAutonomous()` | Timer-driven execution with injected `clock`/`sleep`; no external `tick()` needed. |
| Config loader | `scripts/lib/arena-acceptance-config.cjs` | Strict loader turning a JSON plan into scheduler inputs; no I/O. |
| Test suite | `scripts/arena-acceptance-scheduler.test.cjs` | **75 deterministic tests** with fake clocks and handlers. |
| Example plan | `scripts/arena-acceptance-schedule.example.json` | Non-authorizing dry-run configuration. |
| Entry point | `npm run test:arena-acceptance` | Runs the complete scheduler/configuration suite. |

**Effect model:** `read`, `device_read`, `api_write`, `device_write`. Mutating
effects — including device taps that submit writes — are governed identically.

---

## 2. Bugs found and fixed

| # | Defect | Severity | Fix |
|---|---|---|---|
| 1 | `guardWrite()` treated any non-`write` kind as safe; device Crowd/ballot taps bypassed phase limits | **Critical** | Effect taxonomy; every mutating effect gated |
| 2 | Authorization expiry checked only at `arm()` | **Critical** | Rechecked before every side effect |
| 3 | A supplied budget override could exceed the owner's approved amount | **Critical** | `clampBudget()` = `min(approved, requested)`; new categories throw |
| 4 | A mutating step without `budgetKey` ran uncounted | **High** | Rejected at schedule build |
| 5 | Restart restored `started` actions without resolving them | **Critical** | Uncertain in-flight writes ⇒ `BLOCKED`, never replayed |
| 6 | No autonomous loop; concurrent ticks could double-dispatch | **High** | `runAutonomous()` + `inFlight` serialization |
| 7 | Any `{ok:false}` satisfied an expected rejection | **High** | Exact `expectCode` match required |
| 8 | Scheduled demand could exceed approval | **High** | `validateDemand()` at arm |
| 9 | Recovery did not verify journal integrity or rebuild budgets | **High** | Arm-record, plan-digest, step-identity and shape checks; spent rebuilt from journal |
| 10 | A Promise timeout was treated as a clean failure | **Critical** | Timeout on a mutating step ⇒ uncertain ⇒ `BLOCKED` + `requiresReconciliation` |
| 11 | Handlers could claim read-only while mutating | **High** | `assertHandlerContract()` |
| 12 | A SHA-256 digest could be mistaken for approval | **Critical** | Live arming requires a trusted `approvalGate`; digest labelled "not an approval" |
| 13 | **`loadScheduleConfig()` reported `demand: {}` when no budget existed** | **High (fail-open)** | Demand always computed; mutations without an approval ⇒ `loadable: false` |
| 14 | Budget cap applied to expected-rejection steps, so the second duplicate ballot aborted a valid run with `budget_exhausted` | **High (functional)** | Rejections are exempt from the remaining-allowance check |
| 15 | Example schedule budget was inconsistent (`fixture` 2 vs 1; `ballot` 4 vs 2) | **High** | Watches recategorised to `spectator: 2`; duplicates are non-spending rejections |

No application production code was modified in any phase.

---

## 3. Ballot budget accounting

The distinction the review requested, now explicit and tested:

| Category | Count | Consumes allowance? |
|---|---|---|
| C native ballot (Side A) | 1 success | **Yes** |
| D API ballot (Side B) | 1 success | **Yes** |
| D duplicate ballot (attempt) | 1 attempt | **No** — server refuses it |
| C duplicate ballot (attempt) | 1 attempt | **No** — server refuses it |

- **Authorized successful ballots: 2** — matches the owner approval (C native, D API).
- **Authorized mutation attempts: 4** — 2 spend, 2 are expected rejections.
- Owner-approved limits were **not** expanded; `ballot` remains 2.
- Three *successful* ballots against a 2-ballot approval is **refused at arm**
  (`ballot: 3 scheduled, 2 approved`).

---

## 4. Tests added or updated

- **12 findings × ≥2 regression tests each** (44 tests) covering F1–F7 and 5C-1…5C-5.
- **Loader/demand integration** (4 new): demand always computed; read-only plan
  loadable without a budget; over-allowance schedule rejected; example demand exact.
- **Ballot accounting** (2 new): demand separates successes from attempts; 3 success
  ballots refused.
- **Full 35-minute lifecycle simulation** (1) — see §5.
- Existing tests updated only where 5C deliberately changed behaviour
  (timeout ⇒ `blocked`, over-demand ⇒ refused at arm).

---

## 5. Complete lifecycle simulation result

**PASS.** One test drives 23 steps with a fake clock through the entire Arena
lifecycle and asserts:

| Assertion | Result |
|---|---|
| Every step executed exactly once (23/23) | PASS |
| OPEN writes complete before FINAL opens | PASS |
| FINAL writes end before JUDGING | PASS |
| Ballots fall after JUDGING opens and before close | PASS |
| Settlement occurs only after close | PASS |
| Budgets consumed exactly: crowd 4, official 4, ballot 2, settle 2, spectator 2 | PASS |
| Both duplicate ballots recorded `expected_rejection` | PASS |
| Zero `failed` or `blocked` events | PASS |
| Terminal state `completed` | PASS |

Covered in the run: spectator admission, official arguments across both phases,
Crowd from both actors, phase captures, native ballot, two expected duplicate
rejections, settlement + idempotency replay, verdict and re-entry captures, and a
read-only final inspection after close.

Recovery is exercised separately: valid journals restore without repeating writes;
mismatched digests, missing arm records, unknown steps, malformed entries,
journaled timeouts and in-flight writes all terminate `BLOCKED`.

---

## 6. Authorization and budget safeguards

- **Explicit authorization required** to arm: `approved`, 64-hex manifest hash,
  future expiry, non-empty budget.
- **Trusted approval boundary:** live mode requires an injected `approvalGate`;
  a config's `approved: true` is not sufficient by itself.
- **Digest ≠ approval:** the plan digest identifies the plan; arm journaling says
  so explicitly. Expiry is excluded so identity is stable.
- **Budgets cannot increase:** overrides clamp down; unknown categories throw.
- **Demand validated before arming** against every approved category.
- **Per-action rechecks:** expiry, server-clock drift, phase window, budget cap and
  health — immediately before each side effect.
- **Fail-closed terminals:** `refused`, `aborted`, `expired`, `blocked`, `completed`.
- **Uncertainty blocks:** in-flight or timed-out writes never replay.
- **Example permanently non-authorizing:** `approved: false`, zero manifest hash,
  `isLiveCapable()` false.

---

## 7. Remaining unverified behaviour

- **No real adapters exist** — no ADB driver, no HTTP/RPC client, no journal file
  sink. The scheduler has never issued a real request.
- **No device interaction of any kind.** Nothing here proves native rendering.
- **Phase windows encoded from the installed contract**, not re-verified against a
  running server this pass.
- **Cancellation semantics unproven.** A Promise timeout does not cancel the
  operation; adapters must supply `reconciles: true` and a real reconciliation path,
  which is unimplemented.
- **`approvalGate` is an interface**, not an implementation — no artifact verification
  or signature checking exists.
- **Recovery has not been tested against a real crash**, only replayed journals.

---

## 8. Verification commands and actual results

```text
npm run test:arena-acceptance   →  # tests 75   # pass 75   # fail 0   (exit 0)
npx tsc --noEmit                →  exit 0, zero diagnostics
npm test                        →  # tests 1311 # pass 1311 # fail 0   (exit 0)
                                   834 unit + 412 lifecycle + 65 release-scope
```

No `not ok` lines; nothing cancelled or skipped.

---

## 9. Verdict

# **PARTIAL**

**PASS** for offline scheduler correctness, safety invariants, budget and
authorization enforcement, and simulated lifecycle behaviour.

**BLOCKED** for live or native use: no adapters, no approval-gate implementation,
no real-device evidence. Neither is authorized.

---

## 10. Exact next action

1. **Independent review of this master report and the four scheduler files.**
2. On approval, implement the thin adapters — step handlers wrapping the already
   reviewed `proposed-gateway.cjs` / `execute-owner.cjs` / `device-evidence.cjs`,
   plus a journal file sink and a real `approvalGate` that verifies a signed
   authorization artifact.
3. **Then**, and only then, request a fresh bounded run authorization. The
   5 November approval is spent.

No further hardening cycles unless a concrete critical defect appears.

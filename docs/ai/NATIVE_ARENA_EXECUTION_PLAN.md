# NATIVE ARENA EXECUTION PLAN — Deterministic A50 Acceptance

**Status: PLAN ONLY.** Nothing below was executed. No database, Auth, gateway,
or device operation was performed while preparing this document.

Supersedes no evidence. Reuses
[`../evidence/ui-completion/ACTIVE_ARENA_A50_ACCEPTANCE.md`](../evidence/ui-completion/ACTIVE_ARENA_A50_ACCEPTANCE.md)
and [`../evidence/ui-completion/ACTIVE_ARENA_AUTHORIZATION_CHECKPOINT.md`](../evidence/ui-completion/ACTIVE_ARENA_AUTHORIZATION_CHECKPOINT.md).

---

## 1. Why the last run failed (root cause)

Read from the execution journal, not inferred:

| Time (UTC) | Event |
|---|---|
| 05:57:13 | Actor C's native Crowd send confirmed; last successful action |
| 05:57 – 06:25 | **~28-minute gap with no recorded action** — the AI session driving the run was interrupted by a usage limit |
| 06:25:47 | Next command `crowd-D-OPEN` rejected **locally, before any HTTP** |

The rejection was not a backend fault. Two design properties turned the
interruption into a failure:

1. **The controller is stdin-driven** (`execute-owner.cjs` reads commands from a
   REPL over `readline`). Each step required a *live model turn* to type the next
   command. When the model session stopped, the run stopped — it had no internal
   clock.
2. **Hard local margins** (`Date.now() < deadline - 10000` for writes,
   `- 300000` for setup). After a 28-minute stall, every remaining window had
   already closed, so the guard correctly refused.

**Design conclusion: the procedure must be time-driven, not turn-driven.**
Once started, it must advance on a wall-clock schedule with no model in the loop.

## 2. Phase windows (authoritative)

From the installed contract and the previous run's returned deadlines:

```text
ACCEPT  ──t0──▶ OPEN (20 min) ──▶ FINAL ARGUMENTS (5 min) ──▶ JUDGING (5 min) ──▶ CLOSE (t0+30 min)
```

| Boundary | Offset from `t0` | Local margin enforced | Server |
|---|---:|---:|---|
| `opens_at` | +0 | — | OPEN |
| `final_arguments_at` | +20 min | writes stop 10 s early | FINAL ARGUMENTS |
| `judging_at` | +25 min | writes stop 10 s early | JUDGING |
| `closes_at` | +30 min | ballots stop 10 s early; settlement waits +2 s | CLOSED |

Verify against the **server-returned** `opens_at`/`final_arguments_at`/
`judging_at`/`closes_at` before every action. Never assume `t0 + 20`.

`t0` = the timestamp the ACCEPT response returns, not when the request was sent.
Convert to local time (Asia/Calcutta, UTC+5:30) once, at preflight, and print the
whole schedule — every later decision compares against server time.

## 3. Exact test sequence

Every row names its evidence class. **N** = native device, **API** = ordinary
authenticated HTTP, **DB** = read-only SQL, **N/A**.

### Preflight (before `t0`)

| # | Action | Class | Pass condition |
|---|---|---|---|
| P1 | Re-verify source hashes vs manifest | — | all match |
| P2 | Confirm device unlocked, foreground, exact package | N | SM-A505F, `com.clash.v2.dev` |
| P3 | Confirm C's retained session identity + lifetime ≥ 45 min | DB/API | exact profile, zero deliberate refresh |
| P4 | Recover A/B/D within allowance; verify identities | API | each exact Auth ID + profile |
| P5 | Start the one approved gateway replacement | — | loopback 55626, new PID |
| P6 | **Arm the scheduler** (see §5) | — | schedule printed and persisted |
| P7 | Capture baseline profile totals + old-DRAW hashes | DB | snapshot saved |

### Scheduled (all automatic after P6)

| # | Offset | Action | Class |
|---|---|---|---|
| S1 | 0:00 | Take (A) → challenge (B) → ACCEPT (A); reconcile exactly one pair | API |
| S2 | +0:30 | C native Watch; D API Watch | N, API |
| S3 | +2:00 | A and B OPEN official arguments | API |
| S4 | +3:00 | Capture stage: identities, OPEN, both arguments | N |
| S5 | +4:00 | C native Crowd OPEN send; capture draft + confirmed | N |
| S6 | +10:00 | D Crowd OPEN → **C captures incoming remote message** | API + N |
| S7 | +20:30 | A and B FINAL arguments | API |
| S8 | +21:30 | Capture FINAL UI (both final arguments) | N |
| S9 | +22:30 | C native Crowd FINAL send | N |
| S10 | +23:30 | D Crowd FINAL → C captures delivery | API + N |
| S11 | +25:30 | Capture JUDGING UI (ballot affordance, no vote yet) | N |
| S12 | +26:00 | **C native ballot** Side A; D API ballot Side B | N, API |
| S13 | +27:00 | D re-attempt ballot → must be refused (duplicate) | API |
| S14 | +28:00 | C re-attempt ballot → must be refused (duplicate) | N |
| S15 | +30:05 | `settle_clash` (A) | API |
| S16 | +30:20 | `settle_clash` replay → no new effects | API |
| S17 | +31:00 | Capture verdict reveal + **personal result** (ballot, reputation, coins) | N |
| S18 | +32:00 | Back; capture channel disposal | N |
| S19 | +33:00 | Re-enter Room; capture consistency | N |
| S20 | +35:00 | Final inspection + preservation snapshot | DB |

Budget: **~35 minutes** of the 30-minute window that matters, ~5 minutes of
settlement/reveal margin after close. Comfortable, but the whole schedule must be
armed **before** `t0` — that is the lesson of §1.

## 4. Existing scripts to reuse

Located under `.expo/` (private, not versioned). **None were run.**

| Script | Reuse for | Change needed |
|---|---|---|
| `execute-owner.cjs` | Actor RPCs, deadline guards, snapshot/verify | **Refactor**: expose command functions for scheduling; keep the guards |
| `proposed-gateway.cjs` | Scoped gateway for C's native writes | None (manifest-bound, already reviewed) |
| `proposed-scope.cjs` / `proposed-room-guard.cjs` | Write allowlist and room binding | None |
| `proposed-actors.cjs` | A/B/D in-memory credential holders | None |
| `device-evidence.cjs` | ADB screenshots + actions journal | **Extend**: scripted tap/type/capture sequence |
| `execution-preflight.cjs` | P1/P7 verification | None |
| `final-inspection.cjs` | S20 preservation | None |

The **36/36 offline proposal tests** already validate the gateway/scope logic.
Reuse them as the gate before arming; do not re-derive the policy.

## 5. Missing automation (the actual gap)

The only thing missing is **a scheduler that owns the clock**.

**Proposal — `run-schedule.cjs` (offline-testable, ~150 lines):**

1. Load the approved step table (offset, command, class) from a JSON file.
2. `t0` = `opens_at` from ACCEPT; compute absolute due-times once.
3. Loop on `setTimeout` to each due time; execute the next step; append to a
   journal (`started`/`ok`/`failed` + server time).
4. **No stdin.** Human/model input is never required after arming.
5. Abort immediately on: any `failed` step, a server-time mismatch > 5 s, or
   device not foreground at a native step.
6. Emit a final `schedule-complete.json` or `schedule-aborted.json`.

Device steps are **ADB actions driven by the same clock** — tap coordinates
captured at P-phase from a live screenshot, never assumed.

**Why this is enough:** every remaining unverified scenario becomes a scheduled
row. The model writes the plan once (before arming) and then only reads the
journal. A usage limit after arming no longer matters — the run completes on its
own, and if the *machine* stops, the guard fails closed and preserves state.

**Offline validation before use (no device, no DB):** feed the scheduler a fake
clock and fake step handlers; assert it fires at the right offsets, skips nothing,
aborts on injected failure, and never issues a step after `closes_at`.
This can be built and tested entirely under `scripts/*.test.cjs` conventions.

## 6. Failure and recovery

| Failure | Detection | Action |
|---|---|---|
| Any step fails | journal `failed` | **Fence immediately**; no retry of that class; preserve |
| Server clock drift > 5 s | preflight + per-step read | abort before any write |
| Device not foreground | pre-step check | abort; do not tap blind |
| Phase window missed | guard (`-10000`) | abort; **no late writes** |
| Gateway dies | health probe | abort; do not restart twice |
| Ballot rejected | response | record; do **not** substitute another actor |
| Settlement fails | response | record; leave unsettled; no manual verdict |
| Machine/AI stops | journal goes stale | **run is dead**; preserve fixture; new authorization required |

**Universal rule:** a stopped run is preserved as-is. No clock edits, no
deadline changes, no second fixture, no cleanup, no catch-up writes.

## 7. Protected-state safeguards

| Asset | Rule |
|---|---|
| Settled DRAW (Take `take_6fb7c0e28d7677bc`, Clash `cl_35eb151dd7c85fa8`, Room `ar_f8c0aa6960f7b878`) | **Read-only forever.** Compare hashes at P7 and S20; any delta aborts |
| Unsettled partial duel (Room `ar_e61d3b7de415e484`) | **Never settle, retry, or delete.** Excluded by room-scope binding |
| Gateway (PID 9840 era, port 55626) | One replacement only, manifest-bound |
| Ledgers / cron | Cron stays off; no migration, grant, or RLS change |
| Existing uncommitted work | Never cleaned, never committed |

The gateway's existing scoping already enforces room/actor/budget confinement and
fails closed — reuse it rather than reimplementing.

## 8. Required owner approvals

Nothing here is authorized yet. **The Nov 5 approval is spent** and must not be
reused. You would need to approve, explicitly:

1. **One new run authorization** naming: exact manifest hash, actors, ≤1
   link+OTP each for A/B/D (C: 0), one Take/challenge/ACCEPT, 4 official
   arguments, 4 Crowd messages, 2 ballots, 1 settlement + 1 idempotency replay.
2. **Gateway**: one replacement, loopback 55626, new room/clash scope only.
3. **Device**: ADB control of the A50 for ~40 minutes, tap/type/screenshot as
   scripted.
4. **Database reads** during the run; **writes only** via ordinary actor RPCs
   plus the app's own engine.
5. **Auth**: the A/B/D recovery allowance; no C recovery.
6. **Authorization expiry** — a hard stop time, after which the scheduler refuses.

Recommend also approving the **offline scheduler build and its tests** as a
separate, no-risk step first — it touches nothing live.

## 9. Evidence collection checklist

- [ ] Manifest hash re-verified; 46 inputs matched
- [ ] Phase boundaries printed in UTC **and** Asia/Calcutta
- [ ] Journal with server timestamps for every step
- [ ] Screenshots: OPEN stage, C draft, C confirmed, **D→C delivered**, FINAL
      stage, JUDGING, ballot submitted, duplicate refused, verdict reveal,
      personal result (ballot/reputation/coins), post-Back
- [ ] UIAutomator XML **discarded** where stale (prior known issue) — geometry
      verified against the contemporaneous screenshot only
- [ ] Realtime refs: join/leave `ok`, channel count → 0 on Back
- [ ] Settlement: pre/post snapshots, reward deltas, idempotency equality
- [ ] Old DRAW hashes byte-identical
- [ ] Preservation snapshot: all pre-existing files byte-identical
- [ ] Final classification per scenario: PASS / PARTIAL / BLOCKED / NOT TESTED

## 10. What this plan does *not* claim

It does not promise the UI behaves correctly — only that the run will be
**executed deterministically** and produce honest evidence either way. If the
FINAL or JUDGING UI is broken, this plan records that finding; it does not fix it.

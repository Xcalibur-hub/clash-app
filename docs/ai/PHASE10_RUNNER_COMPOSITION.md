# PHASE 10 — Minimal Arena Runner Composition

Offline only. No controller launched, no ADB/Auth/OTP/gateway/database/fixture
operation, no key provisioned, nothing signed, nothing committed.

Branch `arena-ui-review` @ `2b89874`, index empty, unchanged throughout.

---

## 1. Files changed

| File | Change |
|---|---|
| `scripts/lib/arena-acceptance-compose.cjs` | **new** — composition only (~200 lines) |
| `scripts/arena-acceptance-compose.test.cjs` | **new** — 20 offline tests |
| `scripts/arena-acceptance-fresh-run.json` | `broadcast` documented as denied; `closeActors` budget added; `close-actors` noted as a mutation |
| `package.json` | composition test added to both test commands |

No scheduler, adapter, process, runner or authorization module was modified. No
Phase 8 or Phase 9 file was touched.

---

## 2. Integration path and effect classifications

The gap reported after Codex was that the runner imported neither the process session
nor the adapters — they were reachable only from tests. That is now closed by one
module that joins the existing parts and adds no scheduling, authorization, budgeting
or journaling logic:

```
createControllerSession({ scriptPath, cwd })
  → createControllerAdapter({ spawn: session.spawn })
  → handler map keyed by controller command
  → validateCoverage(schedule, handlers)     // refuses before arming
  → createRunner({ handlers, journalFile, authorization, artifactLoader, approvalKey })
```

| Controller command | Effect | Budget category |
|---|---|---|
| `preflight`, `status`, `snapshot` | `read` | — |
| `load-recover` | `api_write` | `authRecovery` — **opt-in only** |
| `create`, `accept` | `api_write` | `fixture` |
| `gateway` | `api_write` | `gateway` |
| `official-A/B-OPEN/FINAL` | `api_write` | `official` |
| `crowd-D-OPEN/FINAL` | `api_write` | `crowd` |
| `watch-D` | `api_write` | `spectator` |
| `ballot-D` | `api_write` | `ballot` |
| `settle-first`, `settle-idempotency` | `api_write` | `settle` |
| `close-actors` | `api_write` | `closeActors` |
| `device:<tap>` | `device_write` | per action |
| `device:capture` | `device_read` | — |
| `broadcast` | **denied** | — |

**`close-actors` (task 6):** its body runs `actors.close()` and sets `material = null` —
it closes actor sessions and drops loaded credentials. It is a mutation of private
session state and is classified as such, with its own budget category. It is never
treated as read-only.

**`broadcast` (task 5):** absent from the execution map and documented in the template
as `denied` with the reason recorded. The command count is reconciled by *accounting*
— every one of the controller's 19 commands is either listed or explicitly denied —
not by widening the executable set. A test asserts exactly this.

---

## 3. Test results

| Command | Result |
|---|---|
| `npm run test:arena-acceptance` | **190 / 190 pass** (170 + 20 new) |
| `npx tsc --noEmit` | **PASS**, exit 0 |
| `npm test` | **1,439 / 1,439 pass** (834 unit + 540 lifecycle + 65 release-scope), 0 failures |

The 20 composition tests cover: full handler/effect coverage, denied and opt-in
commands absent from the map, `close-actors` classified as a mutation, device taps
requiring integer coordinates, and the six required failure modes —

| Failure mode | Result |
|---|---|
| Missing handler | **blocked** — `validateCoverage` refuses before arming |
| Unauthorized command | **blocked** — `broadcast`/`load-recover` absent; unsafe tokens rejected before dispatch |
| Signed plan mismatch | **blocked** — `artifact_plan_mismatch`, nothing dispatched |
| Controller fencing | **blocked** — no command reaches the controller |
| Journal failure | **blocked** — `BLOCKED`/`journal_write_failed`, no effect |
| Uncertain write | **blocked** — journal recovery raises `requiresReconciliation` |

---

## 4. Remaining live-run blockers

1. **No controller process has ever been launched** through these seams.
2. **The HMAC trust root is process-local** — key provisioning and rotation are undefined.
3. **No reconciliation mechanism** — an uncertain write blocks by design.
4. **No UI outcome verification** — a tap returns `ok:true`; no `assertVisible`/`expectText`
   helper exists, so screen changes are proven by screenshots reviewed manually.
5. **Device tap coordinates are placeholders** until taken from a live screenshot.

---

## 5. Is startup-only preflight separable from mutation? — **Yes, now enforced**

`startupPreflightSteps()` produces exactly `preflight`, `status`, `snapshot` — three
read-effect steps. A test proves none of the fixture, Auth, gateway or device handlers
can appear in it, and that composing the runner dispatches **zero** commands (the
session is constructed but never started).

So a controlled startup preflight is genuinely isolated: it exercises the
`ready`/`result` handshake without credentials, fixtures or device control.

---

## 6. Remaining owner authorization

1. **Startup preflight launch** — one controller session limited to `preflight`,
   `status`, `snapshot`, then `close-actors`. No fixture, no Auth.
2. **`load-recover` approval** — separate and explicit; it loads credentials and issues
   magic links + OTP for A, B and D.
3. **Key provisioning** — `CLASH_ARENA_APPROVAL_KEY` out-of-band.
4. **Signed artifact** pinning the computed plan digest, budgets and attempt caps.
5. **Fresh bounded run authorization** — **the 5 November approval is spent.**
6. **Device consent** — scripted taps, text entry, screenshots.

---

## Preservation

Branch, HEAD and empty index unchanged; both execution directories intact; settled DRAW
and the unsettled partial duel untouched; Phase 8/9 changes preserved; the published
C1/C2 checkpoint was neither merged nor reconstructed.

## Verdict

# **PARTIAL**

The integration gap is closed and every safety boundary is enforced offline. The runner
is not yet proven against a real controller — startup preflight is the minimal next step.

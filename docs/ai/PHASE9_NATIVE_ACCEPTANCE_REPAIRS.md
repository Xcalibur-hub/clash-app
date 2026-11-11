# PHASE 9 — Minimal Native Acceptance Execution Repairs

Offline repairs only. No controller was launched; no ADB, Auth, database, gateway,
fixture or network operation was performed. No commit, push, or cleanup.

Branch `arena-ui-review` @ `2b89874`, index empty, unchanged throughout.

---

## 1. Blockers fixed

| # | Blocker | Fix | Files |
|---|---|---|---|
| 1 | Scheduler refused any run armed after OPEN began (`now >= opens_at` → `late_start`), so a valid already-started window could never be armed | Mid-window arming now allowed when **all** hold: deadlines are self-consistent (phase plan verified), the server clock matches, every remaining mutating step still fits its own window minus the 10 s margin, and the authorization outlives the last step. Refusals are specific: `window_closed`, `insufficient_window:<step>`, `authorization_expires_before_plan_end`. No clock is moved and no phase extended; the armed record carries `lateStart` | `scripts/lib/arena-acceptance-scheduler.cjs` |
| 2 | The approval gate was consulted **before** the plan digest existed, so the artifact could never bind the actual plan; and nothing compared the executed plan to the signed limits | The gate is now called from `finishArm` with the **computed** digest. The executed plan is compared to the artifact: `artifact_budget_exceeds_signed:<cat>`, `artifact_attempts_exceed_signed:<cat>`, `artifact_run_mismatch`. Mismatch or missing field refuses before any effect | `arena-acceptance-scheduler.cjs` |
| 3 | Controller transport: (a) output arriving before a reader attached was lost; (b) a failed start leaked state; (c) unparsable responses did not fence; (d) commands could continue after an unknown outcome | (a) early lines are buffered and replayed, and a final unterminated line on exit is still consumed; (b) spawn failure throws `CONTROLLER_START_FAILED`, read/write on a closed child rejects `CONTROLLER_EXITED`, stdout errors reject pending readers; (c)+(d) every unattributable outcome — unparsable, mismatched command, fenced controller, transport error — sets the session fenced and returns `fenced: true`; all later commands return `session_closed`/`controller_fenced` | `arena-acceptance-process.cjs` |
| 4 | Historical controller reuse risk | Added `scripts/arena-acceptance-fresh-run.json`: a **template only**, with `approved: false`, null manifest/run/journal, no credentials, no PIDs, no personal paths, no identifiers from the spent 5 November run, and `priorRunReuse: "forbidden"` | new template |
| 5 | Device captures discarded the PNG bytes and returned `ok: true` unconditionally | `capture()` now requires non-empty bytes **and** an injected `saveCapture` seam, returns `evidence: {name, file, bytes}`, and fails with `capture_empty` / `capture_store_unconfigured` / `capture_not_persisted`. A successful tap still never implies a vote or navigation | `arena-acceptance-adapters.cjs` |
| — | `load-recover` was classified read-only | Reclassified as **`auth`** — it loads credentials and performs magic-link/OTP recovery for A, B and D. Exposed via `CONTROLLER_COMMAND_CLASS` and `isReadOnlyCommand()`; only `preflight`, `status`, `snapshot` are read-only | `arena-acceptance-process.cjs` |

---

## 2. Tests performed

| Command | Result |
|---|---|
| `npm run test:arena-acceptance` | **170 / 170 pass, 0 fail** |
| `npx tsc --noEmit` | **PASS**, exit 0 |
| `npm test` | **1,419 / 1,419 pass** (834 unit + 520 lifecycle + 65 release-scope), 0 fail |

Focused additions (not padding — each pins a corrected boundary): mid-window arming
accepted and refused in three distinct ways (4); digest-bound gate and signed-limit
comparison (exercised by the reworked runner test); session fencing on unparsable,
mismatched and start-failed responses (2); `load-recover` classification (1);
capture preservation, empty/unstored capture failures (4); fresh-run template hygiene (1).

---

## 3. Remaining blockers

1. **No controller process has ever been launched** by these seams. The REPL
   contract and lifecycle are source-matched and mock-verified only.
2. **Controller startup side effects are unverified** in a real environment.
3. **HMAC trust root is process-local** — no key rotation, revocation or issuance audit.
4. **No reconciliation mechanism** — a timed-out or uncertain write blocks the run by
   design and needs manual reconciliation plus fresh authorization.
5. **Device geometry unknown** — tap coordinates remain placeholders.
6. **No recovery test against a real crash** — journals replayed synthetically.
7. **Brief artifact plan digest is unknowable before arming** — an owner must sign the
   digest produced by the exact plan that will run. Operationally this means: build and
   validate the plan offline, compute its digest, then sign. The template pins nothing.

---

## 4. Readiness

# **PARTIAL**

The five blockers are corrected offline and the runner now refuses to proceed on any
binding, transport or evidence defect. It is **not READY** for fresh authorization
until blockers 1–3 above are closed by a real launch, a provisioned key and a signed
artifact.

---

## 5. Operations requiring owner approval

1. One controlled controller **launch** through the seam against the local stack, no fixture.
2. `CLASH_ARENA_APPROVAL_KEY` provisioned out-of-band (never committed or logged).
3. A **signed artifact** for a specific computed plan digest.
4. A fresh bounded run authorization (actors, link/OTP allowances, one gateway
   replacement, ~40 min ADB control, hard expiry). **The 5 November approval is spent.**
5. Device control consent for scripted taps, text entry and screenshots.
6. Separate explicit approval for `load-recover`, because it performs Auth recovery.

---

## 6. Preservation

- Branch `arena-ui-review` and HEAD `2b89874` unchanged; index empty; nothing committed.
- The settled DRAW fixture and the unsettled partial duel were **not touched**; both
  execution directories remain as found.
- No application feature code, migration, grant or RLS policy was modified by this task.
  The uncommitted `app/`, `components/`, `services/` and `supabase/` changes present in
  the tree are the pre-existing Phase 8 product fixes, preserved as-is.
- Evidence under `docs/evidence/` is unmodified.

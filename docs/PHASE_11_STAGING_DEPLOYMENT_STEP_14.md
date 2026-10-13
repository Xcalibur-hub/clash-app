# Phase 11 Step 14 — Staging Edge Function Deployment

**Baseline:** `cbe805c` → deployed from pinned commit **`644cde87db0210c318af81d8a8023f0d53adf243`**.
**Target:** `clash-staging` / `zrutlrhhvfcsmssjiijl` (only).
**Credential:** Windows Credential Manager `CLASH/staging/zrutlrhhvfcsmssjiijl/management` — value never
printed, logged, written to a file or passed as an argument.
**Evidence:** `docs/evidence/phase-11-14/`.

## Verdict

**DEPLOYED AND VERIFIED — 4/4 functions live with `verify_jwt=true` and four 401 negative-authentication
results.** No partial state, no unexpected function, no hosted change outside the authorized scope.

**Staging remains QUARANTINED; `clash-maintenance` remains inactive.** Database, Auth, secrets and cron
were not touched.

---

## 1. Execution

Single automated run from the pinned commit, guarded by the reviewed script; the helper additionally
cross-checked its own scope against the manifest before touching anything.

```
SCOPE_OK functions=[vault-media-access,course-lesson-media-access,creator-ai,digital-creator] cli=2.40.7 ref=zrutlrhhvfcsmssjiijl
PIN_OK   head=644cde87db0210c318af81d8a8023f0d53adf243 tree_clean=True
DEPLOY_EXIT=0
```

| Gate (before any mutation) | Result |
|---|---|
| Credential retrieval from Credential Manager | ✅ `kind=sbp_pat` (value never read into evidence) |
| Helper ↔ manifest scope cross-check | ✅ exact four-function set, CLI pin `2.40.7`, ref match |
| Project identity (`--confirm-project`) | ✅ `zrutlrhhvfcsmssjiijl` |
| Function allowlist | ✅ 4 approved; `arena-editorial` / `arena-gifs` refused as out of set |
| Commit pin | ✅ HEAD == `644cde87…`, working tree clean (detached checkout) |
| Repository inputs | ✅ six functions present; `config.toml` `verify_jwt` matches the manifest |
| **Pinned CLI version (actual run)** | ✅ **`CLI 2.40.7`** |
| Secret prerequisites (selected set only) | ✅ none required; secrets API **not called** |
| Pre-mutation inventory read-back | ✅ `0 function(s) already deployed` |

Deploy timings: `vault-media-access` 11.4 s · `course-lesson-media-access` 8.8 s · `creator-ai` 8.8 s ·
`digital-creator` 8.9 s.

## 2. Deployed inventory (read back from the Management API)

| Function | Deployed | Version | `verify_jwt` | Pass |
|---|---|---|---|---|
| `vault-media-access` | ✅ | 1 | **true** | ✅ |
| `course-lesson-media-access` | ✅ | 1 | **true** | ✅ |
| `creator-ai` | ✅ | 1 | **true** | ✅ |
| `digital-creator` | ✅ | 1 | **true** | ✅ |

Unexpected deployed functions: **none** · missing expected functions: **none**.
Strict checks: a `null`/absent/ambiguous or mismatched `verify_jwt` fails closed — all four are literal
booleans equal to the reviewed expectation.

## 3. Negative-authentication verification

Unauthenticated `POST {}` to each function, independently re-run after deployment:

| Function | Status | Expected | Result |
|---|---|---|---|
| `vault-media-access` | 401 | 401 | ✅ |
| `course-lesson-media-access` | 401 | 401 | ✅ |
| `creator-ai` | 401 | 401 | ✅ |
| `digital-creator` | 401 | 401 | ✅ |

**4/4 401s.** Platform JWT verification is enforcing on every deployed function.

## 4. Independent verification (separate read-only pass)

`--expect <four>` with `requireAll` and strict boolean JWT checking:

```
result = VERIFIED
inventory_check.ok = true   (all four: deployed=true, version=1, verify_jwt=true, pass=true)
notAllowlisted = []         missing = []
smoke_check.ok = true       4/4 unauthenticated calls returned 401
```

## 5. Confirmation that nothing else changed

A separate read-only `verify-complete` run after the deployment returned `exit 0`:

| Fact | Value |
|---|---|
| Ledger | **106** rows, hashes verified |
| `clash-maintenance` | exactly one job, **`active=false`**, **quiescent** |
| Storage | 2 buckets, **0** auth users, **0** objects |
| Schema drift | none |

So the deployment touched only the Edge Function layer: **no database write, no Auth change, no secret
change, no cron change**.

## 6. Partial-state handling (policy — not triggered)

The run completed all four deployments; no partial state existed. Had a deploy failed mid-set, the
script's behaviour is:

- it stops immediately with `result: "STOPPED"`, the failing function's redacted error, and the
  inventory read-back already captured in the evidence;
- it **does not retry and does not roll back automatically** (per this step's instruction);
- the app feature-detects each function, so a partially deployed set fails only the affected feature
  (private media, Creator AI, or Digital Creator) and the evidence records exactly which functions are
  live and with which `verify_jwt` state.

**Recovery, if ever needed** (requires its own authorization):
1. inspect `deploy-evidence.json` for the last successful deploy and the failure reason;
2. re-run the same pinned command with `--only <remaining functions>` — it is idempotent and touches
   only the named set;
3. or restore the previous version for a single function by checking out the last-good commit for that
   directory and re-deploying just that function.

## 7. What remains outside this step

| Item | State |
|---|---|
| `arena-editorial` | **Not deployed** — pending `ARENA_EDITORIAL_RUN_SECRET` (≥32 chars) and its own authorization |
| `arena-gifs` | **Not deployed** — pending the optional GIF integration decision and `TENOR_API_KEY` |
| Cron reactivation | **Not performed** — needs separate one-time authorization (Step 10 runbook) |
| Quarantine lift | **Not performed** — needs separate authorization |
| Production deployment | **Not performed** |

## 8. Boundaries observed

Exactly the four authorized functions were deployed, to exactly `zrutlrhhvfcsmssjiijl`. No other
function, no hosted database write, no Auth configuration change, no secret creation or change, no cron
reactivation, no fixture creation, no quarantine removal. The stored token is project-restricted and
was used only as an in-memory `Authorization` header; evidence records `secrets_read: false` and
`secret_values_present: false`. The worktree was returned to
`feat/phase-11-backend-security-7` at `644cde87…` with a clean tree.

## Evidence index (`docs/evidence/phase-11-14/`)

| File | Content |
|---|---|
| `step14-summary.json` | compact sanitized summary (pin, gates, versions, 401s, result) |
| `deployment-evidence.json` | full execution evidence (10 gates, timings, inventory, smoke) |
| `independent-verification.json` | separate read-only verification pass (`VERIFIED`) |
| `database-unchanged-verification.json` (+`-outcome.json`) | post-deployment database/cron confirmation |

## Handoff

Branch `feat/phase-11-backend-security-7`. Draft PR:
`https://github.com/Xcalibur-hub/clash-app/pull/new/feat/phase-11-backend-security-7`.

Recommended next authorizations, each separate: (a) deploy `arena-editorial` once its run secret is
stored; (b) decide on `arena-gifs`; (c) cron reactivation via the Step 10 runbook; (d) quarantine lift
after the hosted functional smoke phase.


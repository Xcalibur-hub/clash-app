# Phase 11 Step 6N: Safe resume executor implementation

**Mode:** FILE-ONLY. No hosted connection, resume execution, cron changes, or ledger repair.

**Baseline:** PR #60 / `75ba8149b160f7c2bb1eba70f34993259bc1c35e`.  
**Worktree:** `C:/p116n`, branch `feat/phase-11-staging-resume-6n`.

## Verdict

| Layer | Status |
|---|---|
| Offline executor implementation + tests | **READY** |
| Operational recovery of clash-staging | **BLOCKED** until separately authorized **cron pause**, then authorized **`resume`** |

Staging remains **QUARANTINED**. This step does not run recovery.

## 1. Executor source revision

| Item | Value |
|---|---|
| Implementation branch head | `e48f73ccc3360ae6c526eeea60ca0626d93b89cf` (PR head may include docs-only follow-ups) |
| Baseline | `75ba8149b160f7c2bb1eba70f34993259bc1c35e` |
| New code | `tools/hosted-staging/resume.go`, `resume_test.go`; wiring in `executor.go` / `main.go` |
| Empty-DB `migrate` / `preflight` | **Unchanged** — nonempty ledger still refused for `migrate` |

## 2. Resume authorization and target

| Item | Value |
|---|---|
| Mode | `resume` |
| Authorization | `resume:zrutlrhhvfcsmssjiijl` |
| Project | `clash-staging` / `zrutlrhhvfcsmssjiijl` |
| Connection | direct IPv6 only; pinned CA; TLS ≥1.2 (existing `connection()`) |
| Manifest pin | **`5c39f97c62559b1f5ed175be409480fb3515fded61a16f0b1b33cc3e22768110`** |
| Artifact 44 pin | **`380b693fd09edcefbe30028c8ed5de72ae9716776198f1d45c6ed8a1ef17f261`** |
| Seal / frozen blob | `a92a550…` / `a9b30736…` |

## 3. Recovery preflight design

Dedicated **`resumePreflight`** (not the empty-DB preflight):

1. Artifact gates: corrected manifest, 106 files, seal lineage, corrected artifact 44 hash/path prefix
2. `BEGIN READ ONLY` + 15s statement timeout
3. Identity / PG17 / backend SSL
4. Managed `pgcrypto` 1.3 in `extensions` with owner allowlist (`postgres`|`supabase_admin`)
5. Managed services inventory
6. Unexpected schema names must be empty (allowlist unchanged)
7. Auth users / storage objects / buckets must be false
8. Prefix-43 **dependencies present** (`explore_challenges`, treasure tables, `profiles`, `media_objects`)
9. Migration-44 **objects absent** (same probes as investigate)
10. Ledger **exactly 43** rows: order, names, statement digests vs artifacts 1–43 (never inferred from max version alone)
11. Cron catalog present; **`clash-maintenance` must exist and be inactive**

Evidence: `resume-preflight.json` in the fresh run directory.

## 4. Ledger prefix verification strategy

`verifyExactLedgerPrefix(ledger, artifacts, expectedCount)`:

- Length must equal `expectedCount` (43 before apply; 43+N after N successful resume commits)
- Each index `i` matches artifact `i` version, name, and statement SHA-256
- Rejects duplicates and reorders
- When `expectedCount == 43`, additionally rejects any ledger row for migration 44

Resume start index is fixed at **43** (0-based); position is never taken from `max(version)`.

## 5. Transaction and concurrency guarantees

**Per migration (44–106):** `BEGIN` → SQL → ledger `INSERT` → `COMMIT` (same atomicity as `migrate`).

**After each success:** revalidate full ledger prefix of length `43+completed`.

**Failures:** stop; rollback (or rollback-unconfirmed / commit-unknown → quarantine); no retry, skip, repair, or auto-continue.

**Concurrency:** session `pg_try_advisory_lock(872314059)` after preflight; fail closed if unavailable; unlock on exit; revalidate ledger immediately after lock acquisition.

**Not done:** ledger CREATE (assumes table exists from prior migrate); destructive reset; pooler fallback; cron mutation.

## 6. Cron safety decision

| Assessment | Detail |
|---|---|
| Risk | Active `clash-maintenance` (`run_maintenance(500)` every minute) can contend on locks with recovery DDL |
| Empty-data baseline | Limits destructive side effects, but does **not** eliminate lock/deadlock uncertainty |
| Executor policy | **Fail closed:** active job → refuse resume |
| Required before 6O | Separately authorize **pause/disable** of `clash-maintenance` (job may remain, `active=false`), then authorize resume |

Do not unschedule from this step.

## 7. Tests and failure paths

| Case | Result |
|---|---|
| Exact prefix 43 → apply 63 | PASS |
| Prefix 42 / 44 | Rejected |
| Reorder / hash mismatch / duplicate | Rejected |
| Unexpected mig-44 objects | Rejected |
| Old manifest / wrong CA / wrong target | Rejected |
| Active cron / concurrent lock | Rejected |
| SQL fail at 44 (no advance) | PASS |
| Fail after later commit (no continue) | PASS |
| Commit-unknown / rollback-unconfirmed | Quarantine errors |
| No secrets in evidence | PASS |
| Fresh `migrate` still rejects nonempty ledger | PASS |
| Node compatibility / pgcrypto assert (16) | PASS |
| `go test ./...` / `go vet` | PASS |

## 8. Manifest and source integrity

| Item | Status |
|---|---|
| Compatibility manifest | `5c39f97c…` (6M) |
| Suite manifest | `12cac2a2…` unchanged |
| Frozen seal blob | `a9b30736…` unchanged |
| Source migrations | Unchanged (artifacts only from generator) |

## 9. READY / BLOCKED

- **Offline resume executor: READY**
- **Hosted recovery: BLOCKED** on cron pause authorization, then explicit `resume:zrutlrhhvfcsmssjiijl`

## 10. Exact separate authorization for Step 6O

1. **Cron pause** (write): deactivate `clash-maintenance` without deleting recovery history; verify `active=false`.
2. Fresh **`investigate`** confirming still 43/43, mig-44 absent, cron inactive.
3. **`resume:zrutlrhhvfcsmssjiijl`** once, config pinned to manifest **`5c39f97c…`**, direct IPv6, fresh evidence dir, this executor revision; stop-and-quarantine on any failure.
4. Post-resume: ledger 106 verification; then separate auth for inventory/fixtures as needed.

Do **not** run full empty-DB `migrate` against nonempty ledger.

## Evidence

[docs/evidence/phase-11-6n/](evidence/phase-11-6n/)

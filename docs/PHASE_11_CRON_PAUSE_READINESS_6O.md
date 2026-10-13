# Phase 11 Step 6O: Hosted cron pause safety preparation

**Mode:** FILE-ONLY. No hosted connection, pause execution, resume, migrate, or ledger changes.

**Baseline:** PR #61 / `b15a2f47dd86258a6d7012b7f9824dad3635f9d2`.  
**Worktree:** `C:/p116o`, branch `feat/phase-11-cron-pause-6o`.

## Verdict: READY (offline) — see also 6O.1 hardening

The fail-closed **`pause-cron`** executor path is implemented and tested. Rollback/quiescence fail-closed hardening is in [Step 6O.1](PHASE_11_CRON_PAUSE_HARDENING_6O1.md). **Do not treat this as authorization to pause hosted cron.** Staging remains **QUARANTINED**.

| Layer | Status |
|---|---|
| Offline `pause-cron` implementation + tests | **READY** |
| Live pause on clash-staging | **NOT authorized** (separate Step 6P-class write) |

## 1. Exact cron-pause mechanism

| Item | Value |
|---|---|
| API | `cron.alter_job(job_id, null, null, null, null, false)` |
| Effect | Sets **only** `active=false` on the matched job |
| Refused fallbacks | `cron.unschedule`, DELETE, UPDATE of schedule/command, recreate |
| Gate | `to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)')` must exist |

Rationale: migration `20260927030000_clash_scheduler.sql` schedules `clash-maintenance`; Step 6N resume refuses an **active** job. Pausing preserves job history/identity for later re-enable under separate auth, unlike unschedule.

## 2. Expected job identity

From Step 6L inventory + scheduler migration contract:

| Field | Expected |
|---|---|
| `jobname` | `clash-maintenance` |
| Count | **Exactly one** |
| `schedule` | `* * * * *` |
| `command` | `select public.run_maintenance(500)` |
| `username` | `postgres` |
| Before pause | typically `active=true` (already-inactive is verified, no write) |

Authorization: **`pause-cron:zrutlrhhvfcsmssjiijl`**  
Target: direct IPv6 `db.zrutlrhhvfcsmssjiijl.supabase.co:5432`, pinned CA, identity/TLS gates unchanged.

## 3. Transaction and quiescence guarantees

1. Identity + cron catalog + `alter_job` availability probes  
2. Advisory lock `pg_try_advisory_lock(872314060)` (distinct from resume key)  
3. Load/validate single expected job  
4. If `active=true`: `BEGIN` → `alter_job(..., false)` → in-txn re-read must show `active=false` → `COMMIT`  
5. If `active=false`: skip write (`already_inactive`)  
6. Bounded poll of `cron.job_run_details` **and** `pg_stat_activity` (see 6O.1) — default timeout **30s**  
7. Final catalog check: same `jobid`, still exists, `active=false`, schedule/command unchanged  
8. Unlock  

`active=false` and historical run rows alone are **not** sufficient; quiescence must clear unfinished history **and** live backends.

## 4. Failure and unknown-outcome handling

| Condition | Behavior |
|---|---|
| Missing / duplicate job | Refuse; quarantine retained |
| Unexpected schedule/command/username | Refuse |
| `alter_job` unavailable | Refuse (no unschedule fallback) |
| Permission / alter failure | Rollback; if rollback unconfirmed → quarantine |
| Commit error | `commit outcome unknown; stop and inspect, no retry` |
| Job still active after alter | Rollback/refuse |
| Still running after timeout | Refuse; quarantine retained |
| Concurrent pause (lock) | Refuse |
| Job id/config changes mid-flight | Refuse; quarantine retained |

No automatic retries, destructive recovery, or other-job mutations.

## 5. Offline tests

14 `PauseCron*` cases covering auth isolation, identity/CA, single-job selection, unexpected command, missing `alter_job`, concurrent lock, alter/rollback/commit failures, already-inactive path, quiescence success/timeout, evidence sanitization. Full `go test ./...` and `go vet` PASS.

## 6. READY / BLOCKED

- **Offline preparation: READY**
- **Live pause: BLOCKED** pending explicit write authorization

## 7. Exact separate authorization for a live pause

Authorize **one** bounded operation:

```text
hosted-staging --mode pause-cron --authorize pause-cron:zrutlrhhvfcsmssjiijl --config <private-nonsecret-config>
```

With:

- Executor revision from this PR head (rebuild + binary SHA at run time)
- Direct mode, pinned CA `7007235814…`, Windows credential (no disclosure)
- Fresh private evidence directory
- Expect `pause-cron.json` showing `wrote_active_false` or `already_inactive`, `quiescence=no_in_progress_execution`, `success=true`

Then separately authorize fresh **investigate** and **`resume:zrutlrhhvfcsmssjiijl`** (Step 6N). Do **not** combine pause+resume in one authorization unless explicitly scoped.

## Evidence

[docs/evidence/phase-11-6o/](evidence/phase-11-6o/)

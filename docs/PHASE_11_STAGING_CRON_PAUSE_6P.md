# Phase 11 Step 6P: Authorized live cron pause

**Authorization:** `pause-cron:zrutlrhhvfcsmssjiijl` (one narrowly scoped write).  
**Baseline:** PR #62 / `80b6db468e9f6f97b0391f3b04fb07054dc6329f`.  
**Worktree:** `C:/p116p`, branch `feat/phase-11-cron-pause-6p`.

## Verdict: SUCCESS (job inactive + quiescent)

Exactly one `pause-cron` completed. Staging remains **QUARANTINED**. Migration resume / reactivate / repair were **not** performed. **Do not auto-start Step 6Q.**

| Gate | Result |
|---|---|
| Executor revision | **PASS** — `80b6db468e9f6f97b0391f3b04fb07054dc6329f` (tools unchanged post-docs) |
| Binary SHA-256 | `e6265e381dee81b88dba706358aff32bd23df623d36e20b0d71681b272a68f56` |
| CA pin | **PASS** — `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7` |
| Credential | **PASS** — Windows Cred Manager `CLASH/staging/zrutlrhhvfcsmssjiijl/postgres` |
| Artifact manifest | `5c39f97c62559b1f5ed175be409480fb3515fded61a16f0b1b33cc3e22768110` |
| Direct IPv6 | **PASS** — TCP `:5432` connected (~185 ms precheck; live run exit 0 in ~6.2 s) |
| Identity / TLS | **PASS** — database/role/SSL/Postgres 17 match |
| Concurrent executor | none |

Earlier same-day attempt was **BLOCKED** on missing host IPv6 (no write). After IPv6 restored, this run used a fresh private `run_dir` and did **not** retry a failed write.

## Job identity (before → after)

| Field | Before | After |
|---|---|---|
| `jobid` | `1` | `1` (unchanged) |
| `jobname` | `clash-maintenance` | `clash-maintenance` |
| Count | exactly one | exactly one |
| `schedule` | `* * * * *` | `* * * * *` |
| `command` | `select public.run_maintenance(500)` | unchanged |
| `username` | `postgres` | `postgres` |
| `active` | **true** | **false** |

## Write and quiescence

| Item | Result |
|---|---|
| Mechanism | `cron.alter_job(job_id, active:=false)` only |
| `wrote_active_false` | **true** |
| Quiescence | `history_and_activity_clear` (`job_run_details` + `pg_stat_activity`) |
| Outcome | `success=true`, `completed_items=1`, exit 0 |
| `database_security_passed` | **false** (by design; not a security suite) |

## Quarantine / recovery

- Staging **remains QUARANTINED** (partial ledger from 6K; pause does not lift quarantine).
- Cron is verified **inactive and quiescent** — resume path is no longer blocked by an active `clash-maintenance` job.
- Next write (if any) still needs **separate** authorization (e.g. investigate + `resume:zrutlrhhvfcsmssjiijl`). Not authorized here.

## Evidence

[docs/evidence/phase-11-6p/](evidence/phase-11-6p/) — sanitized public copies. Private run under `.expo/6p-private/` (ignored).

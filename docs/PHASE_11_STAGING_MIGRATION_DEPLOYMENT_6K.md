# Phase 11 Step 6K: Controlled hosted staging migration deployment

## Result: PARTIAL APPLY — QUARANTINE

Exactly **one** authorized direct IPv6 migration attempt ran against `clash-staging` / `zrutlrhhvfcsmssjiijl` using the reviewed migrate path (Step 6H lineage `e85ce3e`, checkout `f2a2b3f`). Fresh preflight **PASS**. Migrate process exit **1**. **`completed_items=43` / 106**. Failure on artifact **`20261004120000_explore_play_system.sql`** (attempt 44). Sanitized failure: `database operation failed; diagnostics withheld`.

**Staging requires investigation. No retry, resume, reset, or ledger repair was performed.**

| Concept | Status |
|---|---|
| Fresh preflight (mandatory gates) | **PASS** |
| Migration deployment | **PARTIAL — STOPPED** |
| Ledger verification (full 106) | **NOT complete** |
| Quarantine | **YES** |
| SQL security suites / fixtures | **NOT run** (not authorized) |
| Application security | **UNVERIFIED** |

## Executor identity

| Item | Value |
|---|---|
| Source revision | `f2a2b3f7fd5aee33bfd5b4c80e68dce95c90e354` (PR #57 baseline) |
| Migrate-path lineage | `e85ce3e4f62490d98c94b9e032d4f68a97e1485f` (unchanged vs Step 6H; `git diff` empty under `tools/hosted-staging`) |
| Rebuilt binary SHA-256 | `128cac60fa1e6f982182e8de458eb528f75154fd09baf9d5aa5838e9276db5c1` |
| Authorization used | `migrate:zrutlrhhvfcsmssjiijl` (after `preflight:zrutlrhhvfcsmssjiijl`) |
| Connection mode | `direct` (no pooler) |
| Host:port | `db.zrutlrhhvfcsmssjiijl.supabase.co:5432` |
| Database / user | `postgres` / `postgres` |
| CA SHA-256 | `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7` |
| Artifacts | 106; manifests `8f50541d…` / `12cac2a2…`; seal `a92a550…` / frozen blob `a9b30736…` |

## Pre-execution gates

| Gate | Result |
|---|---|
| Step 6J readiness docs reviewed | PASS (`READY`) |
| Executor migrate path vs 6H unchanged | PASS |
| Checkout pin `f2a2b3f` + frozen artifacts | PASS |
| Rebuild + binary hash | PASS |
| 245 source / 106 artifact / pinned manifests | PASS |
| `go test` / `go vet` | PASS |
| Pinned CA + direct IPv6 AAAA + TCP CONNECTED | PASS (~210 ms) |
| Windows credential reuse (no disclosure) | PASS (`CLASH/staging/zrutlrhhvfcsmssjiijl/postgres`) |
| Fresh private evidence dirs + NTFS ACL | PASS |
| Empty-app baseline (via fresh preflight) | PASS |
| Cron activation safety (empty baseline) | PASS — see below |
| Concurrent local hosted-staging process | None observed |

### Cron safety (gate 11)

`20260927030000_clash_scheduler.sql` schedules bounded, idempotent `public.run_maintenance(500)` every minute when `pg_cron` is available. Fresh preflight required empty auth/storage data, zero public application objects, and empty ledger **before** migrate. On that baseline, maintenance sweeps are no-ops against user/application rows—not destructive resets. Cron is an approved side effect of the frozen set; no unschedule or frozen-SQL change was performed.

**Post-partial observation:** migration **#13** (`clash_scheduler`) is among the **43 committed** artifacts, so `clash-maintenance` **may be active**. No additional connection was opened after failure to inventory `cron.job`.

## Fresh preflight

Separate single-use run dir `preflight-attempt-1` with `--authorize preflight:zrutlrhhvfcsmssjiijl`.

| Gate | Result |
|---|---|
| Identity / backend SSL / PG17 | PASS (`failure_reason=none`) |
| `pgcrypto` 1.3 / `extensions` / owner `postgres` | PASS |
| Managed / restricted role/files / publication | PASS |
| `unexpected_schemas` | 0 |
| Auth users / storage objects / buckets | false |
| Application ledger entries | **0** |
| Process / outcome | exit 0 / `success=true` |

`database_security_passed` remains **false** by executor design (no security sign-off implied).

## Migration deployment

Separate single-use run dir `migrate-attempt-1` with `--authorize migrate:zrutlrhhvfcsmssjiijl`.

| Metric | Value |
|---|---|
| Attempted | 44 (first failure stop) |
| Completed (committed + ledgered) | **43** |
| Remaining frozen artifacts | **63** |
| Last successful | `20261003200000_explore_for_you_ia.sql` |
| Failed on | `20261004120000_explore_play_system.sql` |
| Elapsed | ~604176 ms |
| Retry / skip / reorder / resume | **None** |
| Outcome | `success=false` |

Executor behavior matched the reviewed contract: stop-on-first-failure; sanitized error only; no automatic second attempt.

## Ledger verification

| Check | Result |
|---|---|
| Full 106 ledger match | **NOT achieved** |
| Executor `completed_items` | 43 |
| Live post-failure ledger re-query | **Not performed** (no additional connection after failure; avoids unauthorized extra ops) |
| Limitation | Quarantine assumes 43 successful per-migration transactions committed with ledger rows; server truth requires a **separately authorized** read-only inspection |

## Failure / quarantine status

- **Status:** `QUARANTINE — PARTIAL MIGRATION`
- **Do not** retry migrate, resume from ledger, reset the project, or repair ledger rows without new authorization.
- **Do not** treat staging as release-ready or security-verified.
- Root cause of `explore_play_system` failure is **not** established from sanitized evidence alone (SQL diagnostics withheld by design).

## Remaining application security requirements

Still required under **separate** authorization after any approved recovery/completion path:

1. Complete or formally remediate the remaining migrations under a reviewed plan.
2. `inventory` / H1–H3–M1 effective privilege checks.
3. Fixture-authorized pgTAP / concurrency suites only on an approved sterile workflow.
4. Cron job inventory and maintenance behavior on hosted.
5. Application origin allowlists, Edge/Realtime/Storage, and client verification — out of scope here.

## Recommended next authorization

**Read-only investigation** of clash-staging (ledger row count/names, whether attempt 44 rolled back, `cron.job` for `clash-maintenance`, and a bounded error-classification diagnostic that does not mutate schema), then a **separately written** recovery/completion authorization. Do **not** authorize blind resume or reset from this report alone.

## Evidence

[docs/evidence/phase-11-6k/](evidence/phase-11-6k/)

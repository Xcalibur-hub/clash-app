# Phase 11 Step 5Z: Authorized read-only staging preflight

## Result: BLOCKED -- backend SSL requirement failed

Exactly **one** authorized invocation ran on 2026-10-12. It exited **1**, `backend_ssl_required`. The executor preserved the individual gate results, rolled back the read-only transaction and closed the connection without a reported cleanup failure. No retry, second invocation, alternate endpoint, migration, SQL suite, fixture or database modification was performed.

**Staging is NOT eligible for a migration attempt under the existing requirements. Application security remains unverified.**

## Individual identity results

| Condition | Observed result |
|---|---|
| `current_database() = postgres` | true |
| `current_user = postgres` | true |
| `session_user = postgres` | true |
| Backend `pg_stat_ssl.ssl` | **false** (not unknown) |
| PostgreSQL major version 17 | true |
| Gate refusal code | `backend_ssl_required` |

The backend-SSL condition was the failed prerequisite in this attempt. It is a direct observation, not a missing-row/NULL inference. The query selects SSL for `pid=pg_backend_pid()` in the same statement as identity. The existing session-backend continuity checks remained active.

This identifies the current failure matching Step 5X's combined error; it cannot retroactively prove the unrecorded Step 5X values were identical.

## TLS interpretation and target identity

The reviewed pgx configuration uses the pinned explicit CA, certificate-chain and hostname verification, TLS >=1.2 and no plaintext fallback. The successful connection and SQL gate execution show that client-to-pooler TLS/authentication completed under that configuration. `pg_stat_ssl` observes the PostgreSQL backend connection, which through the shared pooler is a distinct hop. **That backend connection reported SSL false.** No backend SSL bypass, warning-only conversion or certificate relaxation was applied.

Neither TLS on either hop nor generic `postgres` database/role names independently establishes project identity. Independent authenticated management metadata confirmed the exact owner-created target:

- `clash-staging` / `zrutlrhhvfcsmssjiijl`, `ACTIVE_HEALTHY`, owner-approved Tokyo / `ap-northeast-1`.
- Approved organization `dninpemahklihtxcjrnz`, Xcalibur-hub-2's Org, Free tier.
- Management-reported PostgreSQL `17.11.0.003`, engine 17; project created `2026-10-12T11:30:10.599833Z`.
- Owner-approved session pooler `aws-0-ap-northeast-1.pooler.supabase.com:5432`, database `postgres`, routing username `postgres.zrutlrhhvfcsmssjiijl`. Management metadata confirms the project/organization; the exact pooler endpoint is the owner's approved Dashboard configuration.

The diagnostic schema records only the PostgreSQL-17 comparison, not the exact SQL version value. Therefore **SQL confirmed major version 17; the exact SQL version was not retained**. `17.11.0.003` above is management metadata and must not be represented as a completed SQL version inventory.

## Preconditions actually verified

Fresh isolated worktree `C:/p11prez`, branch `validate/phase-11-staging-preflight-5z`, exact reviewed Step 5Y PR #49 commit `df5d8d084bbe331d8de3479e045b1b409248414e`. No executor code changed.

- **81 Node tests passed**, 0 failed/skipped.
- **52 Go top-level tests, 82 subtests, 123 leaf cases passed**, 0 failed/skipped. Counts overlap and are not additive.
- Go vet, module verification and Windows rebuild all exited 0.
- Rebuilt executable SHA-256 `3d71f3a1d8a565ae294649a8d6ae9f0607071a9cc68d60210af4dd408afa7d5a`, matching the Step 5Y offline build.
- All **245** frozen source hashes, **106** compatibility artifacts and four vendor template hashes verified.
- Frozen seal `a92a550527f810913b01f6e6411dc78996c71a06`, frozen implementation `9c71d72a15095047821789386ca9d395961bab4f`.
- Artifact manifest SHA-256 `8f50541d3eed55bd905117a217bc8118a6b5483d1ffec2e5d0477b2be71b8c8a`; suite manifest SHA-256 `12cac2a2b0119cb99110061800e14ea167f0928919da4bbd4e464dc0fbead7fe`.
- Approved CA SHA-256 `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`. Bytes matched the Step 5X independently authenticated official certificate, copied unchanged; no substitute certificate or trust-store fallback.
- Original authoritative CA provenance: [Supabase certificate download](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt), traced to official repository commit `d303c248d352308b0a233d2ba0d07cf1c31cb544` in Step 5X. No new certificate authenticity assumption based merely on filename/subject.
- Configuration/CA/evidence parent ACL restricted to owner, SYSTEM and Administrators; inheritance disabled at private root. Newly created attempt directory and outcome files checked after execution for the same permitted identities.
- Single-use evidence directory was absent before launch and claimed exactly once by the executor.
- Child environment cleared and populated only with allowlisted nonsecret Windows platform variables. Backend override prefixes and `CLASH_STAGING_PASSWORD` absent.
- Existing owner-context Windows Credential Manager entry used only internally by the reviewed executor. No credential re-enrollment, reset, separate extraction, export or password display occurred.

## What ran and what stopped

One reviewed `preflight` invocation performed the TLS-verifying connection, PID binding/continuity SELECTs, BEGIN READ ONLY, identity query and ROLLBACK/connection cleanup. The four identity checks were not weakened; a false backend SSL result immediately stopped the preflight. The executor item counter is 0, not a SQL query count.

| Prerequisite / validation | Result |
|---|---|
| Independent management target/organization/region check | PASS |
| Frozen hashes/artifacts, reviewed binary, local ACL/configuration | PASS |
| Client-to-pooler TLS/authentication and session binding | Reached identity SQL successfully |
| Database/current-role/session-role and PG17 comparisons | PASS |
| Backend SSL requirement | **FAIL: observed false** |
| Installed/available extensions, pgcrypto schema/version/owner | BLOCKED; no query reached |
| Effective role inheritance/restricted privileges | BLOCKED |
| Managed Auth/Storage/Realtime, publication and cron inventory | BLOCKED |
| Unexpected application objects/data and migration ledger | BLOCKED |
| Application migrations | 0 executed; 106 not attempted |
| SQL suites / database TAP assertions | 0 suites / 0 assertions; 89 not attempted |
| H1/H2/H3/M1 effective application security | UNVERIFIED |

## Sanitized evidence and preservation

[Evidence directory](evidence/phase-11-5z/) contains the exact allowlisted `preflight.json`, failure `outcome.json`, process exit result, offline/hash verification summary and nonsecret management metadata. Private config, credentials, binary and raw environment snapshots are excluded. No password, JWT, connection URL or unrestricted SQL row is committed.

Unrelated primary-checkout status and six dirty tracked-file hashes were compared to the preservation baseline. Crew work remained unchanged. No local/hosted database other than the explicitly authorized staging target was accessed; no Docker, Expo, Android, merge or deployment operation occurred. The owner-created project and stored credential are retained unchanged. Private evidence remains protected locally.

## Remaining blocker and recommendation

Investigate the supported hosted session-pooler **backend-hop TLS** contract through documentation/source inspection or Supabase support before proposing any further runtime action. Determine whether the approved endpoint can satisfy the mandatory backend-SSL requirement without changing roles, grants, owners, RLS, credentials or endpoint implicitly. Do not treat verified frontend TLS as a substitute for backend SSL.

This attempt is consumed. No further connection, repair, retry or configuration change is authorized. A separately reviewed plan and new explicit authorization are required for another live diagnostic or any supported target/network configuration action. Migration authorization must wait until the existing strict gate and all subsequently blocked prerequisites pass.

Step 4C remains BLOCKED against existing local databases. Android Step 2F remains DEFERRED. Stop after this report and draft PR; no application-security or production-readiness claim is made.

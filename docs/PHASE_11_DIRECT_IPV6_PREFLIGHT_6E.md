# Phase 11 Step 6E: Direct IPv6 hosted preflight

## Result: BLOCKED — managed pgcrypto prerequisite mismatch

Exactly **one** authorized direct-mode preflight ran against `clash-staging` / `zrutlrhhvfcsmssjiijl` over IPv6. Exit code **1**, failure `managed pgcrypto prerequisite mismatch`. The executor preserved partial catalog evidence, rolled back the read-only transaction, and closed the connection. No retry, pooler fallback, migration, SQL suite, fixture, grant, or schema repair was performed.

**Staging is NOT eligible for a migration deployment under the existing requirements. Application security remains unverified.**

## Direct TLS and identity (PASSED)

| Condition | Observed |
|---|---|
| Client TLS | Verified TLS ≥1.2, pinned CA + hostname for `db.zrutlrhhvfcsmssjiijl.supabase.co` |
| Connection mode | `direct` (pooler host refused / unused) |
| `database_match` (`postgres`) | true |
| `current_role_match` (`postgres`) | true |
| `session_role_match` (`postgres`) | true |
| `backend_ssl_observed` | **true** |
| `postgres_17_match` | true |
| `failure_reason` | `none` |

Unlike Step 5Z (session-pooler, `backend_ssl_observed=false` / `backend_ssl_required`), the direct hop reports backend SSL true. Identity gate code: `none`.

Exact SQL version string is not retained by the diagnostic schema (major-17 match only). Management metadata still reports `17.11.0.003` from prior Step 5Z evidence and must not be re-stated as a new SQL inventory.

## Extension and managed-service results

| Check | Result |
|---|---|
| Installed `pgcrypto` | Present: version `1.3`, schema `extensions`, **owner `postgres`** |
| Required owner | Executor requires owner **`supabase_admin`** |
| Gate | **FAIL** → `managed pgcrypto prerequisite mismatch` |
| Available (catalog) | `pgcrypto`, `postgis`, `pg_cron`, `pgtap`, `dblink` listed |
| Managed Auth/Storage/Realtime presence | `managed=true`, `publication=true` |
| Restricted role / files | true |
| `cron_preloaded` | true |
| `cron_catalog` | false (no cron.job catalog) |

Later privilege/object/ledger gates did **not** become pass criteria because execution stopped at pgcrypto. Partial inventory still recorded:

- Roles / inheritance: captured (no superuser membership for current user observed in the refusal path).
- Application objects: `relations=0`, `routines=0`, `types=0`, **`unexpected_schemas=1`** (would refuse next if pgcrypto passed).
- Existing data: `users=false`, `objects=false`, `buckets=false`.
- Application ledger: **not reached** after the pgcrypto stop.

## Preconditions verified before connect

- Fresh worktree `C:/p116e`, branch `validate/phase-11-direct-ipv6-preflight-6e`, exact Step 5Y commit `df5d8d084bbe331d8de3479e045b1b409248414e`.
- Rebuilt executable SHA-256 `3d71f3a1d8a565ae294649a8d6ae9f0607071a9cc68d60210af4dd408afa7d5a` (matches Step 5Y).
- Go `test` / `vet` / `mod verify` exit 0 for `tools/hosted-staging`.
- Frozen **245** source hashes, **106** migration artifacts, artifact/suite manifests unchanged (`8f50541d…` / `12cac2a2…`).
- Pinned CA SHA-256 `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
- Private NTFS ACL on `.expo/6e-private`: owner, SYSTEM, Administrators only; inheritance disabled.
- Fresh single-use evidence dir claimed once by the executor.
- Windows Credential Manager entry `CLASH/staging/zrutlrhhvfcsmssjiijl/postgres` used internally; no reveal/reset/re-enroll.
- Child process environment scrubbed of `PG*` / `SUPABASE_*` / password overrides.
- IPv6 global address + default route present; AAAA for direct host; TCP `:5432` CONNECTED immediately before launch.

### Endpoint verification

Approved host/port matched the [official Dashboard direct connection form](https://supabase.com/docs/guides/database/connecting-to-postgres#direct-connection) `db.[PROJECT-REF].supabase.co:5432` for ref `zrutlrhhvfcsmssjiijl`. Prior authenticated management metadata (Step 5Z) binds project/org/region/status. Live Dashboard UI re-login was not completed (GitHub OAuth sign-in required; local CLI token is a different account and received HTTP 403 for this project). See [endpoint-verification.json](evidence/phase-11-6e/endpoint-verification.json).

## Remaining blockers

1. **`pgcrypto` owner is `postgres`, not `supabase_admin`** — current gate refusal. No owner change authorized here.
2. **`unexpected_schemas = 1`** — would block after a pgcrypto fix; schema name not recorded by the allowlisted inventory.
3. Ledger emptiness and remaining catalog assertions remain **unconfirmed** as pass criteria (not reached).
4. Application security (H1/H2/H3/M1) **UNVERIFIED**.
5. Step 4C remains **BLOCKED**; Android Step 2F remains **DEFERRED**.

## Migration eligibility

**Not eligible.** Do not authorize or run the 106 migrations until a separately reviewed remediation (or gate clarification) clears pgcrypto ownership and a subsequent authorized preflight passes all gates.

## What did not run

- Migrations: 0 / 106  
- SQL suites / TAP: 0 / 89  
- Second connection, retry, or session-pooler fallback  
- Credential re-enrollment, Docker, Expo, Android, merges of unrelated Crew work  

## Sanitized evidence

[docs/evidence/phase-11-6e/](evidence/phase-11-6e/) — `preflight.json`, `outcome.json`, `process-result.json`, `endpoint-verification.json`, `offline-verification.json`, prior 5Z management metadata copy. Private config, CA path, binary, and Credential Manager material are excluded.

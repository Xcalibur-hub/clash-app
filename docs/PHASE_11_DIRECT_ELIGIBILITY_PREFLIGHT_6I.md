# Phase 11 Step 6I: Direct staging eligibility preflight

## Result: PREFLIGHT PASS — migration-eligible; migrations NOT deployed

Exactly **one** authorized direct IPv6 preflight ran against `clash-staging` / `zrutlrhhvfcsmssjiijl` using the reviewed Step 6H executor (`e85ce3e`). Process exit **0**, `outcome.success=true`. All mandatory gates inside `preflight()` passed, including an **empty application migration ledger** (`application_ledger_entries=0`).

**Distinctions (required):**

| Concept | Status |
|---|---|
| Preflight compatibility | **PASS** |
| Migration eligibility | **YES** (this report only) |
| Migration deployment | **NOT performed** (not authorized) |
| Application security validation | **UNVERIFIED** |

Staging database contents were not migrated. Do not treat this as H1/H2/H3/M1 security sign-off.

## Executor identity

| Item | Value |
|---|---|
| Source revision | `e85ce3e4f62490d98c94b9e032d4f68a97e1485f` (PR #55 / Step 6H) |
| Rebuilt binary SHA-256 | `d073dfef950b591cfc9c586ac2fc2e5107a5e325d5d8bbf6d3c9e5b435b1fa16` |
| Connection mode | `direct` (no pooler) |
| Host:port | `db.zrutlrhhvfcsmssjiijl.supabase.co:5432` |
| Database / user | `postgres` / `postgres` |
| CA SHA-256 | `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7` |

## Gate results

| Gate | Result |
|---|---|
| Client TLS ≥1.2 + pinned CA + hostname | PASS |
| `database_match` / `current_role_match` / `session_role_match` | true / true / true |
| `backend_ssl_observed` | **true** |
| `postgres_17_match` | true |
| Identity `failure_reason` | `none` |
| `pgcrypto` 1.3 / `extensions` / owner `postgres` | PASS (6F allowlist) |
| Extension availability catalog | Recorded |
| Managed Auth/Storage/Realtime + publication | PASS |
| Restricted role / files; cron preloaded | PASS |
| `cron_catalog` | false (cron job query not required) |
| Public relations / routines / types | 0 / 0 / 0 |
| `unexpected_schemas` | **0** (`pgbouncer` accepted by 6H allowlist) |
| Unexpected schema names inventory | empty |
| Auth users / storage objects / buckets | false |
| Application ledger entries | **0** |
| Process / outcome success | exit 0 / `success=true` |

### Note on `database_security_passed`

The reviewed executor **always** records `database_security_passed: false` in `outcome.json` / preflight report initialization, even when `preflight()` returns nil and `success=true`. Stdout states: “No database security pass implied.” Eligibility here is based on **mandatory gate outcomes and empty ledger**, not that boolean flipping to true.

## PgBouncer metadata

The Step 6H executor **does not** include a bounded owner/object inventory for schema `pgbouncer`. Live ownership and contents on clash-staging remain **unverified**. Name allowlisting alone was used (documented in Step 6H). Recommend a separate authorized diagnostic if product requires owner/`get_auth`-only confirmation.

## Preconditions verified before connect

- Worktree `C:/p116i`, branch `validate/phase-11-direct-eligibility-preflight-6i`
- Step 6H vs parent reviewed (`pgbouncer` allowlist + regressions)
- `go test ./...` PASS; frozen **245** / **106** hashes; manifests `8f50541d…` / `12cac2a2…`
- Private NTFS ACL (owner/SYSTEM/Administrators); fresh `preflight-attempt-1`
- IPv6 global + default route; AAAA; TCP CONNECTED (~179 ms)
- Credential Manager entry reused internally; no disclosure/re-enrollment
- Primary checkout Crew dirt preserved

## Remaining uncertainties

1. `pgbouncer` owner/contents not inventoried by this executor.
2. Application security (RLS/RPC contracts on deployed schema) not exercised — database is still empty of application migrations.
3. Step 4C remains BLOCKED locally; Android Step 2F remains DEFERRED.

## Recommended next authorization

Separately authorize **migration deployment** of the frozen 106 artifacts to this exact staging target (direct mode, stop-on-first-failure, fresh evidence), or a narrower dry-run/inventory if required first. Do **not** infer deployment permission from this preflight alone.

## Evidence

[docs/evidence/phase-11-6i/](evidence/phase-11-6i/)

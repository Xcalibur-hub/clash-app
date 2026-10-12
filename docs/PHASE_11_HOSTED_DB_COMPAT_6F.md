# Phase 11 Step 6F: Hosted database compatibility investigation

**Scope:** FILE-ONLY. No live database connection, SQL, credential access, ownership changes, grants, migrations, or TLS weakening.

**Baseline:** PR #52 / `0330ef1b5ac8ede2571ecef650786957e1e6a6f7` (Step 6E).  
**Worktree:** `C:/p116f`, branch `audit/phase-11-hosted-db-compat-6f`.

## Confirmed facts (from Step 6E evidence + frozen code)

1. Direct IPv6 preflight reached identity successfully with `backend_ssl_observed=true`.
2. Installed `pgcrypto` on clash-staging was: version `1.3`, schema `extensions`, owner **`postgres`**.
3. The preflight gate previously required owner **`supabase_admin` exactly**, producing `managed pgcrypto prerequisite mismatch`.
4. Application object inventory reported `unexpected_schemas=1` with **no schema name** in evidence.
5. CLASH frozen migrations that touch pgcrypto only:
   - `create extension if not exists pgcrypto with schema extensions`
   - call `extensions.gen_random_bytes` / `extensions.digest`
   - they do **not** assert or alter extension ownership.

## Root-cause assessment — pgcrypto ownership

| Claim | Status |
|---|---|
| Owner must be `supabase_admin` for migrations to work | **Assumption** in the executor gate, not required by frozen SQL |
| Official Supabase init often creates pgcrypto under `supabase_admin` | **Documented** in supabase/postgres init scripts (role that runs bootstrap owns the extension) |
| Hosted clash-staging can present owner `postgres` | **Confirmed** by Step 6E `preflight.json` |
| `postgres` is the restricted managed database owner role on hosted | **Confirmed** by 6E role inventory (`postgres` present, not superuser) |
| Application security / EXECUTE grants depend on schema + privileges, not extowner equality to `supabase_admin` | **Evidence-backed inference** from migrations + PostgreSQL extension semantics; not re-probed live in 6F |

**Conclusion:** Requiring solely `supabase_admin` rejected a legitimate managed default observed on this staging project. Fail-closed behavior is preserved by still requiring name/version/schema and limiting owners to the managed set `{supabase_admin, postgres}`.

## Unexpected schema — safe identification plan

The count query already excludes a fixed managed allowlist. It did not return names.

**Change (implemented offline):** add `unexpected_schema_names` — `SELECT n.nspname … ORDER BY n.nspname LIMIT 32` using the **same** allowlist predicate. Evidence records names only (no `pg_class`/`pg_proc` joins, no row data). Preflight still **refuses** when `unexpected_schemas != 0` (no silent allowlist expansion without documented managed names).

**Next live step (NOT authorized here):** one read-only preflight to capture the name(s), then decide whether to add a documented managed schema to the allowlist or treat it as unexpected application state.

## Other preflight assumptions reviewed

| Assumption | Risk to fresh managed defaults | Action |
|---|---|---|
| `pgcrypto` version exactly `1.3` | Future platform upgrades could fail closed | Keep (observed on 6E); revisit only with evidence |
| `schema = extensions` | Aligns with Supabase + CLASH migrations | Keep |
| Owner only `supabase_admin` | Rejected real hosted default | **Relaxed** to `{supabase_admin, postgres}` |
| Managed schema allowlist incomplete | Can fail closed on new platform schemas | Name inventory added; allowlist unchanged pending live name |
| `cron_preloaded` required | Passed on 6E | Keep |
| Empty public objects / empty auth+storage data / empty ledger | Correct for virgin staging | Keep |

## Implemented executor changes

1. `pgcryptoManagedReady` / `pgcryptoAcceptableOwner` — accept managed owners `supabase_admin` or `postgres` with version `1.3` and schema `extensions`; reject all other owners/schemas/versions.
2. Shared `managedSchemaAllowlist` constant used by both count and name queries.
3. `unexpected_schema_names` inventory query + evidence field; still fail-closed on non-zero count.
4. Offline regressions in `compat_diagnostics_test.go` and updated denial cases (`foreign_pgcrypto_owner`, wrong schema/version).

TLS/identity gates, credential handling, connection modes, and migration SQL are unchanged.

## Offline verification

- `node tools/hosted-staging/prepare.cjs` — 245 source hashes, 106 migrations, manifests unchanged (`8f50541d…` / `12cac2a2…`).
- `go test ./...`, `go vet ./...` — PASS (hosted-staging module).
- No live connection; no Credential Manager access; primary Crew dirt untouched.

## What this does **not** authorize

- Another hosted preflight  
- Extension ownership `ALTER`, grants, schema drops  
- Migration deployment or SQL suites  
- Claiming application security verified  

**Required next authorization:** one bounded direct-mode preflight to confirm pgcrypto acceptance and record unexpected schema name(s).

## Evidence

[docs/evidence/phase-11-6f/](evidence/phase-11-6f/)

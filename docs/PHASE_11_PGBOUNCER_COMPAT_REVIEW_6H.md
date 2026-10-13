# Phase 11 Step 6H: PgBouncer managed schema compatibility review

**Mode:** FILE-ONLY. No hosted database connection, credentials, migrations, grants, or schema mutations.

**Baseline:** PR #54 / `89c0fe84663f89aefff1df9b9fd6a424acf8bce7` (Step 6G).  
**Worktree:** `C:/p116h`, branch `audit/phase-11-pgbouncer-compat-6h`.

## Step 6G failure (confirmed)

| Field | Value |
|---|---|
| Failure | `unexpected application objects; review required` |
| `unexpected_schemas` | 1 |
| Allowlisted name inventory | **`pgbouncer`** |
| Passed | Direct TLS, identity, PG17, backend SSL, managed services, empty auth/storage data, `pgcrypto` (owner `postgres`) |
| Not reached | Application ledger |
| Migration eligibility | Remained **BLOCKED** |

## Provenance investigation

### Confirmed facts

1. Step 6G sanitized evidence recorded exactly one unexpected schema name: `pgbouncer`.
2. Official **supabase/postgres** platform source provisions that schema for dedicated PgBouncer authentication:
   - [`ansible/files/pgbouncer_config/pgbouncer_auth_schema.sql`](https://github.com/supabase/postgres/blob/develop/ansible/files/pgbouncer_config/pgbouncer_auth_schema.sql): `CREATE SCHEMA pgbouncer AUTHORIZATION pgbouncer` plus `SECURITY DEFINER` `pgbouncer.get_auth`.
   - [`ansible/files/pgbouncer_config/pgbouncer.ini.j2`](https://github.com/supabase/postgres/blob/develop/ansible/files/pgbouncer_config/pgbouncer.ini.j2): `auth_query = SELECT * FROM pgbouncer.get_auth($1)`.
3. The PostgreSQL 17 schema dump in the same project lineage includes `CREATE SCHEMA pgbouncer` and `pgbouncer.get_auth` (platform image contents, not application migrations).
4. Supabase connection docs describe a **dedicated pooler** on `db.[PROJECT-REF].supabase.co:6543` (PgBouncer on the database host). That product path is consistent with on-database `pgbouncer` auth objects.
5. CLASH frozen migrations do **not** create a `pgbouncer` schema.

### Documented platform behavior

- The schema exists to support PgBouncer’s `auth_query` against Postgres roles (`pg_shadow` / `pg_authid` patterns in platform SQL).
- Presence on a fresh hosted PG17 project is expected when the platform image includes the dedicated-pooler auth bootstrap (observed on clash-staging in 6G).

### Assumptions / limits (not claimed as proven on this project)

| Item | Status |
|---|---|
| Live schema owner on clash-staging is role `pgbouncer` | **Unverified** (6G recorded name only) |
| Schema contains only platform `get_auth` (no app tables) | **Unverified** without a separately authorized content inventory |
| Name alone cannot be forged by an attacker with CREATE privilege | Residual risk shared with every other name-allowlisted managed schema (`auth`, `storage`, …); public-object emptiness gates remain |

**Decision rule applied:** Do **not** allowlist solely because the string is `pgbouncer`. Allowlist because **authoritative supabase/postgres provisioning SQL and config** create and consume that exact schema for managed pooling — matching the 6G observation on a virgin staging project.

## Compatibility decision

**ACCEPT — add `pgbouncer` to `managedSchemaAllowlist`.**

Smallest justified change:

- Append `'pgbouncer'` to the shared allowlist used by both the unexpected-schema **count** and **name** queries.
- Preserve fail-closed behavior for every other unknown schema.
- No TLS/identity/privilege/emptiness/ledger weakening.
- No ownership ALTER, grants, or hosted SQL.

Ownership/content checks were considered. Without live owner evidence, a hard `owner = pgbouncer` gate could false-fail alternate bootstrap paths (e.g. dump-created schema owned by `supabase_admin`). Those checks are **deferred** to a future authorized diagnostic if product requires stronger binding.

## Security implications

- **Positive:** Removes a false failure against documented platform surface so a future authorized preflight can reach ledger/eligibility gates.
- **Residual:** Name allowlisting does not inventory objects inside `pgbouncer`. Same model as `auth`/`storage`. Unauthorized objects placed *inside* an allowlisted schema would not trip `unexpected_schemas`.
- **Unchanged:** Public non-extension relations/routines/types must still be zero; auth users / storage objects / buckets must be empty; ledger must be empty; identity/TLS/pgcrypto gates unchanged.

## Offline verification

- `go test ./...` / `go vet ./...` in `tools/hosted-staging`
- New regressions: allowlist contains `pgbouncer`; sole managed empty inventory passes; unknown schema `app_private` still denied with name retained
- `prepare.cjs`: 245 source hashes, 106 migrations, manifests unchanged

## Remaining blockers

- Staging remains **NOT migration-eligible** until a **separately authorized** preflight passes every gate (including ledger).
- Optional future hardening: read-only owner/object inventory for `pgbouncer` only, under new authorization.

## Recommended next authorization

One bounded direct IPv6 preflight on Step 6H executor revision against `clash-staging`, fresh evidence directory, no migrations. If all gates pass, report migration eligibility separately — still do not deploy until explicitly authorized.

## Evidence

[docs/evidence/phase-11-6h/](evidence/phase-11-6h/)

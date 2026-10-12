# Phase 11 Step 5M ? Compose client authentication

Status: **offline correction verified; runtime authentication NOT verified**. 2026-10-12.

## Scope and provenance

Isolated worktree `C:/p11client`, branch `fix/phase-11-compose-client-auth`, based on PR #35 commit `d153c11efb5be3b663a2beeb4efd1802526cded2`. PR #36 records the previous bootstrap failure: `fe_sendauth: no password supplied`. That attempt remains consumed; this step authorizes no Docker or database execution.

The primary checkout and its unrelated Crew changes were preserved. No Docker commands, SQL, connections, deployments, Android actions or resource changes were performed.

## Corrections and inspected client paths

| Path | Authentication after correction | Preserved behavior |
|---|---|---|
| `lifecycle.ps1` extension bootstrap | Delegates to `client-auth.cjs`; password read from generated `compose.json`, passed as child environment `PGPASSWORD`, forwarded by Compose `exec -e PGPASSWORD` (name only) | `supabase_admin`, existing container socket endpoint, database `postgres`, same extension file, bootstrap gate and first-failure stop |
| `execute.cjs` ledger checks and all SQL suites | Same environment-only forwarding, shared argument builder | `postgres`, existing socket endpoint, `public,extensions` search path, quiet unaligned tuples, original SQL/files and test order |
| CLI migration runner | Password-free loopback URL plus child-only `PGPASSWORD` | CLI 2.40.7 version gate, user/database, port 57722, SSL mode, workdir, ordered artifact migrations and CLI transactions/ledger |

Every harness-created psql invocation now uses `-X -w -v ON_ERROR_STOP=1`. Missing, blank, non-string, NUL or line-breaking passwords are rejected before child execution. The runner strips inherited backend/PG credentials; only authenticated child processes receive the generated configuration's password. The parent process environment is not modified. There is no password in client argv, a client database URL or a shell command.

No role, endpoint, grant, search path, transaction boundary, bootstrap SQL, image, migration or managed service configuration was changed. The pinned vendor `schema.sql` consumes `PGPASSWORD` during the existing image-managed initialization; `db-entrypoint.sh` delegates to the image entrypoint and introduces no additional psql call. `pg_isready` remains the existing readiness probe, not a SQL runner. Managed Auth/Storage/PostgREST service connection configuration remains the PR #35 private generated configuration; those existing service URLs are distinct from the corrected harness client invocations and must never be committed or published.

## Logging and error boundaries

Node migration and suite evidence is redacted before file writes; parsing and TAP counting use original in-memory output. Redaction covers password fields, keys/secrets and URL userinfo passwords (encoded and decoded). Native spawn error objects are discarded; startup errors are generic. Bootstrap emits only a generic failure and saves sanitized diagnostics. Assertions comparing secret-bearing Compose objects or JWTs no longer produce value diffs.

PowerShell Docker logging now includes password and URI-password redaction. Native stderr is captured before sanitizing, including Windows PowerShell's error-record behavior. Raw Docker inspection/configuration remains private ignored scratch data required for binding verification. Never publish scratch configs, process environments or private inspections. The fixed development password also occurs as a role/database name; conservative value redaction can obscure those strings in evidence. Numeric TAP totals are unaffected.

## Separate CLI authentication review

Reviewed pinned upstream source, without invoking the migration command:

- [CLI 2.40.7 database flag parser](https://github.com/supabase/cli/blob/v2.40.7/internal/utils/flags/db_url.go): an explicit `--db-url` selects the direct branch and calls `pgconn.ParseConfig`.
- [Pinned dependencies](https://github.com/supabase/cli/blob/v2.40.7/go.mod): pgconn 1.14.3.
- [pgconn parser](https://github.com/jackc/pgconn/blob/v1.14.3/config.go): environment settings include `PGPASSWORD`; explicit connection settings override the corresponding environment settings. The new URL has no password setting.
- [Migration up](https://github.com/supabase/cli/blob/v2.40.7/internal/migration/up/up.go) and [connection helpers](https://github.com/supabase/cli/blob/v2.40.7/internal/utils/connect.go): parsed configuration feeds the existing connection and migration engine. Internal URL construction is library implementation, not harness argv or evidence; captured CLI diagnostics are sanitized.

The CLI runner still uses the reviewed direct loopback endpoint. It adds no `--password`, project linking, interactive authentication, reset, repair or alternate migration engine. Actual execution remains unverified.

## Offline verification actually executed

```text
node --test tools/isolated-supabase/offline.test.cjs tools/isolated-supabase/client-auth.test.cjs scripts/migration-compatibility-artifact.test.cjs scripts/loopback-binding-check.test.cjs scripts/migration-encoding-check.test.cjs scripts/extension-hook-preflight.test.cjs
```

Exit 0: **68 tests passed, 0 failed, 0 skipped, 0 TODO** (57 existing + 11 new).

New tests exercise configuration-derived password propagation with injected subprocess capture, missing-password rejection before spawn, inherited credential exclusion, parent/environment isolation, both psql roles/flags, password-free CLI arguments, password/key/URI redaction, generic process errors, malformed configuration errors, lifecycle wiring, unauthorized bootstrap entry, and actual execution of the PowerShell logger with a mocked Docker function. No Docker executable is invoked by these tests.

Existing tests reverified all **245 frozen source hashes**, **106 deterministic compatibility artifacts**, exactly **three BOM removals and the reviewed migration-44 correction**, vendor hashes, bindings policy, TAP accounting and all 89 prepared suite files including nine designated concurrency suites. These are artifact checks, not SQL results.

`node --check` passed for both changed execution modules. Windows PowerShell parser reported no errors for `lifecycle.ps1`. Primary-checkout status matched the initial modified/untracked file list.

## Remaining runtime assumptions and prerequisites

- Compose must forward name-only `-e PGPASSWORD` from the Docker client's child environment as expected. Offline tests inspect the actual constructed argv/environment but do not prove Docker execution.
- The image-managed bootstrap must establish the existing role/password contract. No role authentication, extension prerequisites or SQL behavior was retested here.
- Windows ACL protection for private generated files and visibility of child environment to local privileged processes remain operational considerations. No secrets were put in command arguments or committed evidence.
- A **separate explicit authorization for one NEW disposable validation attempt** is required to test the corrected bootstrap, pinned CLI migration runner, all 106 migrations and 89 SQL suites/concurrency checks. Existing local and hosted databases remain excluded. Stop at first failure; no automatic repair/retry.
- Step 4C remains blocked against the existing local database; Android Step 2F remains deferred.

Only the authentication helper, its offline tests, lifecycle/executor integration and this report are proposed. No historical source file or frozen manifest changed.

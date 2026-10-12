# Phase 11 Step 5O ? Windows Docker client environment

**Result: offline verification passed; Docker/database runtime remains unverified.** No new database attempt was authorized or performed. Date: 12 October 2026.

Fresh isolated worktree: `C:/p11winenv`; branch `fix/phase-11-windows-docker-env`; base PR #37 commit `8225b5763d4db5089f11e850f0a3d319557d798a`. PR #38's stopped attempt and resources were not reused.

## Minimal correction

One explicit allowlist in `tools/isolated-supabase/client-environment.json` now governs the Node runner and PowerShell lifecycle clients.

| Variables | Reason |
|---|---|
| `PROGRAMFILES`, `PROGRAMDATA` | Windows Docker system plugin directories; missing in Step 5N's execution wrapper and the previous Node runner |
| `PATH`, `PATHEXT`, `SYSTEMROOT`, `WINDIR`, `COMSPEC` | Existing executable and Windows runtime lookup inputs |
| `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`, `TMP` | Existing local CLI configuration and scratch lookup inputs |
| `DOCKER_CONTEXT` | Existing context selector; the unchanged lifecycle/executor still rejects non-local daemon endpoints |
| `PSMODULEPATH` | PowerShell module discovery for the reviewed Windows lifecycle, including Windows networking cmdlets; retained by the previous Step 5N outer wrapper |

No `ALLUSERSPROFILE`, `ProgramFiles(x86)`, arbitrary `HOME`, or full-parent forwarding was added. [Docker's Windows discovery implementation](https://github.com/docker/cli/blob/v28.3.3/cli-plugins/manager/manager_windows.go) identifies the two required system plugin roots; runtime discovery was not executed in this checkpoint.

Windows prerequisites `PATH`, `SYSTEMROOT`, `USERPROFILE`, `PROGRAMFILES`, and `PROGRAMDATA` must be nonempty and free of line breaks/NUL. Directory values must be rooted paths. Missing/invalid prerequisites produce an explicit error naming only the variable, before client invocation. Lifecycle checks this before its first Docker command; each scoped invocation and Node runner construction also checks it. No values enter error messages.

Node `client-auth.cjs` uses the shared filtered environment for Docker, migration and SQL-test subprocesses. It still adds configuration-derived `PGPASSWORD` only to authenticated children; existing noninteractive psql flags, password-free CLI URL and redaction remain intact.

PowerShell `lifecycle.ps1` now routes every Docker and Node invocation through `Invoke-IsolatedClient`. The helper temporarily filters only the current PowerShell process environment during synchronous invocation and restores it in `finally`, including on errors. It does not change the caller's parent process, machine/user environment settings, files or secrets. Its import performs no execution or environment change.

Inherited `SUPABASE_*`, `PG*`, `DATABASE_*`, `JWT_*`, `GOTRUE_*`, `S3_*`, AWS credentials, public backend overrides, `NODE_OPTIONS`, `DOCKER_CONFIG`, Docker host/TLS overrides and all other non-allowlisted variables are excluded. Existing lifecycle rejection of selected inherited backend/link inputs remains in place. The allowlist does not allow inherited `PGPASSWORD`; the authorized client runner obtains it from private generated configuration as before.

## Call-site and compatibility review

- `lifecycle.ps1`: all direct Docker and Node subprocess calls replaced with scoped helper calls; roles, arguments, endpoint/binding checks, authorization gates and stage order preserved.
- `client-auth.cjs`: sole Node runtime environment builder replaced with shared policy. `execute.cjs` and bootstrap already use this runner.
- `execute.cjs`: prepared bootstrap verification now also verifies the three new environment files, preventing copied-helper drift.
- `prepare.cjs`: subprocesses are file-only Git blob/hash operations; no alternative Docker/database environment builder exists there. Artifact tooling remains unchanged.
- Previous ignored Step 5N wrapper was not changed or committed. A future authorized run should invoke the reviewed lifecycle with the required platform variables present, rather than reuse the consumed wrapper. An outer wrapper that already removed required values now fails explicitly; the harness does not invent filesystem paths.
- No managed-service configuration, role, grant, security policy, password, historical migration, frozen manifest or application feature changed.

## Actual offline verification

```text
node --test tools/isolated-supabase/offline.test.cjs tools/isolated-supabase/client-auth.test.cjs tools/isolated-supabase/client-environment.test.cjs scripts/migration-compatibility-artifact.test.cjs scripts/loopback-binding-check.test.cjs scripts/migration-encoding-check.test.cjs scripts/extension-hook-preflight.test.cjs
```

**Exit 0: 73 tests passed, 0 failed, 0 skipped, 0 TODO** (68 existing + 5 new). Actual TAP: [`evidence/phase11-5o/offline-tests.tap`](evidence/phase11-5o/offline-tests.tap).

New tests verify case-insensitive Windows fixtures, expected Compose plugin search paths in mocked Node clients, stripping representative credential/behavior overrides, explicit rejection for each missing/invalid prerequisite before subprocess execution, non-Windows filtering, and PowerShell mocked Docker/Node filtering and restoration on success and exception. The PowerShell regression ran under **Windows PowerShell 5.1 and portable PowerShell 7.6.6**, the latter selected using process-local `CLASH_TEST_PWSH`. No Docker executable was invoked. Test functions named Docker/Node are mocks; the existing logging regression also runs an ordinary Node stderr fixture.

Initial new-fixture execution had four failures due to JavaScript/PowerShell Windows-path escaping in the tests. Those fixture strings were corrected; no production checks or existing assertions were weakened. Final full results above include the corrected fixtures. Existing authentication tests gained required platform fixture values and updated wiring assertions.

The full run reverified **245 frozen source hashes**, all **106 compatibility artifacts** (exactly three BOM removals and the reviewed migration-44 transformation), vendor template hashes and 89 prepared SQL suite files. These are file checks, not executed SQL tests. A real Node/Git file-only read under the scoped PowerShell 7 environment also verified all 245 frozen hashes. Node syntax checks and PowerShell parsing passed. `git diff --check` passed. Primary checkout modified/untracked status remained unchanged; unrelated Crew files were neither staged nor edited.

## Remaining limitations / next boundary

Real Docker plugin discovery, managed bootstrap authentication, migrations, service health and database security are **not validated here**. Installed plugin presence, executable search paths and runtime Windows behavior remain prerequisites for a separately authorized disposable attempt. Offline mocks prove filtering/argument contracts, not network reachability or SQL outcomes.

No Docker commands or resource operations, SQL, database connections, hosted/local environment changes, merges, deployments or Android actions were performed. Step 4C remains blocked against existing local databases and Android Step 2F remains deferred. Stop after the draft PR; another database attempt needs explicit authorization.

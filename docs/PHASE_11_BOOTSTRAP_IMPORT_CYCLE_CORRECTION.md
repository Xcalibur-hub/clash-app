# Phase 11 Step 5R ? Bootstrap import-cycle correction

**Result: offline verified; no runtime validation attempt performed.** Date: 12 October 2026.

Fresh isolated worktree `C:/p11boot`; branch `fix/phase-11-bootstrap-import-order`; based on PR #39 commit `22d958c1d7e36a47258039851771d8d234202fbe`. Primary modified/untracked Crew status remains unchanged. No other branch or PR was modified.

## Minimal production patch

`tools/isolated-supabase/client-auth.cjs` now assigns its existing `module.exports` before the CLI main dispatch. A comment explains why. No function/API/CLI argument or authorization change.

The bootstrap path loads `execute.cjs`, which imports the client helpers back from `client-auth.cjs`. Previously CLI dispatch ran before exports existed, so the reverse import captured undefined helpers. Initializing exports first fixes that path while preserving the existing module structure; the dependency cycle remains but its exports are initialized before it is traversed. No new dependency or runtime test hook was added.

Authentication and authorization guards, lifecycle markers, roles, endpoints, password-free migration URL, child-only password environment, noninteractive flags, redaction, first-failure behavior, Windows environment policy, migrations and managed-service configuration are unchanged.

## Actual CLI regression (not a replacement bootstrap implementation)

New `bootstrap-cli.test.cjs` invokes the real Node CLI entrypoint as a separate process using `--require fixtures/bootstrap-cli-mock.cjs`. The preload deliberately does not import the helper first, which would conceal the original defect. The entrypoint performs the real prepared-artifact/configuration checks against a fresh ignored file-only fixture. Its lifecycle marker files exist solely for the offline test; they do not authorize infrastructure execution.

The preload intercepts `child_process.spawnSync`: the intended Docker Compose exec/psql operation is mocked and asserted, never launched. Synchronous Git reads remain permitted for frozen verification; other `execFileSync` commands are rejected. No Docker executable or PostgreSQL process runs. Fixture configuration contains generated test-only values, which are excluded from committed evidence.

The positive test verifies exactly one intended call:

```text
docker compose -p <fixture-project> -f <fixture-config> exec -T -e PGPASSWORD db psql -X -w -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f /bootstrap/extensions.sql
```

It verifies configuration-derived password forwarding in the child environment only, no password in argv, no shell, correct working directory, and rejection of inherited backend overrides. Success produces no console output/warnings and records the sanitized mock result.

Eight focused cases cover authorized success, subprocess exit failure, thrown subprocess exception, unauthorized invocation, missing generated password, missing lifecycle marker, unknown operation, and both `execute.cjs` CLI authorization guards. Failed subprocesses are invoked exactly once. Error paths leak neither password nor generated JWT secret to console/logs; no completion marker is manufactured.

## Verification actually executed

- **Before correction:** the new positive actual-entrypoint test failed (exit 1), reproducing the missing-export circular-dependency warnings from Step 5Q. The mock was not reached.
- **After correction:** all eight focused tests passed.
- **Full offline suite:** **81 passed, 0 failed, 0 skipped, 0 TODO** (73 existing + 8 new).
- **245 frozen source hashes**, **106 compatibility artifacts**, vendor hashes and prepared suite files reverified by the full suite. Historical source and frozen manifest were not edited.
- Node syntax checks passed for the helper, new test and preload; diff whitespace check passed. Existing Windows environment tests also ran with PowerShell 5.1 and portable PowerShell 7.6.6.

```text
node --test tools/isolated-supabase/offline.test.cjs tools/isolated-supabase/client-auth.test.cjs tools/isolated-supabase/client-environment.test.cjs tools/isolated-supabase/bootstrap-cli.test.cjs scripts/migration-compatibility-artifact.test.cjs scripts/loopback-binding-check.test.cjs scripts/migration-encoding-check.test.cjs scripts/extension-hook-preflight.test.cjs
```

Actual full TAP and the observed pre-fix failure excerpt: [`evidence/phase11-5r/`](evidence/phase11-5r/).

## Other entrypoints and remaining limits

Inspected `execute.cjs`, `prepare.cjs`, compatibility-artifact and binding-check entrypoints and their imports. No equivalent reverse-import-before-export CLI path was found. `execute.cjs` imports the initialized client helpers; focused actual-CLI tests confirm both unauthorized modes fail with the intended authorization message and no cycle warnings or client calls. Preparation, artifact and binding entrypoints use local functions/dependencies without a reverse import to their active main module. Their existing offline checks remain passing; this is not a claim that their database/runtime behavior was exercised.

Only the helper export order, tests/preload, this report and sanitized TAP evidence changed. No application migration, policy, role/grant, managed-service configuration, credentials, frozen manifest or historical file changed. No Docker commands/resources, SQL, database connections, runtime retries, deployment, merge or Android actions occurred.

Actual Docker/psql authentication, extension prerequisites, 106 migration applications, 89 SQL suites and effective H1/H2/H3/M1 security remain **unverified**. Another fresh disposable runtime attempt requires separate authorization. Step 4C remains blocked against existing local databases; Android Step 2F remains deferred. Stop after the draft PR.

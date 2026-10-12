# Hosted staging executor (Step 5U)

FILE-ONLY preparation. No connection was made. Read [the review and authorization gates](../../docs/PHASE_11_HOSTED_EXECUTOR_PREPARATION_5U.md) before using this tool.

This is a separate Go module, not an application dependency and not a redirected Compose runner. Runtime transport is `github.com/jackc/pgx/v5 v5.7.6` pinned by `go.mod`/`go.sum`. The older `pgconn v1.14.3` and extracted CLI function exist solely to test CLI 2.40.7 behavior. Do not call `ToPostgresURL` for hosted transport.

## Offline checks (safe now)

From a fresh checkout of this branch:

```powershell
node tools/hosted-staging/prepare.cjs
Set-Location tools/hosted-staging
go test -v ./...
go vet ./...
```

The generator refuses an existing output directory. Keep artifacts ignored. Tests use temporary mock CA certificates and in-memory Sessions; they never call the real connector or open sockets. Dependencies may be fetched by Go. No Docker executable or SQL client subprocess is invoked. Run the existing 81 prerequisite offline checks recorded in the report as well.

## Future commands ? NOT authorization to execute

After separate target-specific approval, compile this module to an operator-controlled directory, copy `config.example.json` outside the repository, replace placeholders, verify project ownership/CA hash independently, and choose a **fresh** evidence directory per approved operation. Use a clean process environment. Inject only `CLASH_STAGING_PASSWORD` through an approved secret store/environment API; never put a value in the command, URL, config, transcript or shell history. Do not use `set ...=password` examples. Remove the secret from the process environment when the operation ends.

```text
hosted-staging --mode preflight --authorize preflight:<approved-ref> --config <private-nonsecret-config>
hosted-staging --mode migrate --authorize migrate:<approved-ref> --config <private-nonsecret-config>
hosted-staging --mode inventory --authorize inventory:<approved-ref> --config <private-nonsecret-config>
hosted-staging --mode fixtures --authorize committed-fixtures:<approved-ref> --config <private-nonsecret-config>
```

These are four different authorization scopes. Read-only preflight does not approve migration, fixture creation, scheduler changes or project creation. `fixtures` additionally requires `sterile_test_project: true`, an empty application, a matching complete 106-entry ledger, the 89-suite hash and no active cron jobs. Pausing/restoring cron is a separate, reviewed operation; the executor does not do it. No local hostname, arbitrary URL, pooler, plaintext fallback or inherited PG/Supabase configuration is supported. Direct-host IPv6 reachability must be established in the future approved preflight; otherwise stop and review a session-pooler adaptation separately.

Migration files run once in filename order, each with its genuine ledger insert in the same transaction. An error stops the run. A partial ledger is **not** resumed or repaired. SQL bodies, database error strings and passwords are never logged. Evidence records counts, hashes and generic failures. Evidence directories remain private: Windows operators must verify NTFS ACLs because Unix mode bits alone do not provide a Windows ACL guarantee.

The ten dblink derivatives use independent verified client sessions, not server-side passwords. SQL argument evaluation stays in PostgreSQL; the frozen assertions and roles stay intact. Fixture execution is potentially destructive, commits remote writes and can emit side effects. It is unsuitable for any project containing real users/data. The remaining 79 suites also require fixture authorization; ROLLBACK does not make a suite a read-only inventory.

Any cleanup, ledger, TAP, TLS, ownership or target failure stops execution and quarantines the project for human review. No automatic rerun, broad delete, reset, extension install or permission repair follows a failure.

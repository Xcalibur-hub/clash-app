# Hosted staging executor (Steps 5U / 5W)

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

After separate target-specific approval, compile this module to an operator-controlled directory, copy `config.example.json` outside the repository, replace placeholders, verify project ownership/CA hash independently, and choose a **fresh** evidence directory per approved operation. Use a clean process environment. For the new Windows workflow select the native Credential Manager source described below. Approved legacy environment operators may inject only `CLASH_STAGING_PASSWORD` through an approved secret store/environment API; never put a value in the command, URL, config, transcript or shell history. Do not use `set ...=password` examples. Remove the secret from the process environment when the operation ends.

```text
hosted-staging --mode preflight --authorize preflight:<approved-ref> --config <private-nonsecret-config>
hosted-staging --mode migrate --authorize migrate:<approved-ref> --config <private-nonsecret-config>
hosted-staging --mode inventory --authorize inventory:<approved-ref> --config <private-nonsecret-config>
hosted-staging --mode fixtures --authorize committed-fixtures:<approved-ref> --config <private-nonsecret-config>
```

These are four different authorization scopes. Read-only preflight does not approve migration, fixture creation, scheduler changes or project creation. `fixtures` additionally requires `sterile_test_project: true`, an empty application, a matching complete 106-entry ledger, the 89-suite hash and no active cron jobs. Pausing/restoring cron is a separate, reviewed operation; the executor does not do it. No local hostname, arbitrary URL, transaction pooler, plaintext fallback or inherited PG/Supabase configuration is supported. Direct mode remains available; explicit session-pooler mode supports IPv4 with the exact Dashboard-approved shared host, fixed port 5432 and project-qualified username. Never derive that host from a region or silently change modes.

Migration files run once in filename order, each with its genuine ledger insert in the same transaction. An error stops the run. A partial ledger is **not** resumed or repaired. SQL bodies, database error strings and passwords are never logged. Evidence records counts, hashes and generic failures. Evidence directories remain private: Windows operators must verify NTFS ACLs because Unix mode bits alone do not provide a Windows ACL guarantee.

The ten dblink derivatives use independent verified client sessions, not server-side passwords. SQL argument evaluation stays in PostgreSQL; the frozen assertions and roles stay intact. Fixture execution is potentially destructive, commits remote writes and can emit side effects. It is unsuitable for any project containing real users/data. The remaining 79 suites also require fixture authorization; ROLLBACK does not make a suite a read-only inventory.

Any cleanup, ledger, TAP, TLS, ownership or target failure stops execution and quarantines the project for human review. No automatic rerun, broad delete, reset, extension install or permission repair follows a failure.

## Step 5W: Windows credentials and IPv4 session pooling

See [the Step 5W report](../../docs/PHASE_11_HOSTED_SESSION_POOLER_5W.md) and [updated creation checklist](../../docs/HOSTED_STAGING_CREATION_CHECKLIST.md). This code change authorizes no infrastructure or database operation.

`connection_mode` accepts `direct` (also the backward-compatible empty default) or `session-pooler`. Direct mode derives `db.<ref>.supabase.co`, username `postgres`, and refuses a pooler host. Session mode requires `pooler_host` to be the exact reviewed Dashboard endpoint matching the supported AWS shared-pooler naming form. It uses username `postgres.<ref>`, database `postgres`, and port **5432** only. Other providers/endpoint forms require review; there is no arbitrary URL, port override, transaction mode or fallback.

TLS still requires a hash-pinned CA PEM bundle, hostname verification and TLS 1.2 minimum. The **pooler's certificate chain can differ from the direct database's certificate**: independently obtain an appropriate trusted CA bundle for that exact pooler hostname; do not substitute an unverified downloaded leaf or assume the project's direct CA is sufficient. Actual chain, connectivity and managed compatibility are unverified.

`credential_source: windows-credential-manager` reads the generic credential `CLASH/staging/<ref>/postgres` using CredReadW in the current operator's Windows logon session. It requires fixed username `postgres`, local-machine persistence (per-user, non-roaming), and a valid password of at least 20 UTF-8 bytes. An inherited `CLASH_STAGING_PASSWORD` is rejected in this mode. The old explicit environment source/default remains for approved existing operators; no plaintext file or command-line password source is added.

Future owner-operated storage command, **not run during Step 5W**:

```text
hosted-staging --mode store-credential --authorize store-credential:<approved-ref> --config <nonsecret-config>
```

This opens a Windows secure password-entry dialog and stores only the validated entry through CredWriteW, then verifies readback. It makes no database connection and refuses existing entries rather than overwriting them. Missing/inaccessible stores, cancellation, wrong username, invalid password or failed storage/readback stop with generic errors. It neither generates nor resets a hosted password. Obtain the password through owner-controlled Dashboard creation; never use the automatic connector unless its secure password-supply/retrieval contract is separately reviewed.

The store protects credentials at rest for the Windows user, not from administrators, malware or other programs running as that same user. Go/driver strings necessarily contain the password transiently in memory; zeroing native/byte buffers is best effort, not a guaranteed full-memory purge. No credential APIs or native dialog were exercised against a real store in this phase; tests inject mocks.

Session-pooler connections, including independently opened concurrency sessions, bind their backend PID and check continuity before statements. ROLLBACK is checked after execution so aborted transactions can recover safely. PID continuity is a guard, not a protocol proof against a misconfigured port; Dashboard session-mode confirmation remains mandatory. The same connection retains transactions/session role/GUC/temp-object semantics; no automatic reconnect is added. A changed backend, query/commit/cleanup failure stops the run. The migration executor and ledger transaction ordering are unchanged.

Preflight sends BEGIN READ ONLY, fixed catalog/existence SELECTs and ROLLBACK. It records sanitized inventory in the fresh private run directory's `preflight.json`, including partial results on failure, plus `outcome.json`. It refuses existing application objects/data, ledger rows and scheduled jobs. Available extensions are not installed automatically. The managed-schema allowlist describes known service schemas, not a forensic baseline of every vendor object; review unexpected managed-version differences before migrations. Evidence directories require private NTFS ACLs and must not be committed wholesale.

# Phase 11 Step 5W: IPv4 session pooling and protected credentials

12 October 2026. **Offline engineering PASS; live staging/preflight NOT EXECUTED.** New isolated worktree `C:/p11pool`, branch `feat/phase-11-hosted-session-pooler`, based on Step 5V `cd6100c407538898f989891fc864fbc6fe5f6257` and approved PR #45 `4b2aa0638cb3ee0d1866705bbe7f788aff54462d`. No project, Docker resource, database connection, real credential entry, hosted secret or SQL execution was created/performed.

## Minimal implementation

- `tools/hosted-staging/executor.go`: optional explicit `session-pooler` connection mode; `direct`/empty retains existing behavior. Only reviewed AWS shared-pooler hostname syntax and port 5432 are accepted; routing username is derived as `postgres.<exact-ref>`. Direct mode refuses a supplied pooler host. No future target is hardcoded, no transaction pooling, arbitrary URL/port, endpoint fallback or paid IPv4 dependency is introduced. TLS retains explicit CA hash verification, hostname verification, TLS 1.2 minimum and no plaintext fallback.
- `preflight.go`: catalog-only inventory and private sanitized evidence; backend-PID continuity guard applied to primary and independent concurrency sessions. An aborted transaction can execute ROLLBACK before the continuity check. No reconnect/retry is added. Migration ordering, per-file transaction and ledger logic are unchanged.
- `credentials.go`, `credentials_windows.go`, `credentials_other.go`: explicit Windows Credential Manager source and owner-operated `store-credential` CLI scope. Native secure dialog, CredWriteW, readback verification and CredReadW; per-user local-machine persistence, fixed postgres username and project-specific key. System DLLs load from System32. No credential shell subprocess, password URL/flag, plaintext credential file or runtime dependency was added. Native byte buffers are cleared before release where possible. Non-Windows hosts reject the native-store source; approved legacy environment injection remains backward-compatible.
- `main.go`, `config.example.json`: strict nonsecret configuration, source-conflict rejection, separate storage authorization and private preflight inventory recording. Existing mode/project gates and inherited backend override rejection remain intact. Secret retrieval occurs only after authorization validation.
- Focused offline regressions: `credentials_test.go`, `session_privacy_test.go`; existing `executor_test.go` mock gains expanded catalog responses and the login-role field, preserving existing assertions. Checklist, README and project handoff updated.

## Supported session semantics and identity boundary

Supabase documents the shared session pooler as an IPv4 alternative and a database migration path; session mode retains a backend for the client connection's lifetime. Our inference for this SQL executor is that its explicit transactions, session role/GUCs and independently opened concurrency sessions retain the necessary semantics. We do **not** infer compatibility for replication, every native Postgres utility or every managed DDL operation. No transaction-mode assumption is used. [Supabase migration guidance](https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres), [session mode semantics](https://supabase.github.io/supavisor/configuration/pool_modes/), [connection options](https://supabase.com/docs/guides/database/connecting-to-postgres).

The exact host must come from **that project's Dashboard > Connect > Session pooler**, not a region template. Config accepts no alternative port. The authorization reference, project-qualified routing user and privately stored per-project password bind the requested tenant; SQL additionally requires database, current role and session role all `postgres`, PostgreSQL 17 and backend SSL. A shared pooler certificate authenticates the pooler hostname, not an individual project. We do not invent a SQL project-reference setting or claim independent catalog proof of the tenant. Dashboard verification is mandatory. Pooler CA chains may differ from the direct database CA; a separately verified appropriate CA bundle is required. Failure blocks without disabling TLS.

Backend PID continuity is checked before each ordinary statement and after rollback. It is additional detection, not a replacement for selecting the documented session endpoint. The same wrapped connector is passed to concurrency sessions. Offline tests exercise all 106 mocked migration transactions through this mode, changed backends, independent sessions and failed-statement rollback. Actual Supavisor TLS, session retention, hosted DDL and concurrency remain **unverified**.

## Credential workflow and creation interface

The previously exposed automatic `create_project` connector has no password/private-store handoff parameter. Its generated password cannot be assumed securely retrievable. Therefore **require owner-controlled Supabase Dashboard creation**, never create first and automatically reset credentials later.

The [updated checklist](HOSTED_STAGING_CREATION_CHECKLIST.md) gives the executable sequence: obtain separate approval; owner verifies Free/Mumbai/organization, chooses and privately retains a fresh strong password, creates one empty project, independently records its reference and exact session endpoint, then enrolls that password under the same Windows account using:

```text
hosted-staging --mode store-credential --authorize store-credential:<approved-ref> --config <nonsecret-config>
hosted-staging --mode preflight --authorize preflight:<approved-ref> --config <nonsecret-config>
```

These are future instructions, **not commands executed in Step 5W**. The first command opens a secure native dialog and never connects to a database; the second requires separate target-specific read-only authorization. Store key: `CLASH/staging/<ref>/postgres`, generic credential type, persistence LOCAL_MACHINE (per-user, non-roaming). Readback must match the write. Existing keys, store access errors, cancellation, invalid username/password and ambiguous inherited password sources stop without overwrite/retry. Passwords must be at least 20 UTF-8 bytes; the owner is responsible for cryptographically strong per-project selection. Store enrollment cannot recover a lost Dashboard-generated password.

The OS store protects at-rest credentials for the logged-on user. It is not protection against administrators/malware/same-user processes. Passwords necessarily exist transiently in Go/driver memory; buffer clearing does not guarantee removal of every immutable string copy. Private evidence/config directories need verified NTFS ACLs; Unix file modes alone do not enforce those ACLs. [Credential write contract](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credwritew), [credential read contract](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credreadw), [native prompt](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-creduipromptforcredentialsw).

No native prompt or real credential store operation ran during this task. Mock regressions verify retrieval/propagation, wrong-project rejection, absent/invalid credentials, cancellation, no-overwrite, failed storage/readback, unauthorized invocation, source conflicts and redacted errors/evidence.

## Expanded strictly read-only preflight

The first authorized preflight uses BEGIN READ ONLY, fixed catalog/existence SELECTs and ROLLBACK. No caller SQL, schema changes, temporary objects, extension installation, scheduler modifications or fixtures are involved. Queries are statically inspected and mock-observed; SQL has **not** been compiled/executed on a database.

| Inventory/check | Behavior |
|---|---|
| Identity/TLS | Exact configured route and verified CA/hostname; SQL database/current role/session role; PG17; backend SSL; session PID guard |
| Extensions | Installed version/schema/owner and all available versions for pgcrypto, PostGIS, pg_cron, pgTAP and dblink; all five must be available; pgcrypto must be installed as 1.3 / extensions / supabase_admin |
| Roles | Required managed roles, role attributes, effective MEMBER/USAGE, all membership edges reachable from the caller with inherit/set/admin flags; unexpected superuser membership denied |
| Restricted privileges | Caller nonsuperuser; no member access to server-file read/write or program-execution roles; no execute on catalog pg_read_file/pg_read_binary_file overloads |
| Unexpected application objects | Non-extension public relations, routines, enums/domains; unexpected nonmanaged schemas; extension objects excluded by dependency metadata |
| Existing data | Auth users, Storage objects/buckets must be absent; detected public application relations cause refusal, so their data is not read |
| Migration ledger | Must be absent/empty; existing records denied; statement bodies never written to preflight evidence |
| Managed services/cron | Auth/Storage/Realtime relation availability, realtime publication, pg_cron preload and catalog presence; existing scheduled jobs denied |
| Evidence | Private preflight.json plus outcome.json; partial fixed catalog metadata on failure; no row bodies/passwords/role settings/function definitions or connection URL |

Known managed schemas are allowlisted; this is not a forensic comparison of every vendor-owned schema/object. Additional managed-version/schema differences require review, not automatic acceptance or repair. Availability is not installation authorization or proof of installability under managed hooks. Missing installed PostGIS/pgTAP/dblink or cron capabilities must be reviewed before migrations/tests. No owner or permission changes are made to satisfy prerequisites. Supabase's announced PG17 minor updates and extension-version defaults reinforce the need for actual target inventory. [Managed-version notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes), [extension defaults](https://supabase.com/changelog/extension-version-pinning-ignored).

## Actual offline validation

| Executed check | Actual result |
|---|---|
| Reviewed eight-file Node offline command | **81 passed, 0 failed, 0 skipped; exit 0** |
| `go test -json ./...` | **46 top-level tests and 68 subtests; 105 leaf cases passed; 0 failures/skips; exit 0** |
| `go vet ./...` | PASS, exit 0 |
| `go mod verify` | PASS, exit 0; all modules verified |
| Windows `go build -trimpath` | PASS, exit 0; binary never executed |
| `go version -m` / PE inspection | PASS; Go1.25.3, windows/amd64, CGO disabled, pgx/v5 5.7.6 pinned; PE32+ AMD64 |
| Frozen source/artifact checks | PASS; all **245** Git-blob hashes, **106** artifacts, **89** bundled source suites / ten adapters and four managed vendor templates |
| Primary preservation | PASS; unchanged status and all six tracked dirty Crew/development file hashes against the pre-existing baseline |

The initial Go runs before `prepare.cjs` failed `TestTenFrozenAdaptations` because this fresh checkout lacked its generated suite bundle. File-only generation resolved that setup dependency; the final full suite passed. No SQL assertion was executed or weakened. All mocked migration/concurrency/TLS/store checks are offline simulations, not live security results.

Frozen seal `a92a550527f810913b01f6e6411dc78996c71a06`; artifact manifest `8f50541d3eed55bd905117a217bc8118a6b5483d1ffec2e5d0477b2be71b8c8a`; suite bundle `12cac2a2b0119cb99110061800e14ea167f0928919da4bbd4e464dc0fbead7fe`. Historical SQL, frozen manifests, vendor files, dependency locks and application code are unchanged. [Sanitized Node TAP](evidence/phase11-5w/node-tests.tap), [Go events](evidence/phase11-5w/go-tests.jsonl), [build metadata](evidence/phase11-5w/build-info.txt), [summary/exit codes/binary hash](evidence/phase11-5w/summary.json). Evidence was copied as UTF-8 with trailing line whitespace removed; the executable and scratch fixtures remain ignored.

## Remaining blockers and next action

**Workflow is prepared for review and a separately authorized first creation/read-only preflight; live readiness is not established.** Before that attempt: owner confirms organization/Free/Mumbai capacity and protected retention method; creates the one approved empty project manually; verifies Windows native enrollment under the intended user; supplies exact session endpoint/project identity and appropriate CA hash; verifies private ACLs; approves one bounded read-only preflight. Unsupported endpoint forms, missing capabilities, credential-store/TLS failures or identity mismatches stop without alternative target or repair.

No migration, fixture suite, extension initialization, paid service, network change, existing database access, merge, Expo or Android action is authorized by this patch. Step 4C remains **BLOCKED** against the existing local database; Android Step 2F remains **DEFERRED**. Database security is unverified. Stop after the draft PR; obtain new execution authorization.

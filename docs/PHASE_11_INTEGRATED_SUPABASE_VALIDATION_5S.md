# Phase 11 Step 5S — Integrated Supabase validation

**Recommendation: FAIL — migration-runner TLS compatibility blocker. Frozen candidate database/security validation: BLOCKED / UNVERIFIED.**

12 October 2026. One disposable attempt was performed and stopped at its first failure. No repair, retry or alternate bootstrap was attempted. This PR contains only this report and sanitized evidence.

## Provenance and preconditions

Fresh worktree `C:/p11runs`, branch `validate/phase-11-integrated-5s`, based on PR #42 commit `52bba95989371953c8170ff9fa69802385b46897` and its prerequisites. The primary dirty checkout and other branches were preserved.

- Initial read-only engine check succeeded: local `npipe:////./pipe/dockerDesktopLinuxEngine`, Linux Engine **28.3.3**. No Docker launch/restart/settings change.
- **81 offline tests passed, 0 failed, 0 skipped, 0 TODO.** These are file-only/mocked checks, not database tests. Full TAP retained.
- **245/245 frozen source hashes verified** against seal `a92a550527f810913b01f6e6411dc78996c71a06`, implementation `9c71d72a15095047821789386ca9d395961bab4f`.
- **106/106 compatibility artifacts verified**, with exactly three leading BOM removals and the reviewed migration-44 pgcrypto assertion substitution. Source migrations and the original frozen manifest were unchanged. The dual/intermediate/final hash manifest is included.
- Four vendor-template hashes and six cached pinned image descriptors/platforms verified; no image pull. PostgreSQL `17.6.1.002`, Auth `v2.179.0`, Storage `v1.26.5`, Realtime `v2.47.0`, PostgREST `v13.0.6`, Kong `2.8.1`. Exact immutable digests are in the image evidence.
- CLI **2.40.7**, Compose **2.39.2-desktop.1**, portable PowerShell **7.6.6** with archive checksum reverified. Windows environment allowlist preserved required Docker discovery variables and excluded inherited backend credentials/links.
- New project `clash_p11bind_5s_20261012`; newly generated JWT/API/encryption secrets and reviewed development-only passwords existed only in ignored private scratch. No prior attempt configuration/data was reused. The prepared metadata's `runtime_authorized: false` is a file-preparation field, not a runtime outcome; execution used the explicit authorized disposable-attempt CLI flag.
- Ports **57721/57722** were unused and the project absent from baseline. Real Compose discovery/rendering and explicit localhost-only static checks passed before resource creation.

## Actual execution

| Stage | Actual result |
|---|---|
| Create without starting; project labels/HostConfig inspection | PASS; nine expected containers; DB/gateway explicit 127.0.0.1, all others unpublished |
| PostgreSQL startup/publication | PASS; healthy; actual `127.0.0.1:57722` to container 5432 |
| Windows listener before initialization SQL | PASS; lifecycle rejected non-127.0.0.1 listeners; later listener evidence retained |
| Managed Realtime / Storage / Auth initialization | PASS; three jobs exited 0 |
| Corrected bootstrap CLI / noninteractive psql | PASS; helper and lifecycle exited 0; prerequisite DO assertion succeeded |
| Migration runner | **FAIL, exit 1: server refused TLS before any migration application** |
| Application migrations | **0 applied; 106 blocked** |
| Remaining runtime services / gateway connectivity | NOT STARTED / UNVERIFIED; five runtime containers remained created |
| Effective H1/H2/H3/M1, profile Room gate, grants/RLS/owners inventory | NOT EXECUTED / UNVERIFIED |
| SQL suites | **0 executed, 0 passed, 0 failed, 0 skipped; 89 blocked** |
| Database TAP assertions | **0 executed, 0 passed, 0 failed, 0 skipped** |
| Designated concurrency suites | **0 executed; 9 blocked** |
| Scoped cleanup / preservation | PASS |

Managed image initialization, managed jobs, extension setup and the executor's empty-ledger read occurred only inside the new disposable database. Zero application migrations/tests does not mean zero SQL operations. The pre-migration ledger check returned `EMPTY`; the CLI connection failed before reporting any migration application. No subsequent database query or validation retry was made.

### Bootstrap evidence

The actual authorized `client-auth.cjs bootstrap` path reached psql as `supabase_admin` with `-X -w -v ON_ERROR_STOP=1`. Password forwarding used the child environment only. The previous circular-import failure did not recur.

The prerequisite DO block passed: expected database/bootstrap identity, non-superuser migration role `postgres`, no EXECUTE on checked `pg_read_file` / `pg_read_binary_file` overloads, and no `pg_read_server_files` membership. It verified pgcrypto before creating the four missing required extensions. Reported identities:

| Extension | Version | Schema | Owner |
|---|---|---|---|
| pgcrypto | 1.3 | extensions | supabase_admin |
| postgis | 3.3.7 | extensions | supabase_admin |
| pg_cron | 1.6 | pg_catalog | supabase_admin |
| pgtap | 1.2.0 | extensions | supabase_admin |
| dblink | 1.2 | extensions | supabase_admin |

PostgreSQL reported **17.6**. These passing prerequisites do not establish application authorization protections, cron jobs, publication compatibility or service health after migrations.

## First failure and uncertainty

The reviewed executor invoked pinned CLI 2.40.7 once with the verified migration directory:

```text
supabase migration up --db-url postgresql://postgres@127.0.0.1:57722/postgres?sslmode=disable --workdir <new-disposable-directory>
```

The password was provided in the restricted child environment, never embedded in the URL or command arguments. Sanitized stderr:

```text
Connecting to remote database...
failed to connect to [REDACTED]: failed to connect to `host=127.0.0.1 user=[REDACTED] database=[REDACTED]`: tls error (server refused TLS connection)
```

The CLI/executor exited **1**. The reviewed runner explicitly supplied `sslmode=disable`, yet the observed connection attempted TLS. This confirms a migration-client/server connection compatibility failure before application migration execution. It does not demonstrate a faulty migration, failed RLS protection, wrong password, or extension-hook regression. Why CLI 2.40.7's effective TLS behavior differed from the supplied URL has **not** been established; no debug rerun, alternate SSL option, server reconfiguration or alternate executor was attempted. The CLI's generic suggestion to rerun with debug was deliberately not followed.

## Cleanup and preservation

Before cleanup, projected ownership/state evidence verified nine project containers, three named volumes and one bridge network, all absent from baseline. Only those verified disposable resources were removed; cleanup exited **0**. Post-cleanup label queries returned no project containers, volumes or networks; neither dedicated port had a listener.

| Pre-existing metadata inventory | Before | After | Exact match |
|---|---:|---:|---|
| Containers: ID/name/image/state | 43 | 43 | Yes |
| Volumes: name/driver | 22 | 22 | Yes |
| Networks: ID/name/driver | 9 | 9 | Yes |

Primary modified/untracked status was identical, and all six modified tracked files retained their initial byte hashes. Existing database contents were intentionally not queried. No Crew file was edited or staged.

Evidence is in [evidence/phase11-5s/](evidence/phase11-5s/): offline TAP, compatibility hashes, reviewed tooling hashes, image/tool versions, prerequisite output, migration failure, projected bindings/state/ownership, listener evidence, stage exits and cleanup/primary comparisons. Allowlisted files were normalized and checked for generated secrets, JWTs and password-bearing database URLs. No private Compose configuration, environment snapshot, raw Docker inspection or full command log is published. Sanitized DB/init-job logs remain in ignored local scratch.

## Recommendation and remaining blockers

**Reassess the local Compose harness versus dedicated hosted staging before authorizing another attempt.** Repeated harness-only failures have prevented integrated SQL validation. A file-only investigation could establish the pinned CLI's effective TLS contract and add an appropriate offline regression; alternatively, separately authorized dedicated hosted staging could provide a supported managed target. Neither option is initiated or authorized by this completed attempt. Hosted staging would need an explicitly isolated project, fresh non-development credentials, reviewed grant/bootstrap prerequisites and a new validation plan; the disposable development passwords must never be reused there.

All 106 application migrations, 89 SQL suites, nine concurrency suites, effective H1/H2/H3/M1 security and profile visibility correction remain unverified in this attempt. No production-readiness claim is made. Any further infrastructure/database attempt requires separate authorization.

No existing local/hosted database access, historical migration/ledger modification, role elevation, grant broadening, RLS relaxation, hook disabling, reset, global Docker/firewall change, merge, deployment or Android action occurred. Step 4C remains BLOCKED against existing local databases; Android Step 2F remains DEFERRED.

**Stop point: first CLI migration connection failure. Attempt closed after scoped cleanup and reporting.**

# Phase 11 Step 5N ? Integrated database validation

**Recommendation: BLOCKED.** The controlled attempt failed during Compose configuration rendering, before container creation. Database authentication and integrated security remain **UNVERIFIED**. No repair or retry was performed.

Date: 12 October 2026. Report branch: `validate/phase-11-integrated-db-5n`; fresh isolated worktree `C:/p11runn`.

## Candidate and offline results

- PR #37 execution baseline: `8225b5763d4db5089f11e850f0a3d319557d798a`, including PR #35 and all inherited prerequisites. No harness implementation or historical migration changed during this attempt.
- PR #26 frozen seal: `a92a550527f810913b01f6e6411dc78996c71a06`; frozen implementation: `9c71d72a15095047821789386ca9d395961bab4f`.
- **245/245 source hashes and 106/106 compatibility artifacts verified.** Exactly three BOM removals and the reviewed migration-44 correction; original source/manifest unchanged. All four pinned vendor templates verified.
- **68 offline tests passed; 0 failed, 0 skipped, 0 TODO.** These are Node/offline checks, not PostgreSQL TAP assertions. Command:

```text
node --test tools/isolated-supabase/offline.test.cjs tools/isolated-supabase/client-auth.test.cjs scripts/migration-compatibility-artifact.test.cjs scripts/loopback-binding-check.test.cjs scripts/migration-encoding-check.test.cjs scripts/extension-hook-preflight.test.cjs
```

- All six cached images matched their pinned index RepoDigests, expected image ID representation, and linux/amd64 platform. No pulls or image changes. Versions: PostgreSQL `17.6.1.002`, Auth `v2.179.0`, Storage `v1.26.5`, Realtime `v2.47.0`, PostgREST `v13.0.6`, Kong `2.8.1`. This verifies cached descriptors, not a new remote-registry download.
- CLI **2.40.7**, Engine **28.3.3**, Compose **2.39.2-desktop.1** were available in the normal preflight environment. Docker endpoint was the local Desktop named pipe. Portable PowerShell **7.6.6** was reused read-only from previous ignored tooling; its archive checksum was reverified.
- File-only PR #31 generator/test and PR #34 checker Git blob comparisons passed. These additional provenance comparisons were retained during post-failure evidence collection; they did not initiate another runtime operation.

## Intended disposable target and actual execution

Project: `clash_p11bind_5n_20261012`. Dedicated ports: DB `57722`, gateway `57721`; both unused at preflight. Fresh test JWT/API/encryption secrets and reviewed development passwords were generated only in ignored scratch. No existing backend environment file or credential was modified.

| Stage | Actual result |
|---|---|
| File-only artifact/config generation and verification | PASS; explicit loopback bindings verified statically |
| Normal-shell Docker/Compose version and baseline metadata inspection | PASS |
| Lifecycle `create`: local endpoint, baseline and unused-port checks | PASS |
| Lifecycle Compose render, `docker compose -p ? -f ? config --format json` | **FAIL**, Docker exit **125**, lifecycle exit **1** |
| Container creation / actual HostConfig verification | NOT REACHED; **0 created** |
| PostgreSQL startup / actual Windows listener verification | NOT REACHED |
| Managed Realtime, Storage, Auth initialization | NOT EXECUTED |
| Extension prerequisites / pgcrypto identity / restricted file privileges | NOT EXECUTED |
| Corrected psql authentication / CLI migration authentication | NOT EXECUTED / UNVERIFIED |
| Application migrations | **0 executed; 106 blocked** |
| Runtime services / gateway health and connectivity | NOT EXECUTED |
| Effective H1/H2/H3/M1 / Room gate / grants / RLS / ownership inventory | NOT EXECUTED / UNVERIFIED |
| SQL suites | **0 executed; 89 blocked; 0 passed, 0 failed, 0 skipped** |
| PostgreSQL TAP assertions | **0 executed, 0 passed, 0 failed, 0 skipped** |
| Designated concurrency suites | **0 executed; 9 blocked** |

No database was started or connected to. No managed bootstrap SQL ran in this attempt. Static configuration checks do not establish actual Docker bindings or network reachability.

## First failure and cause

Sanitized Docker output:

```text
compose exit=125
unknown shorthand flag: 'p' in -p
Usage: docker [OPTIONS] COMMAND [ARG...]
```

**The execution wrapper prepared for this attempt omitted `ProgramFiles` and `ProgramData` from its clean child environment. This was an orchestration prerequisite failure, not a demonstrated defect in PR #37 password forwarding.** The normal preflight used the ordinary environment and successfully discovered Compose; the lifecycle was launched with the restricted environment and could not discover the plugin.

Evidence:

1. Both variables exist in the parent environment but were absent from the wrapper allowlist. No inherited backend credentials were forwarded.
2. Docker Compose exists at `C:/Program Files/Docker/cli-plugins/docker-compose.exe` (a hardlink to the Desktop distribution). No Compose plugin was present in the user plugin directory, and Docker's user configuration has no additional plugin directories.
3. [Docker Windows plugin discovery](https://github.com/docker/cli/blob/v28.3.3/cli-plugins/manager/manager_windows.go) uses `ProgramData` and `ProgramFiles` for system plugin search paths. Removing them changes the paths to relative directories.
4. An **offline mocked Docker function** exercised the actual lifecycle `D`/`C` functions and confirmed the full argv begins with `compose|-p|?|-f|?|config|--format|json`. The helper did not drop the `compose` token. No Docker command was retried by this diagnostic.

The same platform-variable omission is present in PR #37's Node runner allowlist, but that runner was **not reached**, so its runtime effect remains untested. A minimal separately reviewed correction should preserve required non-secret Windows platform variables while still rejecting inherited database/API credentials, then add an offline platform-discovery contract test. Do not change roles, passwords, security configuration, Docker settings or the Compose plugin installation. Neither the wrapper nor harness was patched or rerun here.

## Cleanup and preservation

No network, volume or container was created; therefore no removal command was needed or executed. Project-label inspection found zero resources for this attempt. Ports 57721/57722 had zero listeners after failure. No bootstrap/startup/cleanup lifecycle stage was invoked after the failed create stage.

| Pre-existing metadata inventory | Before | After | Exact match |
|---|---:|---:|---|
| Containers (ID/name/image/state) | 43 | 43 | Yes |
| Volumes (name/driver) | 22 | 22 | Yes |
| Networks (ID/name/driver) | 9 | 9 | Yes |

Primary checkout status was unchanged, including all unrelated modified/untracked Crew paths. All five files reported by the initial `git diff --name-only` had identical before/after byte hashes; other dirty paths were covered by status comparison, not an exhaustive byte inventory. Existing database contents were intentionally not queried.

No existing local/hosted database connection, migration, ledger change, grant, role change, reset, image/volume deletion, firewall/global Docker modification, merge, deployment or Android action occurred.

## Evidence and next authorization boundary

Sanitized evidence: [`docs/evidence/phase11-5n/`](evidence/phase11-5n/): actual offline TAP output; source/artifact transformation manifest; reviewed tooling and cached image checks; exact Compose failure; stage exit; resource and primary preservation comparisons; result totals. Private Compose/configuration/inspect material and the wrapper remain in ignored scratch. Conservative redaction masks the development password wherever its value also occurs in a legitimate image or role name; digest values remain unchanged. No generated JWT/API secrets or private environment files are published.

**Stop point: first Compose render failure.** No automatic retry, alternate bootstrap, database reset or security workaround. This controlled attempt is closed. A separately reviewed file-only platform-environment fix and **new explicit authorization for a fresh disposable attempt** are needed before continuing. Step 4C remains blocked against existing local databases; Android Step 2F remains deferred.

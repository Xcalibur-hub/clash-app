# Phase 11 Step 5P ? Integrated Supabase validation

**Recommendation: BLOCKED ? local Docker Desktop Linux-engine endpoint unavailable.** No infrastructure was created, no database started and no SQL executed. The application candidate's effective security remains **UNVERIFIED**.

Date: 12 October 2026. Fresh worktree: `C:/p11runp`; report branch: `validate/phase-11-integrated-5p`; PR #39 baseline: `22d958c1d7e36a47258039851771d8d234202fbe`. No previous disposable project, credentials, data or attempt configuration was reused. Previously reviewed portable PowerShell tooling was reused read-only; application and harness source files remain unchanged.

## Preconditions actually verified

- **73 offline tests passed; 0 failures, 0 skips, 0 TODO**, including the environment regression under Windows PowerShell 5.1 and portable PowerShell 7.6.6.
- **245 frozen source hashes verified** from seal `a92a550527f810913b01f6e6411dc78996c71a06` (implementation `9c71d72a15095047821789386ca9d395961bab4f`).
- **106 compatibility artifacts generated and verified**, with exactly three leading BOM removals and the reviewed migration-44 correction. Historical migration files and frozen manifest unchanged.
- All **four vendor template hashes** verified. All 89 SQL suite files prepared, including nine designated concurrency suites; none executed.
- Unique project/configuration: `clash_p11bind_5p_20261012`. Fresh JWT/API/encryption secrets were generated only in ignored scratch with the reviewed development-only database credentials.
- The control process used PR #39's `clientEnvironment()` allowlist, retaining `ProgramFiles`/`ProgramData` and stripping inherited backend overrides. `verifyPrepared()` passed before Docker inventory: static explicit-loopback configuration, copied bootstrap files, artifact hashes and absence of project-link files were checked.
- Ports 57721/57722 had no Windows listeners during the read-only port check. This does not prove actual container publication.

Offline command:

```text
node --test tools/isolated-supabase/offline.test.cjs tools/isolated-supabase/client-auth.test.cjs tools/isolated-supabase/client-environment.test.cjs scripts/migration-compatibility-artifact.test.cjs scripts/loopback-binding-check.test.cjs scripts/migration-encoding-check.test.cjs scripts/extension-hook-preflight.test.cjs
```

## First failure

The first Docker operation was the read-only resource baseline query:

```text
docker ps -a --format "{{.ID}} {{.Names}} {{.Image}} {{.State}}"
```

Docker returned **exit 1**; the Node preflight aborted with `AssertionError [ERR_ASSERTION]`, actual 1 versus expected 0. Exact error:

```text
error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/containers/json?all=1": open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

This establishes that the selected local Linux-engine named pipe was unavailable. It does **not** establish whether Docker Desktop was stopped, still starting or otherwise unhealthy. No additional Docker query, context change, daemon startup/restart, alternative endpoint or retry was attempted. The subsequent read-only Windows port check did not resume validation; the enclosing shell's final exit status is not evidence that Node preflight succeeded.

## Exact execution totals

| Stage | Result |
|---|---|
| Offline tests / frozen hashes / compatibility artifacts / vendor hashes | PASS |
| Docker resource baseline | **FAIL to connect; preflight BLOCKED** |
| Cached service image digest/platform inspection | NOT REACHED; pins exist in reviewed source, runtime descriptors unverified |
| Live Compose discovery/version and configuration rendering | NOT REACHED |
| Create-only containers / actual HostConfig checks | NOT REACHED; 0 created by this task |
| PostgreSQL startup / Windows runtime listener verification | NOT REACHED |
| Realtime, Storage and Auth initialization | NOT EXECUTED |
| Noninteractive authentication / extension prerequisites | NOT EXECUTED |
| Application migrations | **0 executed; 106 blocked** |
| Runtime services / gateway connectivity | NOT EXECUTED |
| Effective H1/H2/H3/M1, profile Room gate, grants/RLS/owners | UNVERIFIED; no security inventory or SQL test ran |
| SQL suites | **0 executed, 0 passed, 0 failed, 0 skipped; 89 blocked** |
| PostgreSQL TAP assertions | **0 executed, 0 passed, 0 failed, 0 skipped** |
| Designated concurrency suites | **0 executed; 9 blocked** |

Offline TAP totals are separate from PostgreSQL TAP. No authentication, migration, application-security or concurrency pass is claimed.

## Cleanup, preservation and evidence

No container/network/volume creation, startup or resource mutation command was issued, so this task created **zero resources** and required no deletion/cleanup command. Existing-resource before/after inventory comparison was **blocked**, because even the initial inventory could not connect; no claim of a successful inventory comparison is made. No existing local or hosted database was accessed.

Primary checkout modified/untracked status exactly matches the initial inspection, including all unrelated Crew paths. No primary-checkout file was edited or staged. Before/after byte hashes were not collected, so preservation evidence is status comparison and the task's isolated write scope.

Sanitized evidence: [`evidence/phase11-5p/`](evidence/phase11-5p/) contains actual offline TAP, the 106-file compatibility manifest, the first failure, result totals and primary status preservation. Private generated configuration, fresh secrets, environment data and raw Docker inspect output are not published. No Docker inspect command ran.

No historical migration/ledger changes, role elevation, RLS relaxation, extension-hook changes, database reset/repair, global Docker/firewall changes, merges, deployments or Android operations occurred. Step 4C remains blocked against existing databases; Android Step 2F remains deferred.

**Stop point: first Docker baseline failure.** Before a further attempt, Docker Desktop's local Linux engine must be made available outside this closed attempt, followed by new explicit authorization for a fresh disposable validation. No automatic continuation or retry is planned.

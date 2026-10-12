# Phase 11 Step 5Q ? Integrated database validation

**Recommendation: FAIL ? harness bootstrap CLI import cycle.** The frozen application's effective database security remains **BLOCKED / UNVERIFIED**. One disposable attempt, stopped at the first failure; no repair or retry.

Date: 12 October 2026. Fresh worktree `C:/p11runq`; branch `validate/phase-11-integrated-5q`; execution baseline PR #39 commit `22d958c1d7e36a47258039851771d8d234202fbe`. No previous attempt's project/data/configuration was reused. Reviewed portable PowerShell tooling was reused read-only. No harness/application source changes were made.

## Preconditions

- Initial read-only Docker check succeeded: local `npipe:////./pipe/dockerDesktopLinuxEngine`, Engine **28.3.3**. Docker was not launched/restarted or reconfigured.
- **73 offline tests passed**, 0 failures/skips/TODO; Windows environment tests ran under PowerShell 5.1 and 7.6.6. Actual TAP is retained.
- **245/245 frozen source hashes** verified against seal `a92a550527f810913b01f6e6411dc78996c71a06` (implementation `9c71d72a15095047821789386ca9d395961bab4f`).
- **106/106 compatibility artifacts** verified: exactly three BOM removals and the reviewed migration-44 correction. Original historical migrations/manifest unchanged. Four vendor template hashes verified.
- All six cached image index RepoDigests/IDs and linux/amd64 platform descriptors matched the reviewed pins. No image pull/change. Versions: PostgreSQL `17.6.1.002`, Auth `v2.179.0`, Storage `v1.26.5`, Realtime `v2.47.0`, PostgREST `v13.0.6`, Kong `2.8.1`.
- CLI **2.40.7**, Compose **2.39.2-desktop.1**, PowerShell **7.6.6** (portable archive checksum reverified).
- New project `clash_p11bind_5q_20261012`; fresh JWT/API/encryption secrets only in ignored scratch; reviewed development-only passwords. Clean child environments used PR #39's allowlist. No inherited backend overrides/project links forwarded.
- Dedicated ports 57721/57722 unused; project absent from baseline. Compose discovery, configuration rendering and static explicit-loopback checks passed before creation.

## Actual execution

| Stage | Result |
|---|---|
| Create-only and project/HostConfig inspection | PASS; exactly nine expected project containers, DB/gateway exclusively 127.0.0.1, other services unpublished |
| PostgreSQL startup and actual publication | PASS; healthy, `127.0.0.1:57722 ? 5432` |
| Windows listener before prerequisite SQL | PASS in lifecycle; later evidence also shows `127.0.0.1:57722`, process 35560 |
| Realtime initialization | PASS; exited 0 |
| Storage initialization | PASS; exited 0 |
| Auth initialization | PASS; exited 0 |
| Extension-helper CLI dispatch | **FAIL**, helper/lifecycle exit 1; circular-dependency warnings before prerequisite psql invocation |
| Noninteractive prerequisite psql / pgcrypto version-schema-owner / restricted migration file privileges | NOT EXECUTED / UNVERIFIED |
| Application migrations | **0 executed; 106 blocked** |
| Runtime services/gateway startup and connectivity | NOT EXECUTED; five remaining runtime containers stayed created/unstarted |
| Effective H1/H2/H3/M1, profile Room gate, grants/RLS/owners | NOT EXECUTED / UNVERIFIED |
| SQL suites | **0 executed, 0 passed, 0 failed, 0 skipped; 89 blocked** |
| PostgreSQL TAP assertions | **0 executed, 0 passed, 0 failed, 0 skipped** |
| Designated concurrency suites | **0 executed; 9 blocked** |
| Scoped cleanup and resource comparison | PASS |

The image-managed bootstrap and initialization jobs performed authorized managed SQL inside the new disposable database. Zero application migrations/tests does **not** mean zero managed initialization SQL. Successful job exits do not establish application security or full service compatibility.

## Confirmed failure and code path

The reviewed lifecycle invoked `client-auth.cjs bootstrap <new-project-directory> --authorized-new-disposable-attempt` and stopped at `lifecycle.ps1:123`. Actual stderr included:

```text
Bootstrap client failed; see sanitized log if available. No retry authorized.
Warning: Accessing non-existent property 'loadConfig' of module exports inside circular dependency
```

The same warning appeared for `password`, `redactor`, `runner`, `psqlArgs`, and `migrationArgs`. Sanitized complete stage output is retained.

Repository inspection identifies the deterministic import-order defect:

1. `client-auth.cjs:53` enters its CLI main block before the `module.exports` assignment at line 57.
2. Its bootstrap function requires `execute.cjs` at line 46 and immediately calls `verifyPrepared()`.
3. `execute.cjs:4` imports/destructures the still-unexported functions from the partially initialized `client-auth.cjs` module.
4. `verifyPrepared()` calls its captured `loadConfig` at line 13, which is therefore undefined. This fails before the helper reaches its Docker/psql runner construction.

The exact underlying exception stack was suppressed by the helper's generic catch; `loadConfig` being non-callable is inferred from this inspected call chain, consistent with the observed warnings. No prerequisite psql command or bootstrap psql evidence entry was issued. This does not demonstrate an authentication failure, extension-hook failure or application-security failure.

The offline tests cover module import, unauthorized CLI dispatch, subprocess authentication contracts and Windows environments; they did not exercise the authorized bootstrap CLI entry with mocked dependencies. Proposed separate file-only correction: export helper functions before CLI dispatch (or remove the cycle), and add a positive authorized-entry regression with mocked preparation/subprocesses. No correction/test rerun was performed here. No role/grant/owner/security workaround is justified.

## Cleanup and preservation

Ownership evidence verified all nine containers, three volumes and one bridge as belonging to this project and absent from the baseline. Cleanup removed only these resources and exited **0**. Post-cleanup project-label queries found no containers/volumes/networks; ports 57721/57722 had no listeners.

| Pre-existing metadata inventory | Before | After | Exact match |
|---|---:|---:|---|
| Containers (ID/name/image/state) | 43 | 43 | Yes |
| Volumes (name/driver) | 22 | 22 | Yes |
| Networks (ID/name/driver) | 9 | 9 | Yes |

Primary modified/untracked status was unchanged, and all six modified tracked files retained their initial byte hashes. Unrelated Crew work was neither edited nor staged. Existing database contents were intentionally not queried.

Sanitized evidence: [`evidence/phase11-5q/`](evidence/phase11-5q/), including offline TAP, artifact manifest, cached image/tooling checks, projected ownership/binding/state records, listener observation, stage exits/output and cleanup/primary comparisons. Managed job/DB logs are sanitized and retained in ignored local scratch. No private Compose config, credentials/JWTs, raw environment snapshot or raw Docker inspect output is published.

No existing local/hosted database access, reset, historical migration/ledger change, role elevation, RLS relaxation, hook disabling, global Docker/firewall change, merge, deployment or Android action occurred. Step 4C remains blocked against existing local databases; Android Step 2F remains deferred.

**Stop point: bootstrap helper import failure.** This attempt is closed. A separately reviewed harness correction and new authorization for another fresh disposable attempt are required before further runtime validation.

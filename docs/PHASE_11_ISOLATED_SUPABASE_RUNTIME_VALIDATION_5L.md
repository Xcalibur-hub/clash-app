# Phase 11 Step 5L — Isolated Supabase runtime validation

**Recommendation: FAIL — reviewed harness bootstrap authentication failed.** The frozen integrated database candidate remains **BLOCKED / UNVERIFIED**, not a demonstrated security failure or pass.

Date: 12 October 2026, Asia/Calcutta. One disposable Compose attempt; no bootstrap/migration retry, repair, alternate bootstrap, second startup, permission change or source-code fix.

## Candidate and preconditions

Fresh isolated worktree: `C:/p11runl`; branch: `validate/phase-11-compose-runtime-5l`, based on PR #35 commit `d153c11efb5be3b663a2beeb4efd1802526cded2`.

- PR #26 frozen seal: `a92a550527f810913b01f6e6411dc78996c71a06`; implementation: `9c71d72a15095047821789386ca9d395961bab4f`.
- **245/245 frozen source hashes verified**, including all 106 migrations, 89 SQL suites and 50 client/config/harness files.
- **106/106 compatibility artifacts verified**, identical to Step 5K's manifest: exactly three leading BOM removals and one reviewed migration 44 pgcrypto assertion transformation. Historical migrations and original manifest unchanged.
- PR #31 generator/helper Git blobs and PR #34 checker Git blob match their reviewed reference commits. All four upstream vendor template hashes passed.
- **57 offline Node tests passed; 0 failures, 0 skips, 0 TODOs.** These are JavaScript/offline tests, not PostgreSQL TAP assertions.
- All six registry index and amd64 manifest hashes verified against `images.json`; all cached image descriptors/RepoDigests match the pinned index digests and platform.
- CLI **2.40.7**, Docker Engine **28.3.3**, Compose **2.39.2-desktop.1**, local endpoint `npipe:////./pipe/dockerDesktopLinuxEngine`.
- Only PowerShell 5.1 was installed. Portable **PowerShell 7.6.6** was downloaded into ignored scratch and checked against its official release checksum (`02fe458be20493fbdf43f61ea20610b811ee6c738ab1676c61b9cfcd1a33c860`); no system installation or configuration change. The reviewed harness remained unchanged.
- No inherited backend credential variables or project-link configuration. Dedicated ports 57721/57722 were unused. New JWT/API/encryption secrets were generated only for this project; reviewed fixed development passwords were used only there.

Two auxiliary preflight checks initially encountered representation issues: Docker Desktop's image `Id` is an OCI **index digest**, not the config-object digest; the official PowerShell checksum list is UTF-16 with a BOM. Read-only inspection established the correct descriptors/encoding before resource creation. Neither issue changed an image, harness, source migration, role, database or infrastructure attempt. No compatibility problem was inferred from the incorrect preliminary comparison.

## Actual execution

Project: `clash_p11bind_5l_20261012`.

| Stage | Actual result |
|---|---|
| Compose render/static checker | PASS; DB/gateway explicitly `127.0.0.1` |
| Create without starting | PASS; exactly nine containers, expected project/service labels |
| Created HostConfig inspection | PASS; DB `127.0.0.1:57722 → 5432`, gateway `127.0.0.1:57721 → 8000`; other services unpublished |
| PostgreSQL single startup | PASS; healthy; actual `NetworkSettings.Ports` retained explicit loopback mapping |
| Windows DB listener before explicit SQL command | PASS; `127.0.0.1:57722`, owning process 43360; no wildcard/LAN/IPv6 listener |
| Realtime initialization | PASS; exited 0 |
| Storage initialization | PASS; exited 0 |
| Auth initialization | PASS; exited 0 |
| Extension prerequisites/provisioning | **FAIL during psql authentication**, before prerequisite SQL statements executed |
| Application migrations | **0 executed; all 106 blocked** |
| Runtime Auth/Storage/Realtime/PostgREST/gateway startup | BLOCKED; runtime containers were created but never started |
| Gateway running bindings, HTTP connectivity | BLOCKED; only its created HostConfig was verified |
| Effective H1/H2/H3/M1, profile Room gate, grants/RLS/owner inventory | NOT EXECUTED / UNVERIFIED |
| Full SQL suites | **0 executed; 89 blocked; 0 passed, 0 failed SQL suites, 0 skipped** |
| PostgreSQL TAP assertions | **0 executed, 0 passed, 0 failed, 0 skipped** |
| Nine designated concurrency/race suites | **0 executed; 9 blocked** |
| Cleanup | PASS; all attempt resources removed; baseline inventories equal |

The managed PostgreSQL image and three service jobs performed their authorized initial schema setup inside the disposable target. "0 SQL suites/migrations executed" does **not** mean that no managed bootstrap SQL ran. The prerequisite connection failure does not establish pgcrypto version/owner, migration-role file privileges, pgTAP availability, or application security outcomes.

## Confirmed blocker

Exact reviewed command at `tools/isolated-supabase/lifecycle.ps1:113`:

```text
docker compose ... exec -T db psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -f /bootstrap/extensions.sql
```

Actual command exit: **2**. Lifecycle stage exit: **1**.

```text
Password for user supabase_admin:
psql: error: connection to server on socket "/run/postgresql/.s.PGSQL.5432" failed: fe_sendauth: no password supplied
```

The command supplies no `PGPASSWORD`, password file or password-bearing connection string. `POSTGRES_PASSWORD` in the container config is an image/bootstrap variable; libpq does not use it as its client password. Password exports performed inside the image initialization process are not inherited by a later `docker compose exec` process. The managed service jobs succeeded because their reviewed DB configurations explicitly supply passwords.

No assertion inside `extensions.sql` ran, and no extension installation from that script occurred. This is a **harness client-authentication defect**, not evidence of a pgcrypto, pg_read_file, RLS, or application migration failure.

Static inspection also finds the later `execute.cjs:51` psql calls pass `PGOPTIONS` but no client password. This is a related **unexecuted compatibility risk**, not an additional runtime test result. CLI migration execution itself was never invoked.

Recommended separately reviewed correction: forward the generated disposable configuration's development password to each relevant psql process, require noninteractive authentication (`-w`), and keep the exact existing role identities, endpoint isolation and first-failure behavior. Add offline subprocess-contract coverage. Do **not** change pg_hba, trust authentication, role privileges, owners, hook configuration or RLS. No correction or validation retry was performed in this checkpoint. A new runtime attempt needs separate authorization.

## Isolation and cleanup evidence

Created resources (full new-resource IDs/labels in `attempt-resources.json`):

- Nine containers named `clash_p11bind_5l_20261012-{db,realtime-init,storage-init,auth-init,auth,rest,realtime,storage,kong}-1`.
- Three volumes: `clash_p11bind_5l_20261012_db-data`, `_db-config`, `_storage-data`.
- One bridge: `clash_p11bind_5l_20261012_network`.

Before cleanup, each container/volume/network was verified as belonging to this project and absent from the pre-existing inventory. The reviewed cleanup stage stopped/removed only these resources and exited **0**. Post-cleanup project-label queries returned **zero containers, zero volumes, zero networks**; ports 57721/57722 had **no listeners**.

| Pre-existing resources | Before | After | Exact metadata inventory match |
|---|---:|---:|---|
| Containers (ID/name/image/state) | 43 | 43 | Yes |
| Volumes (name/driver) | 22 | 22 | Yes |
| Networks (ID/name/driver) | 9 | 9 | Yes |

Primary checkout dirty status is identical; all six modified tracked Crew/development files have identical before/after byte hashes. No existing database connection, migration ledger query, volume deletion, reset/restart, hosted operation, global Docker/firewall change, merge, deployment or Android action occurred. Inventory comparison establishes resource metadata preservation; existing database contents were intentionally not queried.

## Evidence and limitations

Sanitized evidence: [`docs/evidence/phase11-5l/`](evidence/phase11-5l/).

- `result.json`: stage exits, blocked totals and binding observations.
- `offline-tests.tap`: the actual 57-test Node run (trailing whitespace trimmed only).
- `image-verification.json`, `reviewed-tooling-verification.json`, `portable-powershell-provenance.json`, `compatibility-manifest.json`: provenance and hashes.
- `create.log`, `bootstrap-stage.log`, `extension-prerequisite-failure.log`, `cleanup-stage.log`: observed stage results and exact failure.
- Managed initialization/DB stdout logs are retained separately; the relevant failed psql stderr is in the failure log. Full private inspect/config snapshots and the complete local command log remain in ignored scratch, not this PR.
- `attempt-resources.json`, `cleanup-comparison.json`, `cleanup-evidence.json`, `primary-preservation.json`: scoped ownership/removal and preservation evidence.

Generated secret values and signed JWTs were screened/redacted from published evidence; no private Compose or inspect environment configuration is published. Scratch contains development-only attempt material and a portable tool archive; no disposable Docker resources remain running or retained.

No live API, websocket, Storage, cron firing, settlement, reward/notification idempotency, SQL concurrency or effective security claim is made. Successful managed job exits do not prove full application compatibility. Step 4C remains blocked against the existing local database; Android Step 2F remains deferred.

**Stop point:** failed extension-prerequisite authentication. No second startup, repair, migration execution or further feature work is authorized by this report.

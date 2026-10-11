# Phase 11 Step 5H: Isolated database validation, Attempt 3

**Recommendation: BLOCKED before infrastructure creation.** No database startup, migration execution, SQL transaction, pgTAP or concurrency test occurred. The reviewed CLI setup cannot meet this checkpoint's all-new-credentials requirement. Do not interpret passing offline tooling checks as database security validation.

## Verified preconditions

| Item | Result |
|---|---|
| Fresh worktree | C:/p11db3 |
| New branch | test/phase-11-isolated-db-attempt-3 |
| Frozen candidate | a92a550527f810913b01f6e6411dc78996c71a06 |
| Implementation snapshot/tree | 9c71d72a15095047821789386ca9d395961bab4f / b1582e0cbd5c4f25e88e63e81e323703bac6180f |
| PR #31 generator/tests | Exact Git blobs at 8c0b4e9c7d49a330e7e549f91c48070b0d1dfd15 |
| Frozen source hashes | 245/245 verified: 106 migrations, 89 SQL suites, 50 implementation artifacts |
| Offline tests | 27 passed, 0 failed, 0 skipped; exit 0 |
| Compatibility artifact | 106/106 files verified; source/intermediate/final hashes match PR #31 manifest |
| Intended changes | Exactly 3 leading BOM removals and 1 migration 44 statement replacement; 3 changed files |
| CLI | Installed 2.40.7, verified before setup |
| Proposed project | clash_p11v3_20261011; unused in resource inventory |
| Dedicated ports | 57520-57539 bind-checked free; intended API 57521 / DB 57522 |

The generated artifact remains ignored at `.expo/migration-compatibility-5g`. A separate sanitized manifest is retained under docs/evidence/phase-11-5h. Historical migrations, filenames and frozen manifest were not changed. The private, newly generated configuration was removed after deciding to stop.

## Exact blocker

The request requires: **Use only newly generated test credentials**. The previously reviewed CLI 2.40.7 setup generates a new JWT secret and derived API keys, but uses fixed local-development database and Storage S3 credentials. Attempt 2 explicitly documented that limitation; it must not silently carry forward into this stricter checkpoint.

[CLI configuration defaults](https://github.com/supabase/cli/blob/v2.40.7/pkg/config/config.go) initialize fixed Db.Password and Storage.S3Credentials. [Database configuration](https://github.com/supabase/cli/blob/v2.40.7/pkg/config/db.go) marks Password `toml:"-"`; [Storage configuration](https://github.com/supabase/cli/blob/v2.40.7/pkg/config/storage.go) likewise excludes S3Credentials from user configuration. The decoder uses TOML tags, so an assumed SUPABASE_DB_PASSWORD override is not a verified supported replacement for this internal field. The [start command](https://github.com/supabase/cli/blob/v2.40.7/cmd/start.go) and installed `supabase start --help` expose no password/credential override flag. The [managed bootstrap](https://github.com/supabase/cli/blob/v2.40.7/internal/db/start/start.go) supplies the configured database password to PostgreSQL and managed service connections.

These are known local-development defaults, not production credential exposure. Nevertheless, using them would not satisfy the requested all-fresh-credential condition. No patched CLI, environment-variable guess, password alteration, container reconfiguration or substitute stack was attempted. This blocker is specific to the reviewed setup; it does not claim that every Supabase version or isolated Compose configuration lacks fresh-credential support. Source URL/hash evidence and local help output are retained.

A Python orchestration helper initially raised TypeError because its Git wrapper did not accept an input keyword. That file-only wrapper error was corrected before verification completed and before infrastructure creation. The subsequent checks passed. No failed database operation was retried.

## Planned versions, not runtime observations

The reviewed setup would use public.ecr.aws/supabase images:

| Service | Intended image tag |
|---|---|
| PostgreSQL | postgres:17.6.1.002 |
| Auth | gotrue:v2.179.0 |
| Storage | storage-api:v1.26.5 |
| Realtime | realtime:v2.47.0 |
| REST | postgrest:v13.0.6 |
| Gateway | kong:2.8.1 |

No container was created, so these are expected pins from the prior setup, not newly resolved images/digests or health observations. No extension, migration-identity or pg_read_file check was executed. pgcrypto 1.3 / extensions / supabase_admin remains a required future prerequisite, not a verified current target fact.

## Actual database results

- Migrations: **0 attempted, 0 applied, 106 blocked**; no ledger exists for this proposed project.
- SQL suites: **0 executed, 89 blocked**; **0 TAP assertions**. None passed or failed at the database layer.
- Concurrency: **0 executed, 9 blocked**, included in those 89 suites (048, 055, 057, 059, 067, 071, 073, 078, 080).
- H1/H2/H3/M1, canonical Room profile statistics, BLIND, role contexts, effective grants/RLS/ownership, Storage/Realtime/cron and fixture isolation: **BLOCKED**.
- Publication-error/extension-hook interaction: **not reproduced**. Step 5F's source-supported hypothesis remains unconfirmed by runtime testing.

## Isolation and cleanup evidence

Read-only Docker inventories before and after preparation compare equal for existing container IDs/names/states/ports, volume names and network IDs/names. **0 containers, 0 volumes and 0 networks created**; none required cleanup. No existing local or hosted database was connected to. No existing resources were restarted or removed. Newly generated secret-bearing configuration was deleted only at its verified absolute path inside this worktree; no credentials are committed. Primary checkout status still contains the same unrelated modified/untracked Crew files.

No merge, deployment, Android operation, privilege grant, hook change, ownership change or source migration rewrite occurred. Step 4C remains BLOCKED against the existing database; Android Step 2F remains DEFERRED.

## Next decision

No validation sequence started. Work stops at this precondition blocker. A future run requires explicit direction either allowing the documented CLI development defaults exclusively inside a new disposable stack, or approving a separately reviewed credential-capable setup with pinned versions and equivalent managed bootstrap. Neither is authorized by this report, and no further attempt will run automatically. Existing migration and hook compatibility risks remain unresolved until a separately authorized integrated validation succeeds.

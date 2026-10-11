# Phase 11 Step 5E — Isolated Database Validation, Attempt 2

**Recommendation: FAIL.** The BOM-only artifact passed the previous encoding blocker, but the migration chain failed at migration 44 on an extension-hook authorization error. Integrated security, pgTAP and concurrency validation are **BLOCKED**, not passed. The single new attempt is consumed. No repair, reset, failed-operation retry, grant broadening or owner change occurred.

Date: 2026-10-11. Repository: `Xcalibur-hub/clash-app`. References: [frozen candidate PR #26](https://github.com/Xcalibur-hub/clash-app/pull/26), [attempt-1 evidence PR #27](https://github.com/Xcalibur-hub/clash-app/pull/27), [encoding tooling PR #28](https://github.com/Xcalibur-hub/clash-app/pull/28).

## Frozen candidate, tooling and artifact provenance

| Item | Verified value |
| --- | --- |
| Frozen candidate/seal | `a92a550527f810913b01f6e6411dc78996c71a06` |
| Implementation snapshot | `9c71d72a15095047821789386ca9d395961bab4f` |
| Implementation tree | `b1582e0cbd5c4f25e88e63e81e323703bac6180f` |
| PR #28 tooling commit | `1f6dffafab56788535b41a041d3806330575960a` |
| Source manifest Git-blob SHA256 | `a9b30736c87a7fac05c9764404dfd58a876f64db6a3e072e9a348cac8b162b4e` |
| Source hashes verified before infrastructure | **245/245**: 106 migrations, 89 SQL suites, 50 implementation artifacts |
| PR #28 file-only unit tests | **18/18 passed**, exit **0**; not SQL tests |
| BOM-only artifact generation | Exit **0**, **106/106** output hashes verified |
| Transform | Exactly **3 files / 9 bytes** removed; every other byte unchanged |

The implementation tree matches the frozen manifest; the candidate seal adds only its report/manifest. The three executable audit tools match their PR #28 Git blobs. All 106 artifact files were generated in the fresh worktree's new ignored `.expo/phase-11-migration-artifact` directory. For each affected file, prepending `EF BB BF` to its artifact exactly reconstructed the source; the other 103 files were byte-identical. No historical migration, filename, timestamp, source manifest or existing ledger changed.

| Order | BOM-normalized migration | Source SHA256 | Artifact SHA256 |
| --- | --- | --- | --- |
| 41 | `20261003180000_explore_global.sql` | `a5599544c44e28415cc9d5434b0cf66f70d555257b443a5380f871fc559c9c9b` | `4805536986e72761137b355cce7279eefa0c22e39927b95801fbaeda56a4d1f6` |
| 44 | `20261004120000_explore_play_system.sql` | `b047b47ea03dbb90bb4324b40a20196e30dd449d89557b42a49b4e1d8045d844` | `465ae53388c6d3e0399be3cacb23b519416fe9824efb7f64e1a653d30b96d990` |
| 102 | `20261011053717_critical_authorization_hardening.sql` | `0207239f0d23d27aa6e71b0d3236c14a2cf7fe57af7839d61a958c122bb3d5cb` | `f600540c9174e64697aeff19adc98e15213a2545888cac68784e40ce84767c8e` |

[Structured evidence](evidence/phase-11-5e/validation-results.json) includes the complete dual-hash manifest, individual statuses for all 106 migrations and 89 SQL suites, owned resource metadata and cleanup commands/results.

## Disposable environment and isolation

- Fresh short-path worktree: `C:\p11db2`. Validation used PR #28's tools on `test/phase-11-isolated-validation-attempt-2`. After validation, a separate report branch was based directly on the frozen integration candidate so its draft PR contains only this report and evidence; existing branches remain intact.
- Project ID: **`clash_p11v2_20261011`**. Configuration: `C:\p11db2\.expo\attempt2\stack\supabase\config.toml`.
- Before resource creation, Docker inventories confirmed the new project names absent and ports **57420–57439** were bind-checked as unused. Published API/PostgreSQL ports were **57421/57422**, with a dedicated network and volumes.
- CLI **2.40.7**, matching the documented previous managed setup. No CLI upgrade or native dependency installation occurred.
- New random JWT secret and derived API tokens; other database/S3 credentials used only the CLI's local-development defaults on this new disposable target. They are not production credentials or a hardened hosted configuration. No real credentials, users, data snapshots, provider secrets or existing environment files were loaded. Child processes excluded inherited backend/connection overrides; no existing environment file or secret was modified.
- New seed-free, unlinked configuration; optional Studio, analytics/vector, Edge runtime, mail UI, pooler and image proxy excluded/disabled. Managed Auth/Storage/Realtime remained enabled. The CLI's built-in schema/role initialization ran, not application seed files.
- No existing database was queried, connected to, modified or restarted; no hosted project was accessed. Existing Docker resources were inventoried read-only. No Android operations, deployment or merge occurred.

The single `supabase start` exited **0** with health checks enabled. Database, Auth, Storage, Realtime and gateway were healthy; REST was running and CLI setup succeeded. These are startup observations, not application integration/security tests.

| Component | Resolved image |
| --- | --- |
| PostgreSQL | `public.ecr.aws/supabase/postgres:17.6.1.002` — server **17.6** |
| Auth | `public.ecr.aws/supabase/gotrue:v2.179.0` |
| Storage | `public.ecr.aws/supabase/storage-api:v1.26.5` |
| Realtime | `public.ecr.aws/supabase/realtime:v2.47.0` |
| REST | `public.ecr.aws/supabase/postgrest:v13.0.6` |
| Gateway | `public.ecr.aws/supabase/kong:2.8.1` |

Only this database received required extension initialization: **pgcrypto 1.3**, **PostGIS 3.3.7**, **pg_cron 1.6**, **pgTAP 1.2.0**. pgTAP/PostGIS/pgcrypto are in `extensions`; pg_cron is in `pg_catalog`. Managed extension ownership is `supabase_admin`, observed rather than manually changed. `postgres` is the migration/session role, non-superuser with BYPASSRLS; no ownership workaround was attempted.

## One migration pass and exact failure

Application bootstrap initially had an empty migration directory. The 106 artifact files were reverified and copied unchanged into the explicitly isolated `C:\p11db2\.expo\attempt2\stack\supabase\migrations` directory, whose exact file set/order was checked. Then one command ran:

```powershell
supabase migration up --local --workdir C:/p11db2/.expo/attempt2/stack
```

This is a record of the consumed attempt, **not permission to rerun**. CLI history recording operated normally on the fresh target; no manual ledger inserts/repair occurred.

| Result | Count |
| --- | ---: |
| Migrations applied, matching exact ledger prefix | **43** |
| Migration attempted and failed | **1** |
| Later migrations not attempted | **62** |
| Total | **106** |
| Migration CLI exit | **1** |

The ledger ends at `20261003200000_explore_for_you_ia.sql`. **Migration 41 successfully applied**, so the previously observed BOM failure was passed. Migration 44, `20261004120000_explore_play_system.sql`, failed at **statement 0**:

```sql
create extension if not exists pgcrypto with schema extensions
```

Error: **`permission denied for function pg_read_file`**, SQLSTATE **`42501`**. This is an authorization error, not another BOM parse error. The normalized file's first executable statement is unchanged from source.

The [retained server error](evidence/phase-11-5e/postgres-error.log) shows the extension custom-script path executing an inline block that calls `pg_read_file('/etc/postgresql-custom/extension-custom-scripts/before-create.sql')` for `pgcrypto`. [Read-only catalog evidence](evidence/phase-11-5e/post-failure-catalog.log) confirms that path is configured through `supautils`, `pg_read_file` overloads grant execution only to `supabase_admin`, and `has_function_privilege('postgres', 'pg_catalog.pg_read_file(text)', 'EXECUTE')` is **false**. `pgcrypto` already exists, owned by `supabase_admin`.

The immediate hook/privilege mismatch is confirmed. **Why this invocation failed after earlier extension statements succeeded remains unresolved**: the role/driver/hook interaction requires separate investigation. It would be premature to attribute the underlying defect solely to application SQL, the CLI or the managed image. No failing statement was replayed, no file was read through the denied function, and no grant, role membership, owner, hook configuration or migration was changed to obtain a pass.

The complete sanitized [migration output](evidence/phase-11-5e/migration-failure.log) is retained. Catalog reads after failure were limited to the disposable ledger, extension/hook/role diagnosis and resource/data-scope evidence, not continued security testing.

## Security, SQL and concurrency results

**Zero database test suites ran; zero TAP assertions executed.** Totals are **0 passed, 0 failed, 89 blocked**. Nine of these 89 are the prepared concurrency/race suites, not nine additional completed suites. The successful 18 file-only tooling tests above must not be counted as database security coverage.

| Required area | Actual result |
| --- | --- |
| H1 notification forgery/trusted notification writers | BLOCKED; migration 102 not reached |
| H2 lesson bodies/media and entitlement contexts | BLOCKED; migration 102 not reached |
| H3 owner reputation history | BLOCKED; hardening migration not reached |
| M1 hidden-source Clash/verdict and BLIND visibility | BLOCKED; hardening migration not reached |
| Profile-statistics canonical Room gate | BLOCKED; corrective migration not reached |
| Guest/unrelated/owner/creator/fighter/juror/staff authorization | BLOCKED; no role-context TAP assertions executed |
| Block/mute, account isolation and private Realtime | BLOCKED; no regression assertions executed |
| Exactly-once settlement/rewards/notifications and concurrent acceptance | BLOCKED; no concurrency assertions executed |
| Final effective grants, RLS and trusted function ownership audit | BLOCKED on incomplete integrated schema; extension-hook diagnosis only |
| Full integrated Storage/publication/cron behavior | BLOCKED; partial bootstrap catalogs only |

All suite names/hashes and blocked statuses are individually recorded in the structured evidence. This includes `087_critical_authorization.sql`, `088_h3_reputation_privacy.sql`, `089_m1_clash_visibility.sql`, `085_profile_clash_stats.sql` and `086_safety_settings.sql`. Blocked concurrency suites: **048, 055, 057, 059, 067, 071, 073, 078, 080**.

Observed partial bootstrap only: Storage buckets `public-media` (public) and `private-media` (private), publication `supabase_realtime`, and one active `clash-maintenance` cron job every minute as `postgres`. The cron log shows maintenance completing on the empty disposable app data; that is not an idempotency/reward test. No test fixtures were inserted; read-only counts showed **0 auth users, profiles, Takes and notifications** before cleanup. This is scope evidence, not a passing fixture-leakage regression suite. No SQL test suite, pgTAP suite, concurrency runner or Step 4C wrapper was run after failure.

## Cleanup and remaining blockers

Scoped cleanup completed **2026-10-11T11:57:58Z**. Each captured container ID/name, sole new network and volume mounts was rechecked against the preflight baseline before deletion. All explicit stop/remove operations exited **0**.

Removed only:

- Six containers: `supabase_db_clash_p11v2_20261011`, `supabase_auth_clash_p11v2_20261011`, `supabase_realtime_clash_p11v2_20261011`, `supabase_rest_clash_p11v2_20261011`, `supabase_storage_clash_p11v2_20261011`, `supabase_kong_clash_p11v2_20261011`.
- Three volumes: `supabase_db_clash_p11v2_20261011`, `supabase_config_clash_p11v2_20261011`, `supabase_storage_clash_p11v2_20261011`.
- Network: `supabase_network_clash_p11v2_20261011`.
- New scratch configuration/exports, generated BOM-only artifact directory and private bootstrap log, after evidence capture. Their exact absolute paths were verified before filesystem removal; credentials were not committed.

Post-cleanup inventories contain **zero** resources for this project. All pre-existing container IDs, volume names and network names equal the baseline sets; existing container states and published port mappings are unchanged. The primary checkout's dirty file list is unchanged. Existing cached images were not pruned. These are resource/status checks, not queries into existing databases.

Remaining blockers: review the managed extension-hook/migration-role interaction, then separately review any proposed compatibility fix without widening client privileges or changing trusted owners. The full migration chain, H1/H2/H3/M1, aggregate visibility, final grants/RLS, Storage/Realtime and concurrency remain unverified. Attempt 2 is consumed: **another fresh disposable validation requires new explicit authorization**. Existing-local Step 4C remains **BLOCKED**; Android Step 2F remains **DEFERRED**. No production-readiness or zero-vulnerability claim is made.

Stop after the documentation/evidence draft PR stacked directly against the frozen integration candidate; do not deploy, merge, automatically repair or initiate Attempt 3.

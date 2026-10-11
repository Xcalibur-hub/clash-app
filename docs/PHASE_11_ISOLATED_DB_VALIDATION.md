# Phase 11 Step 5C — Isolated Database Validation

**Recommendation: FAIL — the frozen migration chain does not bootstrap cleanly using the installed CLI.** Security, pgTAP and concurrency validation are **BLOCKED**, not passed. The one authorized controlled attempt is consumed. No fix, migration replay or reset was performed.

Date: 2026-10-11. Repository: `Xcalibur-hub/clash-app`.

## Candidate and isolation

- Candidate: draft [PR #26](https://github.com/Xcalibur-hub/clash-app/pull/26), still open and unmerged.
- Frozen delivery commit: `a92a550527f810913b01f6e6411dc78996c71a06`.
- Implementation commit: `9c71d72a15095047821789386ca9d395961bab4f`.
- Main baseline: `eccd5214e0c6e3ce68f86b9656d972441b53a34a`.
- Implementation tree matches the manifest. The delivery seal differs only in the integration report and manifest.
- Frozen manifest Git-blob SHA256: `a9b30736c87a7fac05c9764404dfd58a876f64db6a3e072e9a348cac8b162b4e`.
- All **245** recorded artifact hashes match exact Git blob bytes: 106 migrations, 89 SQL suites, 50 client/config/harness artifacts. The 106 migration and 50 implementation hashes were verified before application; the remaining 89 suite hashes were verified after the migration stop, before any test execution. Windows working-tree CRLF bytes were not substituted for Git blobs.
- New worktree: `C:\p11dbv`; new branch: `test/phase-11-isolated-db-validation`.
- Disposable configuration: `C:\p11dbv\.expo\p11-validation\stack\supabase\config.toml`. No original configuration, environment file, secret, seed or linked-project reference was copied. Application migrations were initially absent; application seeding was disabled.
- New project ID: `clash_p11v_20261011`. Before creation, all container/volume/network names were checked against Docker inventory and all ports `57320–57339` were bind-checked as available. The only published ports used were API `57321` and PostgreSQL `57322`; no existing stack ports were changed.
- A new random JWT signing secret and derived disposable API tokens were used. Database/admin and S3 credentials otherwise used the CLI's local-development defaults on the new resources only; they are not production credentials or unique hardened deployment credentials. No real users, snapshots, provider credentials or existing database secrets were loaded. Secret values are omitted from committed evidence.
- Existing local and hosted databases were never queried or connected to. Existing containers were not exec'd, stopped, restarted or reconfigured. Docker inventory inspection was read-only. Primary dirty Crew/development files and branches were preserved.

The report PR is stacked against the integration candidate branch to keep its diff documentation/evidence only. This does not modify or merge PR #26.

## Disposable environment actually created

Supabase CLI **2.40.7** was used without an upgrade. `supabase start` exited **0** with health checks enabled. This CLI version resolved the cached images below; these are not a claim about a future hosted target's versions.

| Component | Image | Container ID prefix |
| --- | --- | --- |
| PostgreSQL | `public.ecr.aws/supabase/postgres:17.6.1.002` | `5475ec0239c8` |
| Auth | `public.ecr.aws/supabase/gotrue:v2.179.0` | `7b8307fe7c14` |
| Storage | `public.ecr.aws/supabase/storage-api:v1.26.5` | `6d1b45b60b5f` |
| Realtime | `public.ecr.aws/supabase/realtime:v2.47.0` | `ffa7396ebcf8` |
| REST | `public.ecr.aws/supabase/postgrest:v13.0.6` | `e66201c84685` |
| Gateway | `public.ecr.aws/supabase/kong:2.8.1` | `9c6a5d81f4b8` |

All names are `supabase_<component>_clash_p11v_20261011`; full names/IDs, health, mounts and ports are recorded in [structured evidence](evidence/phase-11-5c/validation-results.json). Auth, Storage, Realtime, gateway and database were healthy; REST was running and the CLI reported successful setup. This is startup health, not end-to-end authorization testing.

Studio, analytics/vector, Edge runtime, pooler, mail UI and image proxy were excluded/disabled. Required Auth, Storage and Realtime remained enabled. No global Docker socket/configuration changes were necessary. The CLI's built-in managed-schema/role initialization ran; this was not application fixture seeding or a database snapshot restore.

PostgreSQL reported **17.6**, database `postgres`, migration user `postgres`. Managed `auth`, `storage`, `realtime` and `extensions` schemas existed before application migrations; `auth.users`, `storage.objects` and `storage.buckets` were present. pgTAP was initialized only here:

```sql
create extension if not exists pgtap with schema extensions;
```

Post-failure catalog inspection found:

| Extension | Version | Schema |
| --- | --- | --- |
| pgTAP | 1.2.0 | extensions |
| pgcrypto | 1.3 | extensions |
| PostGIS | 3.3.7 | extensions |
| pg_cron | 1.6 | pg_catalog |

The managed Realtime publication `supabase_realtime` existed. Storage initialization created `public-media` (public) and `private-media` (private). One `clash-maintenance` job was scheduled every minute as `postgres`. Those are catalog observations only: final integrated publication membership, Storage policies, maintenance recovery, effective RLS and ownership assumptions were not validated. No SQL test fixtures were run, and the entire new database was subsequently removed.

## Exact attempt and migration results

Commands below identify the actual disposable-only invocations; they are evidence, **not authorization to rerun**:

```powershell
supabase start --workdir C:/p11dbv/.expo/p11-validation/stack --exclude studio,postgres-meta,edge-runtime,logflare,vector,supavisor,mailpit,imgproxy
# pgTAP initialization used docker exec ONLY on supabase_db_clash_p11v_20261011.
supabase migration up --local --workdir C:/p11dbv/.expo/p11-validation/stack
```

After empty application bootstrap, all 106 migrations were exported unchanged from the frozen Git commit into the new configuration's migration directory. Their filename order matched the manifest. The CLI handled normal fresh-target migration history; no version was manually inserted, repaired or marked applied.

| Result | Count |
| --- | ---: |
| Migrations committed, verified against disposable ledger | **40** |
| Migration attempted and failed | **1** |
| Later migrations not attempted | **65** |
| Total frozen migrations | **106** |
| Migration CLI exit code | **1** |

The 40-row ledger exactly matches the manifest prefix, ending at `20261003160000_room_pulse_and_scale.sql`. Migration 41 failed:

`supabase/migrations/20261003180000_explore_global.sql`

- SQLSTATE: **42601**, syntax error at statement 0 near U+FEFF.
- Exact initial bytes: `ef bb bf 2d 2d 20 50 68 61 73 65 20 31 34 2e 30`.
- Blob SHA256: `a5599544c44e28415cc9d5434b0cf66f70d555257b443a5380f871fc559c9c9b`.
- The leading UTF-8 BOM was submitted as part of the first statement in this CLI migration path and rejected. This byte sequence is already present in the frozen main baseline; it was not introduced by worktree export or the Phase 11 candidate integration.
- This establishes failure of the exact frozen bytes with CLI 2.40.7 / PostgreSQL 17.6. No alternative CLI/psql path was tried, and cross-version behavior is unverified.

The full captured migration output is in [the sanitized failure log](evidence/phase-11-5c/migration-failure.log). Individual statuses and hashes for all 106 migrations, the exact applied ledger and all blocked suites are in [structured evidence](evidence/phase-11-5c/validation-results.json).

The Python capture wrapper wrote the true migration exit code before a Windows cp1252 log-display error. The subsequent diagnostic reader initially encountered the same console encoding limitation; reading/printing the preserved log explicitly as UTF-8 succeeded. These were host-side log-rendering errors, not another migration attempt or the cause of the PostgreSQL failure.

## SQL, security and concurrency results

**No SQL test suite was started.** There are **0 suites passed, 0 suites failed, 89 suites blocked** and **0 TAP assertions executed**. A successful startup, extension installation or catalog query is not counted as a passing pgTAP/security test. `supabase test db` and the previously blocked Step 4C wrapper were not run.

| Required verification | Actual result |
| --- | --- |
| H1 notification forgery and trusted writers | BLOCKED: hardening migration not reached |
| H2 lesson body/media isolation and entitlement contexts | BLOCKED: hardening migration not reached |
| H3 owner-only reputation history | BLOCKED: hardening migration not reached |
| M1 hidden Clash/verdict, known-ID, canonical and legacy visibility | BLOCKED: hardening migration not reached |
| Profile statistics canonical Room gate | BLOCKED: correction migration not reached |
| BLIND identity and column protection | BLOCKED: no role-context regression suite executed |
| Block/mute, account isolation and private Realtime | BLOCKED: no role-context/runtime suite executed |
| Guest, unrelated, owner, creator, fighter, juror, staff contexts | BLOCKED: no authorization assertions executed |
| Exactly-once settlement/rewards/notifications | BLOCKED: no concurrency/idempotency assertions executed |
| Fixture scope/cleanup regression assertions | BLOCKED: no test fixtures created; disposable resources removed |

All 89 suites, including `087_critical_authorization.sql`, `088_h3_reputation_privacy.sql`, `089_m1_clash_visibility.sql`, `085_profile_clash_stats.sql` and `086_safety_settings.sql`, are individually recorded as blocked in the evidence JSON.

The nine prepared concurrency/race suites were not run:

- `048_arena_trending_rank_race.sql`
- `055_arena_duel_concurrency.sql`
- `057_arena_challenge_concurrency.sql`
- `059_arena_crowd_concurrency.sql`
- `067_arena_interest_concurrency.sql`
- `071_canonical_authorization_concurrency.sql`
- `073_official_submission_concurrency.sql`
- `078_arena_question_concurrency.sql`
- `080_arena_editorial_concurrency.sql`

No unauthorized-access success or new application vulnerability was established by this attempt because the integrated security schema was never reached. H1/H2/H3/M1 protections remain **unverified on a database**, not cleared. First-40 migration success also does not prove all PL/pgSQL paths compile/execute correctly at runtime.

No client/unit/Doctor or Android checks were rerun in this database-only attempt. Prior Step 5B client checks remain prior evidence; they are not new SQL evidence. Android Step 2F remains **DEFERRED**. Step 4C against the existing local database remains **BLOCKED**, and was not retried.

## Cleanup evidence

Cleanup completed at **2026-10-11T10:53:04Z**, after read-only failure/ledger/resource evidence capture. Before deletion, each disposable container was checked by its full captured ID, exact name, sole new network and allowed volume mounts. No generic prune, global Supabase stop, reset or volume wildcard was used.

Removed **only**:

- Six captured containers: `supabase_db_clash_p11v_20261011`, `supabase_auth_clash_p11v_20261011`, `supabase_realtime_clash_p11v_20261011`, `supabase_rest_clash_p11v_20261011`, `supabase_storage_clash_p11v_20261011`, `supabase_kong_clash_p11v_20261011`.
- Three volumes: `supabase_db_clash_p11v_20261011`, `supabase_config_clash_p11v_20261011`, `supabase_storage_clash_p11v_20261011`.
- One network: `supabase_network_clash_p11v_20261011`.

Each explicit Docker stop/remove operation exited **0**. Post-cleanup inventories contain **zero** resources for this project. All pre-existing container IDs, volume names and network names equal the baseline sets. Existing container running/stopped states and published port mappings are unchanged. The primary checkout's modified/untracked file list is unchanged. These are resource/status checks; no existing database was queried to compare its contents.

The isolated stack configuration (including generated disposable signing secret), exported migration/test copies and private bootstrap log were also removed from the new ignored scratch directory. Sanitized documentation/evidence remains. Existing cached images were not deleted or pruned. No hosted operations, deployment, main merge or Android operation occurred.

## Required next authorization and limitations

1. Review a separate correction for the historical BOM/migration-loader incompatibility. Changing historical migration bytes changes their hashes and must be explicitly reconciled with migration immutability and existing ledgers; this report does not modify them or choose an untested repair.
2. Prepare and re-freeze a reviewed candidate/manifest or an explicitly approved compatible migration execution path. Add a source-encoding preflight so lexical/hash checks do not imply SQL compilation success.
3. Obtain **new explicit authorization** for another fresh disposable environment and controlled validation attempt. The current one is consumed; this report is not retry approval. No existing local Step 4C retry is authorized.
4. Revalidate isolation and managed-schema/owner/default-grant prerequisites, complete all migrations without a repair, then run H1/H2/H3/M1 and aggregate-gate security tests followed by all 89 suites with actual TAP accounting and approved concurrency checks. Quiesce only the new environment's scheduler before committed fixtures, retaining the intended cron schedule for inspection.
5. Only a later successful validation can support staging readiness. Hosted-version parity, effective/inherited grants, trusted function ownership, SQL runtime paths, application Auth/Storage/Realtime flows and concurrency remain unverified. No zero-vulnerability or production-readiness claim is made.

Stop point: documentation/evidence branch and draft PR only. No candidate implementation fix, deployment or merge is part of Step 5C's failed attempt.

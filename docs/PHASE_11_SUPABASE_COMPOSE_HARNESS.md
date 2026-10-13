# Phase 11 Step 5K — Proposed isolated Supabase Compose harness

Status: **FILE-ONLY preparation; runtime/database validation NOT EXECUTED.** No new database attempt is authorized. Step 4C remains BLOCKED against the existing database; Android Step 2F remains DEFERRED.

## Provenance and deliverables

New isolated worktree: `C:/p11compose`, branch `build/phase-11-isolated-compose-harness`, based on PR #34 commit `d7cd45d918635345636915092016c5d21c96f31f`. This PR stacks on PR #34; it does not merge or modify any reference PR.

Frozen PR #26 seal: `a92a550527f810913b01f6e6411dc78996c71a06`; implementation: `9c71d72a15095047821789386ca9d395961bab4f`. Original manifest Git-blob SHA256: `a9b30736c87a7fac05c9764404dfd58a876f64db6a3e072e9a348cac8b162b4e`.

All **245** frozen file hashes were checked from Git blobs, including **106 migrations**, **89 SQL suites**, and **50 client/config/harness files**. Historical migrations and the frozen manifest are unchanged. Step 5G's existing generator supplies the same three BOM removals and migration 44 assertion; no further migration transformations are introduced.

Files in `tools/isolated-supabase/`:

- `compose.example.json`: complete Compose configuration with required secret placeholders. Use the generator, not this example, for an attempt.
- `prepare.cjs`: file-only source verification, fresh JWT/API keys and encryption material, ignored scratch directory, compatibility artifact and exact suite copies.
- `images.json`: immutable registry index, amd64 manifest and image-config digests for all six images.
- `vendor/`: exact CLI 2.40.7 bootstrap templates, hashes, upstream URLs and license. Local `.gitattributes` preserves vendor bytes on Windows.
- `db-entrypoint.sh`: same PG17 managed-image/postinit entrypoint arrangement used by CLI 2.40.7.
- `extensions.sql`: future disposable-only prerequisite checks and missing-extension provisioning; never creates/replaces pgcrypto or changes role privileges.
- `lifecycle.ps1`: proposed guarded create/bootstrap/runtime/cleanup stages. Container creation is separate from startup so PR #34's checker can inspect HostConfig first.
- `execute.cjs`: guarded, single-use CLI migration execution and bounded SQL-suite execution; exact artifact checks, clean child environment, failure evidence and real TAP accounting.
- `tap.cjs`, `offline.test.cjs`: dependency-free TAP parser and harness regression tests.
- `inspect-security.sql`: prepared read-only effective role/ACL/RLS/owner/Storage/Realtime/cron inventory for a future authorized attempt.

No main-app dependencies, native files, UI, source migrations, application security policies or existing environment files changed.

## Service and resource contract

| Service | Reviewed image tag | Host publication |
|---|---|---|
| PostgreSQL | `supabase/postgres:17.6.1.002` | `127.0.0.1:57722:5432/tcp` |
| Auth | `supabase/gotrue:v2.179.0` | None |
| Storage | `supabase/storage-api:v1.26.5` | None |
| Realtime | `supabase/realtime:v2.47.0` | None |
| PostgREST | `supabase/postgrest:v13.0.6` | None |
| Gateway | `supabase/kong:2.8.1` | `127.0.0.1:57721:8000/tcp` |

Each image is pinned by registry digest and `platform: linux/amd64`. HTTP registry inspection verified the raw index digest, selected amd64 manifest digest and referenced config digest. DB/Auth/Realtime/Kong index digests match the prior Step 5I evidence. This is registry verification, **not an image pull or runtime verification**. Exact values are in `images.json`.

Project IDs must match `clash_p11bind_[a-z0-9_]+`. One explicitly named project bridge and three named volumes (`db-data`, `db-config`, `storage-data`) are generated; no external volumes/networks, host networking, container-name overrides or additional host publications. Init jobs have no published ports. Restart policy is `no`; initialization or migration failures are not retried automatically.

The generated config contains fresh JWT secret, role-scoped signed API keys, Realtime secret/encryption material, pgsodium key and S3 test credentials. Fixed `postgres` DB/managed-role passwords preserve CLI development bootstrap and the existing dblink tests; their use requires explicit authorization for the NEXT disposable attempt. They are not hosted/staging/production credentials. Scratch configuration and inspect snapshots contain secrets: never commit or publish them. No existing secret/environment file is read or changed.

## Managed bootstrap fidelity and explicit differences

1. The exact pinned managed PostgreSQL image supplies its managed roles, schemas, default grants, preload libraries, extension packaging and migration hook configuration. We do not recreate these with a generic PostgreSQL image.
2. CLI's `schema.sql`, `webhook.sql` and `_supabase.sql` are byte-preserved, concatenated into `/etc/postgresql.schema.sql`, then consumed by the image's normal bootstrap. This retains CLI's managed passwords, `_realtime` setup, webhook initialization and auxiliary `_supabase` database. No custom superuser elevation, ownership correction, pg_read_file grant or supautils override is added.
3. Realtime initialization, Storage `migrate-call.js`, and Auth `gotrue migrate` run **once in that order**, using the exact image jobs and role identities reviewed in CLI `initSchema15`. Runtime containers start after application migrations. No Studio, analytics server, pooler, mail server, Edge runtime or image proxy is supplied; those are not required by these SQL suites. Their auxiliary image-managed schemas are not removed.
4. Storage target migration is intentionally empty: CLI 2.40.7 only overrides it from a pre-existing non-semver Storage cache file; the new environment has no inherited cache. Storage and Realtime use fresh shared HS256 secrets, rather than CLI-generated JWKS metadata; the pinned services' symmetric-secret configuration is retained. This compatibility still needs runtime testing.
5. Gateway routes are the pinned CLI template through the Storage route, with the four container destinations rendered. Realtime has the `realtime-dev` network alias and gateway upstream host matching its seeded tenant, because the pinned AssignTenant plug derives the tenant from the host. Routes for omitted optional services are excluded; no application authorization logic is replaced. Anonymous Data API access continues to depend on database grants/RLS. Gateway itself is localhost-only.
6. pgcrypto is asserted to be **1.3 / extensions / supabase_admin**, never recreated. Missing PostGIS, pg_cron, pgTAP and dblink are provisioned only in the future new disposable database by its existing managed admin. Existing extensions do not trigger redundant CREATE statements. The migration identity must be restricted `postgres`, without superuser, file-reading EXECUTE privileges or `pg_read_server_files` membership. No role/grant/owner patches are provided.
7. Upstream templates include upstream grants as part of initial managed bootstrap. These are not new application policy relaxations; the frozen hardening migrations and adversarial suites must validate their resulting effective privileges. This harness is not a hardened hosted deployment configuration.

Source inspection: [CLI PG bootstrap/jobs](https://github.com/supabase/cli/blob/v2.40.7/internal/db/start/start.go), [CLI runtime configuration](https://github.com/supabase/cli/blob/v2.40.7/internal/start/start.go), [Storage cache handling](https://github.com/supabase/cli/blob/v2.40.7/pkg/config/config.go), [managed image bootstrap](https://github.com/supabase/postgres/blob/17.6.1.002/migrations/db/migrate.sh).

## Migration and test execution design

`supabase migration up --db-url ... --workdir <scratch>` uses **CLI 2.40.7**, an explicit loopback database URL and the verified `supabase/migrations` directory. No `--local`, linked project, seeds, reset, ledger import, repair or handwritten migration-history inserts. An existing application ledger is refused. The executor preserves CLI's parser and per-file implicit transaction: statements plus that migration's normal history insert are one batch. A final exact ordered 106-version comparison is required before tests. Failure consumes the marker; no replay is attempted.

Source: [CLI migration up](https://github.com/supabase/cli/blob/v2.40.7/internal/migration/up/up.go), [transactional migration batch and history insert](https://github.com/supabase/cli/blob/v2.40.7/pkg/migration/file.go).

All 89 suite bytes are copied from the frozen commit, including `085_profile_clash_stats`, `086_safety_settings`, `087_critical_authorization` (H1/H2), `088_h3_reputation_privacy` and `089_m1_clash_visibility`. Suites run sequentially through container-local `psql -X -q -A -t -v ON_ERROR_STOP=1`, as the restricted migration role, with `public,extensions` search_path so pgTAP resolves. No wrapper changes their transaction behavior.

The nine designated concurrency/race suites are **048, 055, 057, 059, 067, 071, 073, 078, 080**. `048` is called `arena_trending_rank_race`, not `*_concurrency`. Suites 053 and 076 also contain dblink/contention checks and remain included. Connection strings using localhost:5432/password postgres execute inside the new DB container. No concurrency fixture is redirected to an existing environment.

The parser requires exactly one TAP plan, matching count, sequential unique assertion numbers, no SQL failure/bailout, and no failed assertions/unexpected TODO successes. Skips and TODOs are counted separately. Exit 0 alone is insufficient. Each suite has a 15-minute subprocess bound. The first failed suite stops the sequence, retains raw stdout/stderr and observed assertion counts, and reports remaining suites as unexecuted. A timeout may leave a server session active until the disposable containers are stopped; it does not authorize retry. Any security-suite skip/TODO prevents claiming security validation complete.

## Future procedure — NOT AUTHORIZED OR EXECUTED

A new user authorization must explicitly permit ONE fresh disposable attempt, fixed development passwords, extension/bootstrap initialization, the exact artifact, SQL/concurrency testing and scoped cleanup. Existing local/hosted environments remain excluded.

File-only preparation (permitted independently):

```powershell
node tools/isolated-supabase/prepare.cjs clash_p11bind_<unique_attempt>
```

Future runtime sequence after authorization, using PowerShell 7, a clean local Docker context (no DOCKER_HOST/TLS overrides), local Docker Desktop Linux containers and CLI 2.40.7:

1. Review generated configuration and private file permissions. Use a clean shell without inherited backend credentials/project links. Verify no prior attempt markers, project resources or port listeners. Record engine/Compose versions; baseline records container identities/images/states, volumes and networks. Current tooling has not certified a Docker/Compose version by execution.
2. Run `lifecycle.ps1 -Stage create -Directory <scratch> -AuthorizedNewDisposableAttempt`. It verifies rendered Compose bindings, creates all nine containers WITHOUT starting any, and checks actual HostConfig.PortBindings using PR #34's checker. Unsupported host-IP behavior fails before service startup. Never substitute `compose up`.
3. Run the `bootstrap` stage. It starts only DB, checks its actual published mapping and Windows listeners before managed jobs/extension setup, then runs the three init jobs in exact order and extension prerequisites. Stop on the first failure. No restart, reset or privilege workaround.
4. Run `node tools/isolated-supabase/execute.cjs migrate <scratch> --authorized-new-disposable-attempt` ONCE. Inspect the sanitized migration log and exact ledger comparison; failure stops all subsequent validation.
5. Run `runtime` stage. It starts the five remaining runtime services, waits for bounded health checks, checks actual running PortBindings and verifies both Windows listeners are present exclusively at `127.0.0.1`. PostgREST readiness still requires an explicit HTTP probe; no shell is assumed in its image.
6. Separately record `Get-NetTCPConnection -State Listen` for ports 57721/57722. Docker binding inspection is not proof of reachability. With explicit probe authorization, test loopback TCP and `/auth/v1/health`, then connection rejection at the machine's LAN address and from an approved second machine where available. No firewall change is a substitute for explicit loopback publication. If second-machine testing is unavailable, mark it unverified. Never send API keys to a non-loopback probe.
7. Run the prepared `inspect-security.sql` via disposable `db`/`psql`; retain sanitized effective roles/grants/RLS/owners/Storage/publications/cron inventory. Compare it to the candidate security contract; do not patch mismatches. Then run `execute.cjs tests <scratch> --authorized-new-disposable-attempt`. Report all actual TAP counts and unexecuted suites.
8. Review cron/Storage/Realtime behavior and fixture residue from the supplied tests before cleanup. SQL suites exercise private Realtime policies but do not prove live websocket delivery; real gateway, reconnect, Storage upload/download, cron firing and publication-error/hook interaction require separately reviewed target-scoped probes. Do not create fake public production activity.
9. On ANY failure, stop the affected sequence, preserve sanitized evidence, stop only the new project containers, and do not repair or retry. `cleanup` stage removes only the verified project's three volumes/network/containers and compares pre-existing inventory. Partial creation, unexpected project resources, altered definitions or an unprovable baseline require manual review; leave new resources stopped instead of guessing. No prune/global cleanup.

Future command shapes (do not run during 5K):

```powershell
./tools/isolated-supabase/lifecycle.ps1 -Stage create -Directory <scratch> -AuthorizedNewDisposableAttempt
./tools/isolated-supabase/lifecycle.ps1 -Stage bootstrap -Directory <scratch> -AuthorizedNewDisposableAttempt
node tools/isolated-supabase/execute.cjs migrate <scratch> --authorized-new-disposable-attempt
./tools/isolated-supabase/lifecycle.ps1 -Stage runtime -Directory <scratch> -AuthorizedNewDisposableAttempt
node tools/isolated-supabase/execute.cjs tests <scratch> --authorized-new-disposable-attempt
./tools/isolated-supabase/lifecycle.ps1 -Stage cleanup -Directory <scratch> -AuthorizedNewDisposableAttempt
```

Docker references: [create without start](https://docs.docker.com/reference/cli/docker/compose/create/), [explicit host_ip port syntax](https://docs.docker.com/reference/compose-file/services/#ports). Lifecycle flags are an accidental-execution guard, not a substitute for user authorization.

## Offline validation and remaining blockers

**Final combined offline run: 57 tests passed, 0 failed, 0 skipped, 0 TODO (15 harness + 42 existing artifact/encoding/hook/binding tests).**

See `docs/evidence/phase11-5k/offline-tests.tap` and `compatibility-manifest.json` for actual offline evidence (TAP trailing whitespace trimmed for Git presentation; assertion text/counts unchanged). PowerShell parser and Node syntax checks passed. File-only preparation and copied-file integrity verification passed. Source and artifact hashes match; vendor bytes and all six registry digests were checked without Docker.

An initial offline test run had **32 pass / 1 fail** because it counted only filenames containing `concurrency`, omitting the designated `048` rank-race suite. The explicit frozen nine-suite inventory fixes the classification; no SQL assertion was weakened and no historical file changed.

**No Docker commands were issued. No Compose config/render/start, container/volume/network creation, SQL parsing by PostgreSQL, migrations, pgTAP, database connections, reachability probes or Android checks ran.** Existing Supabase and hosted systems were untouched. Primary dirty Crew work is excluded.

Runtime blockers remain: managed image bootstrap and image/CLI compatibility; extension ownership/versions and hook state; per-service schema initialization; gateway tenant routing and symmetric JWT handling; Windows port forwarding/reachability; all106 migrations and all89 SQL suites; actual effective H1/H2/H3/M1 protection and concurrent exactly-once behavior. Caught publication errors may still affect supautils hook state; neither hook disabling nor extra grants are proposed. A fresh disposable attempt is required to establish these facts, with a stop on first failure.

Recommendation: **offline harness preparation complete; database/security validation remains BLOCKED pending separate authorization.** No deployment or production-readiness claim.

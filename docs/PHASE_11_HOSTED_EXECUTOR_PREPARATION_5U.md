# Phase 11 Step 5U ? hosted staging executor preparation

12 October 2026. **FILE-ONLY. Ready for a separately authorized first read-only staging preflight; not cleared for migration, fixture execution or promotion.** No Docker command, SQL execution, database connection, project creation/linking, deployment, Expo or Android operation occurred. Database security remains unverified. Step 4C remains BLOCKED against existing local databases; Step 2F remains DEFERRED.

Draft delivery: [PR #45](https://github.com/Xcalibur-hub/clash-app/pull/45), stacked on PR #44; implementation commit `4125d73836bc567dbc61abd34126bdf05d994e9c`. The final documentation commit is reported in the handoff response. No merge or deployment.

## Frozen baseline and artifact provenance

New worktree `C:/p11exec`, branch `feat/phase-11-hosted-executor`, based on PR #44 head `068a188e751c4b2f7feaa4de787d0945b4e87d27`. Read [the staging plan](PHASE_11_HOSTED_STAGING_READINESS_5T.md) and [project handoff](CLASH_PROJECT_HANDOFF_5T.md). Prerequisites are #26 ? #31 ? #35 ? #37 ? #39 ? #42 ? #43 ? #44, with #28 encoding tooling and #34 binding review included. No prerequisite branch was edited or merged.

- Frozen implementation: `9c71d72a15095047821789386ca9d395961bab4f`.
- Manifest seal: `a92a550527f810913b01f6e6411dc78996c71a06`; Git-blob manifest SHA-256 `a9b30736c87a7fac05c9764404dfd58a876f64db6a3e072e9a348cac8b162b4e`.
- All **245** frozen Git-blob source hashes reverified: 106 migrations, 89 suites, 50 other files. Checkout line endings are not substituted for Git-blob hashes.
- Reused PR #31 generator unchanged: exactly three leading BOM removals and migration 44's reviewed pgcrypto assertion; no other source-byte changes. Generated 106 migrations in a new ignored scratch directory and verified all intermediate/final hashes.
- Compatibility-manifest SHA-256: `8f50541d3eed55bd905117a217bc8118a6b5483d1ffec2e5d0477b2be71b8c8a`.
- New 89-suite source bundle SHA-256: `12cac2a2b0119cb99110061800e14ea167f0928919da4bbd4e464dc0fbead7fe`. All original SQL bytes are preserved; ten derivatives are applied only by the new client bridge. The compiled suite-hash map rejects modified tests.
- Four managed vendor template hashes remain intact. These templates are provenance, not hosted bootstrap scripts: **never run local managed initialization on hosted Supabase**.

## Step 5S TLS investigation: confirmed behavior versus uncertainty

Step 5S previously failed before application migrations with a server TLS refusal. Its evidence records zero application migrations and zero database TAP assertions. No runtime reproduction was authorized here.

Tagged [CLI migration up](https://github.com/supabase/cli/blob/v2.40.7/internal/migration/up/up.go) calls `ConnectByConfig`. [connect.go](https://github.com/supabase/cli/blob/v2.40.7/internal/utils/connect.go) identifies local connections by **both** configured hostname and port. The dedicated nondefault port takes the remote path. That path rebuilds the connection URL with `ToPostgresURL`, then removes plaintext fallbacks. TLS fields are absent from this URL. [The misleadingly named pgxv5 wrapper](https://github.com/supabase/cli/blob/v2.40.7/pkg/pgxv5/connect.go) actually reparses with **pgx v4**, applies callbacks and connects. No claim is made that the CLI uses the new executor's pgx v5 driver.

Offline regression uses the exact vendored/extraction-hash-checked `ToPostgresURL`, `pgconn 1.14.3` and the actual **pgx v4.18.3 parser**, without dialing. Public tagged source and MIT license hashes are recorded under `tools/hosted-staging/vendor-evidence/`.

| Option / input | CLI 2.40.7 reconstructed remote URL / parser result |
|---|---|
| Host, port, username, database, password | Serialized; reconstructed URL can contain credentials and must never be logged |
| Connect timeout, runtime parameters | Serialized; timeout defaults to ten seconds when zero |
| URL `sslmode=disable`, `require`, `verify-ca`, `verify-full` | Parsed into TLS settings, then omitted by URL reconstruction; the supplied mode does not survive this path |
| `sslrootcert` / parsed root pool | Omitted; root certificate/verification configuration is lost |
| Clean environment after reparse | Parser defaults to TLS preference without certificate verification; remote wrapper removes plaintext fallback |
| `PGSSLMODE` at reparse | Parser can honor it again, independently of the lost original option; tested in memory. It is not selected as our hosted execution contract |
| Programmatic configuration callbacks | Applied after reparse; local helper disables TLS, remote helper filters plaintext fallback. No reviewed external migration-up TLS callback is exposed by its flags |

This establishes a source/parser mechanism consistent with the Step 5S failure. It does **not** prove the historical downloaded binary matches every tagged byte or explain server TLS configuration beyond the recorded refusal. We neither disabled TLS nor retried the local environment. The selected solution avoids this serializer rather than trying undocumented CLI flags or inherited environment workarounds.

## Minimal hosted executor contract

[Tool README](../tools/hosted-staging/README.md) and [nonsecret config template](../tools/hosted-staging/config.example.json). Separate Go module pins `pgx/v5 5.7.6` and sums; old parser dependencies are regression-only. No application dependency, native configuration or Compose executor changed. Supabase documents [direct connections for migrations](https://supabase.com/docs/guides/database/connecting-to-postgres); certificate/hostname verification follows [PostgreSQL's verify-full contract](https://www.postgresql.org/docs/17/libpq-ssl.html), implemented explicitly with Go TLS configuration.

1. An operator independently approves one **new staging** project reference and certificate fingerprint. Only `db.<20-letter-ref>.supabase.co:5432`, database/user `postgres` is accepted. No arbitrary URL, local target, pooler, production default or automatic alternate host. Verified TLS hostname binds the connection to that approved endpoint; SQL additionally verifies database, role, PostgreSQL 17 and actual SSL. This cannot independently establish business ownership or that the operator chose staging rather than production: the owner must attest that boundary before any connection.
2. Certificate roots are loaded only from the hash-pinned PEM. TLS >=1.2, hostname verification enabled, no insecure skip and no fallback. Password is supplied solely as process environment `CLASH_STAGING_PASSWORD`, assigned directly to driver config, never serialized into a URL or child command. No SQL client subprocess. Inherited PG/Supabase/backend overrides are rejected; raw connection/SQL error strings are withheld. Windows operator must apply private NTFS ACLs to secret/evidence locations.
3. Separate authorization strings for `preflight:<ref>`, `migrate:<ref>`, `inventory:<ref>`, **`committed-fixtures:<ref>`**. A fresh evidence directory is mandatory and cannot be reused. The strings are execution guards, not evidence of user permission: obtain explicit approval for each scope first.
4. Preflight starts READ ONLY, verifies managed Auth/Storage/Realtime tables and publication, fresh application schema/ledger, pgcrypto **1.3 / extensions / supabase_admin**, restricted migration identity and file-read privileges. It neither installs extensions nor fixes a mismatch. Remaining extension availability/ownership, default ACLs, hosted cron/service settings must be reviewed on the approved target before migration authorization. Missing pgTAP is not repaired by this tool.
5. Migration authorization re-runs fresh preflight, validates all artifact bytes/order, creates the standard migration-ledger schema if absent, then executes each file and its genuine version/name/statements entry **in the same transaction**. There are no premarked/applied entries, history repairs, skip-on-error paths or resumption of partial installations. Commit uncertainty stops without a retry. Ledger name/order/content hashes are rechecked after each commit.
6. Ledger compatibility difference is explicit: `statements text[]` stores one element containing the full exact SQL file, whereas the CLI parser stores multiple parsed statements. Version/name and actual executed content are preserved; list/fetch compatibility is structurally plausible but **not runtime verified**. Review this choice before deployment. Frozen files contain no standalone transaction-control or concurrent-index commands that would undermine per-file transactions (static inspection).
7. `inventory` is a READ ONLY catalogue check for six H1/H2/H3/M1 conditions. It is **not** a full role-level security proof or substitute for 085/087/088/089, REST/JWT, Storage or private Realtime tests. Rollback and connection-close failures are surfaced. Bounded generic evidence is written even when an operation fails; no raw SQL/user data is published.

Direct endpoint access normally needs IPv6 or a paid IPv4 option. If the future operator network cannot reach it, stop. A session-pooler configuration needs its own host/user/certificate review; transaction pooling is not an acceptable substitute for these session-based tests. No project or paid option has been selected or purchased.

## Hosted adaptations of all ten dblink suites

Original suites are untouched. The source bundle includes all 89 suites in filename order. The remaining 79 execute as frozen statements; the ten below replace only reviewed dblink operations with independent TLS client sessions, keeping PostgreSQL's argument evaluation, application RPCs, session roles/JWT claims, transaction interleavings and pgTAP assertions. No server-side credential strings or dblink extension installation is necessary.

| Suite | Adaptation / committed cleanup scope |
|---|---|
| 053 correctness foundation | Same-key rate contention; remote rate-event cleanup. One dynamically executed `lives_ok` body also collects a remote result; its exact frozen body is mapped explicitly |
| 055 duel concurrency | Concurrent duel creation; original owned duel/source/user cleanup |
| 057 challenge concurrency | Accept/cancel races; original challenge/Room/Clash/source/user cleanup |
| 059 Crowd concurrency | Crowd authorization/rate races; original owned Crowd/Room/user cleanup |
| 067 interest concurrency | Interest updates; original owned interest/user cleanup |
| 071 canonical authorization concurrency | Visibility/relationship changes while locks wait; original owned sources/relationships/duels/users |
| 073 official submission concurrency | Same-key official request races; original owned contributions/duels/users |
| 076 maintenance contention | Separate advisory-lock holder; rollback/close releases locks. No owned committed fixture rows; maintenance still requires a sterile project |
| 078 casual question concurrency | Vote/content races; original owned question/vote/source/user cleanup |
| 080 editorial concurrency | Publish/withdraw/pause races; original owned editorial/auth/source cleanup and original saved-config restore in the same remote session |

Offline mapping accounts for **317 top-level dblink calls plus one nested 053 result call**. Dynamic argument expressions are evaluated by PostgreSQL in the main session; the bridge does not implement SQL evaluation. Async calls use independent sessions, busy polling and explicit result draining. Remote JSON record sets replace dblink row sets without joining Crowd and official data. Only the five assertion-required error fragments are exposed; other error text/connection/query details are withheld. The bridge is deliberately limited to the frozen sources, not a general SQL/dblink translator.

`fixtures` requires a separately approved sterile project, complete candidate ledger, matching 89-source bundle, no active scheduled jobs and zero profiles/Auth users/Takes/rate events/Clashes/verdicts/notifications/reputation events. Source fixture guards and IDs are preserved. Fixed historical fixture namespaces mean **one suite/run at a time**; do not parallelize or reuse a target with residual data. App access, outbound mail/hooks and external consumers must stay disabled during this window. No agents acquire hosted credentials in this step.

The main transaction is rolled back before exceptional cleanup. Release attempt-owned remote locks, bound pending-worker waits, reset test roles, execute the original narrowly scoped remote cleanup in a transaction, then close sessions. Normal completed cleanup is not repeated; a failed original cleanup is never retried. Any cleanup, rollback, worker, close or residual-data failure quarantines the target and stops the sequence. Source 080's temporary saved configuration is session-local: if a connection dies, automated restoration may be impossible. Stop and recover from reviewed baseline evidence; never broadly delete or silently claim cleanup. No promise that rollback reverses sequences or externally delivered effects.

TAP accounting validates plans, sequential numbers, failures, bailouts, skips/TODO and unexpected TODO passes. The first genuine failing assertion stops further statements and invokes scoped cleanup. Focused 085/087/088/089 cannot pass with skips/TODO. Suite evidence stores counts/hash/status rather than raw user data. Current residual checks cover the listed core tables, **not proof of every possible cascade/global side effect**; target-specific baseline/owned-ID review remains mandatory before fixture authorization. Historical test assertion equivalence, temporary-table persistence and all hosted remote interleavings remain runtime-unverified.

## Staged validation and recovery gates

1. Approve [the creation checklist](HOSTED_STAGING_CREATION_CHECKLIST.md). Project creation and first connection require new authorization; this PR creates neither.
2. Obtain a Dashboard-confirmed new project reference/owner/region, direct endpoint, certificate and secret-store access; no production secrets. Approve **read-only preflight only**, with one bounded attempt and fresh evidence. Verify TLS/identity, extension versions/owners, managed schema, default grants, trusted function ownership capabilities, cron/Realtime/Storage. Stop on mismatch; no repairs.
3. Review preflight evidence and ledger-format/hosted compatibility. Separately authorize required managed extension initialization and one migration execution; the executor does not provision extensions. Apply 106 files once. A failure leaves previously committed migrations intact: quarantine and review a new additive candidate/recovery decision; no automatic reset, down migration, resume or history repair.
4. After successful migrations, separately approve read-only inventory and relevant API configuration checks. Notices and swallowed publication errors are not included in the six checks; require explicit Realtime publication, Storage bucket/policy, cron, effective default-grant and trusted-owner inspection before declaring backend readiness. The new executor intentionally does not print raw server NOTICE messages, which can expose data.
5. Only with explicit committing-test approval, a sealed fixture inventory, baseline/config recovery record and approved scheduler pause/outbound controls: run all 89 suites via the hosted bridge. Report actual TAP counts; clean owned fixtures; verify all original config/job states and no leaked rows/locks. A test or cleanup failure stops without a retry. No general-purpose reset or source SQL modification is a recovery strategy.
6. Real JWT/API role, signed media, private Realtime, email/Auth redirects and application/device tests remain separate subsequent checkpoints. No merge/deploy/production approval follows automatically.

## Offline verification actually executed

- **81 existing Node tests passed**, 0 failures/skips/TODO: Compose/offline model, auth, Windows environment, actual mocked bootstrap entrypoint, artifact, binding, encoding and extension-hook preflight. All subprocesses mocked; no Docker/SQL execution.
- **28 top-level Go tests passed** with 23 passing nested cases (**47 leaf cases**), 0 failures: pinned old CLI parser/source extraction, certificate-verifying config, actual command dispatch, wrong target, missing credentials, unauthorized execution, TLS redaction, all 106 mock transactions, partial failure, unknown commit, altered ledger/source, async result order, ten mappings, TAP edge cases and cleanup failure/no-retry.
- `go vet ./...` passed. Toolchain `go1.25.3 windows/amd64`; module/runtime/test dependencies pinned in its separate lockfile. No root dependency/package change.
- 245 frozen hashes, 106 artifacts and four managed vendor hashes passed file-only checks. New generator initially hit an encoding issue in its own new JS file; fixed that file only and regenerated into fresh scratch. No historical migration was changed.
- Full evidence: [offline summary](evidence/phase11-5u/summary.json), [Node TAP](evidence/phase11-5u/prerequisites.tap), [Go test events](evidence/phase11-5u/go-tests.jsonl), [provenance checks](evidence/phase11-5u/provenance.json). Shell UTF-16 evidence was decoded to UTF-8; two trailing spaces in Node TAP test names were removed without changing assertions. Whitespace and primary-checkout preservation checked before commit.
- **Database connections: 0. Migrations applied: 0. SQL suites executed: 0. Database TAP assertions: 0.** Prior client/typecheck/Doctor results are prior evidence, not rerun results. No physical testing.

## Readiness and next action

**Hosted executor ready for a separately authorized first staging preflight: YES, limited to the direct endpoint and read-only scope above, once the owner approves creation/identity and supplies verified CA/secret access.** Hosted compatibility, complete security, migrations and committed test cleanup are not established. This is no authorization to create staging or connect now. The immediate next action is owner approval of project organization/region/budget/operator access and one new-project read-only preflight; stop before migration until that evidence is reviewed.

This PR adds only isolated tooling/docs. Primary dirty Crew/development work is preserved; existing security branches are unchanged. No source RLS, grant, owner, gameplay, reward, UI or migration file was edited.

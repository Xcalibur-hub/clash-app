# Phase 11 Step 6J: Hosted migration deployment readiness audit

**Mode:** FILE-ONLY. No hosted database connection, credentials use, migrations, SQL suites, schema changes, Docker, Android builds, or merges.

**Baseline:** PR #56 / `b22f6f798f15294c983cfbfa7369a8863c7c0447` (Step 6I eligibility PASS).  
**Worktree:** `C:/p116j`, branch `audit/phase-11-migration-deploy-readiness-6j`.

## Deployment readiness: READY

Offline audit of the reviewed hosted-staging executor and frozen 106 artifacts found **no deployment-safety defect requiring an executor change**. Step 6I eligibility remains a **precondition**, not deployment authorization. Migrations and security suites were **not** run.

| Concept | Status |
|---|---|
| Step 6I direct preflight / empty ledger | PASS (prior; not re-run) |
| Migration deployment readiness (this audit) | **READY** |
| Migration deployment | **NOT performed / NOT authorized** |
| Application security (H1/H2/H3/M1 inventory) | **UNVERIFIED** (post-deploy, separate auth) |
| Automatic resume after partial apply | **Not supported** (stop-and-quarantine) |

## 1. Migration executor audit

Source: `tools/hosted-staging/executor.go` `migrate()` / `Run()` / `artifacts()` / `authorized()` at baseline `b22f6f7` (executor lineage from Step 6H `e85ce3e`; no migrate-path edits in 6I/6J).

### Confirmed behavior

| Concern | Finding |
|---|---|
| Ordering | Filename-sorted 106 artifacts; `artifacts()` enforces `order == i+1`, unique 14-digit versions, path `supabase/migrations/<file>` |
| Exact hash | Manifest SHA pinned in config; each file re-hashed before apply; re-hash inside loop refuses post-preflight mutation |
| Per-migration transaction | `BEGIN` → migration SQL (simple protocol) → `INSERT` ledger → `COMMIT` |
| Ledger + SQL atomicity | Ledger insert is **inside** the same explicit transaction as the migration body |
| Stop-on-first-failure | Any SQL/ledger error → `ROLLBACK`; confirmed rollback required or `"migration failed; rollback unconfirmed"` |
| Commit uncertainty | Failed `COMMIT` → `"commit outcome unknown; stop and inspect, no retry"` (no auto-retry) |
| Post-commit verify | After each successful commit, full ledger re-read: count, order, names, statement digest must match |
| Auth boundary | `migrate` requires `--authorize migrate:<project_ref>` distinct from `preflight:` / `inventory:` / `committed-fixtures:` |
| Preflight gate before migrate | `migrate()` re-runs `preflight()` (empty app objects/data/ledger, identity, TLS/PG17, managed schemas, etc.) |
| Evidence sanitization | Tests assert passwords / CA paths / SQL bodies are not written into outcome evidence |
| Direct TLS | Pinned CA hash, TLS ≥1.2, hostname `db.<ref>.supabase.co`, no pooler in direct mode |
| Session continuity | PID bind used for `session-pooler` only; direct mode relies on single live connection (appropriate for dedicated direct endpoint) |

### Can SQL commit without a ledger entry?

**For each migration file under the reviewed executor: No (confirmed for transactional SQL).**

- Migration body and ledger `INSERT` share one explicit transaction.
- Failure before `COMMIT` rolls back both (or stops with unconfirmed rollback → quarantine).
- Successful `COMMIT` applies both together; client-side commit uncertainty still treats the pair as inseparable for that migration.
- Offline scan of frozen artifacts: **no** top-level `COMMIT`/`ROLLBACK`; **no** `CONCURRENTLY` / `VACUUM` / nontransactional index patterns that would escape the outer transaction.

**Residual (potential):** Process kill / network loss **during** `COMMIT` yields ambiguous server state for that **one** migration, but still as SQL+ledger together or neither—not SQL-without-ledger. Prior successfully committed migrations (1..N−1) remain applied; the executor **does not resume**.

**Residual (confirmed by design):** `create schema/table` for `supabase_migrations.schema_migrations` runs **once before** the loop (idempotent `IF NOT EXISTS`). That is ledger infrastructure only, not an application migration row.

**Partial success without resume:** If migrations 1..N commit and N+1 fails, ledger has N rows. Next `migrate` / `preflight` refuses nonempty application ledger → **quarantine**. No automatic repair/resume in this binary.

## 2. Frozen 106 compatibility vs Step 6I environment

Artifacts: `.expo/migration-compatibility-hosted-5u-final/` (ignored scratch; regenerated lineage from seal `a92a550…`).

| Topic | Class | Notes |
|---|---|---|
| PostgreSQL 17 | **Confirmed** (6I) | `postgres_17_match=true` |
| Empty app + ledger 0 | **Confirmed** (6I) | Eligibility precondition |
| `pgcrypto` in `extensions` | **Confirmed** (6I) | Owner allowlist includes `postgres` |
| `postgis` available in catalog | **Confirmed** (6I `available_extensions`) | `create extension … postgis` in `20260928130000_world_missions.sql` |
| `pg_cron` available / preloaded | **Confirmed** (6I) | `cron_preloaded`; catalog jobs empty |
| `clash_scheduler` soft-fail on extension | **Confirmed** (artifact) | Caught `create extension pg_cron`; may succeed without scheduling if unavailable |
| `cron.schedule('clash-maintenance', …)` | **Potential** side effect | If extension works, schedules minute maintenance as `postgres` — managed side effect, not a ledger hole |
| SECURITY DEFINER / RLS / GRANT density | **Potential** | ~90 artifact files reference definer/grants/RLS patterns; correctness is **post-deploy inventory**, not a migrate-block |
| Managed schema interactions | **Potential** | Migrations target `public` / `extensions` / `storage` patterns; 6I allowlists Auth/Storage/Realtime/`pgbouncer` |
| `pgbouncer` contents | **Unresolved** (6H/6I) | Name allowlisted; owner/object inventory not done |
| Hosted role privilege deltas vs local | **Potential** | Stop-on-first-failure + quarantine if GRANT/DDL denied |
| Nontransactional statements | **Confirmed absent** in frozen 106 | Scan clean |
| Altering frozen SQL/hashes | **Not done** | Executor-only audit |

## 3. Deployment recovery (stop-and-quarantine)

| Failure mode | Safest behavior |
|---|---|
| Migration N fails after 1..N−1 succeed | Stop; N rolled back (if rollback confirmed); ledger = N−1; **quarantine**; no retry/resume/reset |
| Connection drop mid-migration | Stop; treat as failed or rollback-unconfirmed; **quarantine**; no reconnect-retry of migrate |
| SQL+ledger prepared but `COMMIT` errors | `"commit outcome unknown"`; **quarantine**; inspect server ledger vs objects before any new authorization |
| Process kill | Assume partial possible; **quarantine**; compare `schema_migrations` count/hashes to objects under new read-only auth |
| Hosted permission differs from local | Fail closed at first denied statement; prior commits remain; **quarantine** |
| Unexpected managed side effect (e.g. cron job) | Stop further automate; inventory under separate auth; do **not** blind-unschedule or repair ledger |
| Ledger verify fails after commit | Stop; state may be consistent N/N; still **quarantine** (no continue) |

**Forbidden in recovery:** automatic retries, destructive resets, down-migrations, blind ledger INSERT/DELETE repair, weakening preflight gates.

**Allowed only under new explicit authorization:** read-only inspection; a **separately reviewed** resume/repair plan (not implemented in this executor).

## 4. Future deployment authorization boundary

Do **not** treat this document or Step 6I as migrate authorization.

### Exact future migrate procedure (when separately authorized)

1. **Target identity:** project `zrutlrhhvfcsmssjiijl` / `clash-staging`; mode `direct`; host `db.zrutlrhhvfcsmssjiijl.supabase.co:5432`; db/user `postgres`/`postgres`.
2. **Executor revision:** pin Git revision of this readiness branch head (or successor that only adds docs if unchanged code). Rebuild `tools/hosted-staging`; record binary SHA-256. Baseline code parent: Step 6H `e85ce3e` migrate path; this audit rebuild hash recorded in evidence (rebuilds are not bit-stable across machines—always re-hash the operator binary).
3. **Pinned CA:** SHA-256 `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
4. **Frozen artifacts:** seal `a92a550527f810913b01f6e6411dc78996c71a06`; Git-blob frozen manifest `a9b30736c87a7fac05c9764404dfd58a876f64db6a3e072e9a348cac8b162b4e`; compatibility manifest `8f50541d3eed55bd905117a217bc8118a6b5483d1ffec2e5d0477b2be71b8c8a`; suite bundle `12cac2a2b0119cb99110061800e14ea167f0928919da4bbd4e464dc0fbead7fe`; **106** migration files verified.
5. **Fresh staging-state verification:** new private evidence dir (NTFS ACL owner/SYSTEM/Administrators); run **`preflight`** with `--authorize preflight:zrutlrhhvfcsmssjiijl` immediately before migrate; require empty ledger and same gates as 6I.
6. **Explicit migrate write auth:** `--mode migrate --authorize migrate:zrutlrhhvfcsmssjiijl` only after written approval naming this target, revision, and artifact hashes.
7. **Bounded execution:** single process; stop-on-first-failure; no second migrate attempt without new authorization if any error/partial ledger.
8. **Sanitized evidence:** `outcome.json` / preflight / process result only—no passwords, SQL bodies, or connection strings.
9. **Post-deploy ledger verification:** expect **106** ledger rows matching artifact versions/names/statement digests; then stop.

### Distinct subsequent authorization

| Operation | Authorization | Notes |
|---|---|---|
| Migration deploy | `migrate:<ref>` | This boundary |
| Security inventory (H1/H2/H3/M1 probes) | `inventory:<ref>` | After successful 106; not implied by migrate |
| Fixture / pgTAP suites | `committed-fixtures:<ref>` + sterile attestation | Destructive potential; separate approval |

## 5. Offline verification (this step)

| Check | Result |
|---|---|
| `go test ./...` | PASS (`ok clash/hosted-staging`) — 60 top-level PASS cases (nested cleanup/subtests included in run) |
| `go vet ./...` | PASS (exit 0) |
| Failure-path regressions | Present: partial fail, commit unknown, ledger mismatch, rollback unconfirmed, wrong DB, redaction, nonempty ledger preflight |
| 106 mock transactions | PASS |
| Artifact integrity | 106/106 `artifact_sha256` match on-disk bytes |
| Compatibility manifest | `8f50541d3eed55bd905117a217bc8118a6b5483d1ffec2e5d0477b2be71b8c8a` |
| Suite manifest | `12cac2a2b0119cb99110061800e14ea167f0928919da4bbd4e464dc0fbead7fe` |
| Frozen 245 Git-blob sources | `frozen().files.length === 245` via `tools/isolated-supabase/prepare.cjs` |
| Seal Git-blob manifest | `git cat-file` of `a92a550:docs/PHASE_11_INTEGRATION_CANDIDATE_MANIFEST.json` → `a9b30736…` |
| Executor code changes | **None** (no safety defect found) |

## Exact unresolved risks

1. **`pgbouncer` schema owner/contents** still unverified beyond name allowlist (6H/6I).
2. **No resume mode** after partial successful apply — intentional quarantine until a future reviewed recovery design.
3. **Commit-outcome unknown** remains an ambiguous single-migration server state requiring human inspection.
4. **Application security** and full SQL suites remain unverified until separately authorized post-deploy inventory/fixtures.
5. **`clash-maintenance` cron** may activate on successful scheduler migration — expected product side effect; confirm under ops review.
6. Working-tree bytes of the integration manifest may differ from Git-blob seal on Windows checkouts; **operators must use Git-blob / compatibility artifacts**, not CRLF working-tree hashes.

## Recommended deployment authorization

Authorize **one** bounded direct IPv6 **`migrate`** of the frozen 106 artifacts to `zrutlrhhvfcsmssjiijl`, using:

- Executor Git revision: **this PR head** (or identical migrate-path tree as `b22f6f7` + 6J docs-only commits)
- Rebuilt operator binary SHA recorded at deploy time
- Fresh preflight evidence immediately prior
- Explicit `migrate:zrutlrhhvfcsmssjiijl`
- Stop-and-quarantine on any failure

Do **not** authorize inventory/fixtures in the same breath unless separately scoped.

## Exact executor revision to use next

| Item | Value |
|---|---|
| Baseline commit (6I) | `b22f6f798f15294c983cfbfa7369a8863c7c0447` |
| Migrate-path lineage | Step 6H `e85ce3e4f62490d98c94b9e032d4f68a97e1485f` (unchanged migrate semantics through 6J) |
| 6J offline rebuild SHA-256 | `4d64c91b3f0231876c740cf225c29623ac694eae7b1b74b5c28cc93bb5a77ecc` (local Temp build; re-hash at deploy) |
| Connection mode | `direct` |
| CA SHA-256 | `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7` |

After this PR merges or is used as the deploy pin, record the **final PR head** as the authoritative revision in the deployment authorization note.

## Evidence

[docs/evidence/phase-11-6j/](evidence/phase-11-6j/)

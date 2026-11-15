# CLASH — Cloud Deployment Package (remediated)

Hosted project: **`kgaqejgubjemdecifzew`** (PostgreSQL 17.11, `ap-southeast-1`)
Source commit: **`9569391e0950956682c522d2d118bc8a711169d2`**

> **Nothing has been deployed.** No cloud SQL writes, no history repair, no
> settings changes, no Docker, no local environment touched. This package is
> prepared, self-testing and awaiting explicit authorization.

---

## 1. What the remediation changed (audit findings F1–F9)

| Finding | Was | Now |
|---|---|---|
| **F1** delayed ledger | 111 migrations applied first, ledger backfilled later — a window where the schema was applied but the ledger was not | Each migration is wrapped in **one transaction** that contains both the migration and its own ledger row (`generated/NNN_<version>.sql`). No window exists. No backfill step exists. |
| **F2** BEGIN/COMMIT in 110/111 | naive `psql -1` plus the file's own `begin;/commit;` would commit early and strand the ledger write | Those two standalone statements are stripped and the fact is recorded per entry as `normalisation: "strip-begin-commit"` (D-2) |
| **F3** file 13 identity | ledger row reused the original's version with a renamed label | The executed identity is recorded: `name = clash_scheduler__cloud_nocron` and `statements[1] = sha256:<hash of the variant's exact text>` (D-1) |
| **F4** Storage | an extra bootstrap script re-created buckets/policies | **Removed.** Migration 4 already creates both (my earlier claim that it skipped hosted was wrong — D-3). `verify/95_storage_config.sql` only verifies. |
| **F5** PowerShell | UTF-8 BOM output, `2>&1` merged streams, unchecked exit codes | BOM-free writes via .NET, stderr to its own file, `$LASTEXITCODE` checked including the null case, receipts written in `try/catch` |
| **F6** fail-open gates | gates returned rows a caller could ignore; name-only checks | Every gate ends with a `DO` block that **RAISEs** on any FAIL (exit non-zero under `ON_ERROR_STOP`); verification compares **per-migration sha256** and **exact RPC signatures** |
| **F7** credentials | connection URL passed as an argument | Connection from `PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD` or `PGPASSFILE`; **no credential in argv**; every log passes through a redactor |
| **F8** unsafe recovery | "just re-run the backfill" | No backfill. The runner proceeds only when the ledger is a **proven prefix** of the manifest — same versions *and* same stored hashes; any gap, mismatch or extra row is a hard stop |
| **F9** no tests | none | `tests/verify-package.mjs`: 58 offline assertions incl. failure injection; plus documented failure-injection procedures requiring a server |

## 2. Layout

```
manifest.json                 111 entries: versions, hashes, normalisation, executed identity
generated/000_ledger_bootstrap.sql   CLI-shaped ledger table (create-only)
generated/NNN_<version>.sql   111 atomic wrappers (migration + ledger row, one transaction)
generated/.gitattributes      pins LF so ledger hashes survive checkout
migrations/…__cloud_nocron.sql  the only substituted step (D-1)
preflight/00_preflight.sql    21 fail-closed gates, read-only
verify/90_verify.sql          19 fail-closed post-conditions incl. identity + RPC signatures
verify/95_storage_config.sql  7 storage configuration checks, read-only
tools/build-package.mjs       regenerates every artefact deterministically
tools/check-manifest.ps1      offline integrity proof
tools/deploy.ps1              sequential runner, stop-on-first-failure, proof-based resume
tools/check-ledger.ps1        read-only ledger audit
tests/verify-package.mjs      offline test suite
checksums.sha256              originals + every package file
```

`supabase/migrations/` is untouched: 111 files, byte-identical to the manifest.

## 3. Ledger semantics

`supabase_migrations.schema_migrations` is keyed by version; the CLI compares
**timestamps only**. Each wrapper writes:

```sql
insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('<version>', '<ledgerName>', array['sha256:<normalizedSha256>'], 'clash-cloud-wrapper-v1')
on conflict (version) do nothing;
```

`statements[1]` is the **sha256 of the exact text executed**, so identity is
verifiable rather than asserted. `90_verify.sql` recomputes nothing from files —
it compares the stored token against the manifest's expected value for all 111
versions and fails closed on any drift.

**Why the wrappers matter for `db push`:** after deployment the ledger contains
all 111 file versions, so `supabase db push` sees nothing pending and cannot
replay the originals — including the original file 13, which would install
pg_cron and schedule `clash-maintenance` every minute.

## 4. Running it

Credentials **never** appear on a command line:

```powershell
$env:PGPASSWORD = '<postgres password>'      # or: $env:PGPASSFILE = 'C:\secure\pgpass'
$env:PGSSLMODE  = 'require'
```

Order, mandatory:

```powershell
node tools/build-package.mjs                 # optional: regenerate artifacts
.\tools\check-manifest.ps1                   # offline: originals + wrappers + checksums
.\tools\deploy.ps1 -PgHost db.<ref>.supabase.co -ConfirmDeployment
.\tools\check-ledger.ps1 -PgHost db.<ref>.supabase.co   # read-only audit, any time
```

`deploy.ps1` performs, in order: preflight gate → ledger proof → 111 wrappers
with per-file receipt and ledger read-back → postflight gate → storage gate.
It runs `generated/000_ledger_bootstrap.sql` as part of the sequence (step 0,
not counted in the 111).

Use the **direct** connection (port 5432), not the pooler: a transaction-mode
pooler can break the multi-statement DDL in this set.

## 5. STOP conditions

Stop, record, do not retry, do not repair, do not "make it pass":

| ID | Condition |
|---|---|
| S1 | `check-manifest.ps1` fails (originals, wrappers or checksums drifted) |
| S2 | Preflight gate raises |
| S3 | Ledger contains a version the manifest does not describe |
| S4 | Ledger identity mismatch, or a gap (a later version present while an earlier one is missing) |
| S5 | Any wrapper exits non-zero (its transaction rolls back; ledger unchanged) |
| S6 | Ledger read-back after a wrapper does not match the expected token |
| S7 | Postflight gate raises |
| S8 | Storage gate raises |
| S9 | Cron tripwire: `pg_cron`, schema `cron`, `cron.schedule()` or any `cron.job` row |
| S10 | Anyone proposes `migration repair --status reverted 20260927030000`, deleting the ledger, or `db push` before `check-ledger.ps1` reports 111/111 |
| S11 | A step would edit `supabase/migrations/`, disable triggers, bypass RLS, set `session_replication_role` or change ownership |

There is **no automatic retry and no automatic recovery**. A re-run is a new
attempt folder, and it is allowed to continue only if the ledger proof in §3
succeeds — never because a previous run "probably worked".

## 6. Evidence

```
evidence/<UTC>Z-attempt-<n>/
  00-baseline/     git sha, migrations-dirty flag, psql version, host/port/user
  01-gates/        preflight out/err, ledger read
  02-migrations/   NNN-<version>.{out,err,readback.out,readback.err,json}
  05-postverify/   verify.out/err, storage.out/err
  STOP.txt         only when a gate or wrapper failed
```

Append-only: retries get `attempt-<n+1>`, and no earlier file is overwritten.
Credentials are redacted before any log is written. `evidence/` is git-ignored,
so archive it separately.

## 7. Not covered here

Auth parity (`jwt_expiry`, confirmations), the Realtime private-channel setting,
Realtime node region (`us-east-1` reported vs `ap-southeast-1` project), the
project clock skew (`created_at` 2026-11-15 vs today), the seeds
(`clash_dev_fixtures`, `local_dev_auth`, `vault_creator_worlds`) and the A50
acceptance run are all separate, unexecuted work.

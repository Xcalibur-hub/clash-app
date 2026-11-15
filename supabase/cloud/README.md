# CLASH — Cloud Deployment Package

Hosted project: **`kgaqejgubjemdecifzew`** (PostgreSQL 17.11, `ap-southeast-1`)
Source commit: **`9569391e0950956682c522d2d118bc8a711169d2`**
Package generated from checkout: `0cd6c36aa4831cda115c293b74ba2bf98c6d22df`

> **Nothing in this package has been executed.** It was prepared read-only and is
> waiting for explicit deployment authorization. Preparation performed no SQL
> writes, no extension enabling, no settings changes and no migration creation.

---

## 1. What is in here

| Path | Purpose |
|---|---|
| `manifest.json` | 111 entries: index, version, original path, sha256, bytes, mode, executed path, transaction flag |
| `checksums.sha256` | sha256 of every original migration **and** every package file — the tamper baseline |
| `migrations/20260927030000_clash_scheduler__cloud_nocron.sql` | the only substituted step (see `DIVERGENCES.md`) |
| `storage/10_storage_bootstrap.sql` | 2 buckets + 5 `storage.objects` policies (migration 4 skips these on hosted) |
| `preflight/00_preflight.sql` | 22 read-only checks; run first |
| `verify/90_verify.sql` | 22 read-only post-conditions including the cron tripwire |
| `rollback/ROLLBACK.md` | tiered recovery; no partial manual repair |
| `tools/check-manifest.ps1` | proves the 111 originals are unmodified |
| `tools/deploy.ps1` | sequential runner, STOP on first failure, no retries |
| `tools/backfill-ledger.ps1` | writes the CLI-shaped migration ledger for the 111 versions |
| `evidence/` | append-only run output (git-ignored) |

The 111 originals under `supabase/migrations/` are **not modified in any way**.
This package only adds files under `supabase/cloud/`.

---

## 2. Ledger and timestamp semantics (why step 5 exists)

Verified from Supabase's CLI reference and behaviour:

- Remote history lives in **`supabase_migrations.schema_migrations`** with columns
  `version`, `name`, `statements` (shape varies by CLI version — the package
  prefers the CLI over hand-written SQL for exactly this reason).
- The CLI compares **timestamps only**. `db push` skips any version already in
  the ledger.
- `supabase migration repair --status applied <version>` **inserts a ledger row
  and never executes the migration SQL**; `--status reverted` **deletes** a row.
- A ledger that is absent or missing versions makes the CLI treat those
  migrations as pending and **replay them**.

Consequence for this project: because the SQL is applied out of band, the ledger
must be backfilled with the **exact 111 file timestamps**. Without it, a future
`supabase db push` would attempt to replay all 111 originals — including the
original file 13, which would install pg_cron and schedule
`clash-maintenance` at `* * * * *`.

Two subtleties that shaped the design:

1. **Do not use the connector/API `create_migration` helper for this set.** It
   assigns a *fresh* timestamp per call, so none of the 111 file versions would
   appear in the ledger and a later `db push` would replay everything.
2. **Version `20260927030000` must be present** even though its text was not run
   (the variant ran instead). That is what stops the replay, and it is recorded
   honestly: `DIVERGENCES.md` D-1, `manifest.json` `mode: "diverged"`, and the
   variant SQL archived in `evidence/<run>/03-divergence/`.
3. **`repair --status applied` copies `name` and `statements` out of the local
   file.** For version `20260927030000` that file is the *original* scheduler,
   whose SQL never ran. Left alone, the ledger would silently claim the original
   executed. `backfill-ledger.ps1` therefore **always** rewrites that row to
   `name = 'clash_scheduler__cloud_nocron'` and `statements = null` (the normal
   backfill shape), and then refuses to report success unless the ledger set
   equals the manifest's 111 versions exactly.

### Interruption during backfill

The database and the ledger are updated by different mechanisms, so an
interrupted backfill is the most dangerous state this package can be in: the
**schema is complete but the ledger is partial**, and a `db push` in that window
would treat the missing versions as pending and replay the originals —
"already exists" failures, and for file 13, pg_cron and an every-minute
`clash-maintenance` job.

Recovery is to re-run `backfill-ledger.ps1`: inserts use
`ON CONFLICT DO NOTHING` and CLI repair skips versions already recorded, so a
partly repaired ledger simply completes. The script's closing parity gate
(`missing` / `unexpected` / count) is the only thing that may be read as
success. **No `db push` until that gate prints `PARITY OK`.**

---

## 3. Prerequisites on the Windows host

- `psql` (client 17 or newer) **or** the Supabase CLI (`npx supabase` is fine).
- The project's database connection string, handled as a secret: pass it via
  `-DbUrl` or an environment variable. **Never** write it into a file in this
  package, into evidence, or into chat.
- No Docker is required for any step in this package.

---

## 4. Execution order — mandatory, do not reorder

```
0. tools/check-manifest.ps1                     (originals unmodified? 111/111)
1. preflight/00_preflight.sql                   (22 checks, all PASS/INFO)
2. tools/deploy.ps1                             (111 steps, index 1..111;
                                                 index 13 = the variant)
3. storage/10_storage_bootstrap.sql             (2 buckets + 5 policies)
4. tools/backfill-ledger.ps1                    (111 ledger versions)
5. verify/90_verify.sql                         (22 checks, all PASS)
6. archive evidence; STOP.
```

Step 2 uses, per file: `psql -X -v ON_ERROR_STOP=1 -1 -f <file>`.
`-1` wraps each file in a single transaction so a failure rolls that file back
completely rather than leaving half a migration behind. Entries carrying
`"transaction": false` in the manifest are the only exception (none at present;
the flag exists for files that would need `create index concurrently`).

Step 4 must run after step 2, because the ledger should describe what actually
executed. Step 5 must run after step 3 (storage policies are part of the schema
being verified).

---

## 5. STOP conditions — strict, first failure, no repairs

On any of these: **stop immediately, record it, do not retry, do not repair, do
not "make it pass".** Write `STOP.txt` into the attempt folder and escalate.

| ID | Condition |
|---|---|
| S1 | `00_preflight.sql` returns any `FAIL` |
| S2 | `supabase_migrations.schema_migrations` exists with rows at baseline |
| S3 | Any migration file exits non-zero (the runner exits; it never continues) |
| S4 | **Cron tripwire:** `pg_cron` installed, schema `cron` present, `cron.schedule()` resolvable, or any `cron.job` row |
| S5 | Any `create policy` reports `already exists` (proves a prior partial apply) |
| S6 | Storage bootstrap raises (including its own "storage schema missing" guard) |
| S7 | Anyone proposes `migration repair --status reverted 20260927030000`, dropping the ledger, or `db push` before parity is 111/111 |
| S8 | A step would require editing/renaming a file under `supabase/migrations/` |
| S9 | `check-manifest.ps1` reports a hash mismatch — the originals changed |
| S10 | `90_verify.sql` returns any `FAIL` after the run |
| S11 | A large file times out (notably `20261002150100_live_arena_schema.sql`, 2 265 lines, index 33) — mark `NOT APPLIED`, reconcile the ledger, stop |
| S12 | Any step would disable triggers, bypass RLS, set `session_replication_role`, change table ownership, or otherwise manufacture a pass |

**No automatic retries.** A retry is a *new* attempt folder (see §6) and needs
explicit authorization. Re-running a non-idempotent file (notably the four
`realtime.messages` policies in indices 83 and 111) fails with "already exists"
and must not be worked around.

---

## 6. Evidence — append-only, never overwritten

```
supabase/cloud/evidence/<UTC>Z-attempt-<n>/
  00-baseline/     git sha, check-manifest output, preflight result set
  01-preexec/      postgis state, cron absence, publication owner, policy_grants
  02-migrations/   per file: NNN-<version>.json receipt
                   (index, version, executed path, sha256, bytes,
                    startedUtc, finishedUtc, exitCode, PASS|FAIL|NOT APPLIED)
                   plus the raw psql log
  03-divergence/   original-13 sha256, variant sha256, both files, DIVERGENCES.md copy
  04-storage/      bootstrap receipt + resulting buckets/policies
  05-postverify/   90_verify.sql result set
  manifest.sha256  hash of every artifact above
```

Rules:

- A retry gets `attempt-<n+1>`; no file in an earlier attempt is ever rewritten.
- `PASS` may only be written where a command exited 0 **and** its post-condition
  was observed. Unrun things are `NOT APPLIED`; unverified things are
  `NOT TESTED`.
- The original file 13 appears in evidence as **`DIVERGED — NOT APPLIED`**, never
  as applied. This is the first such entry by design.
- Secrets (connection string, keys) are never captured; if psql echoes it, redact
  before archiving.

---

## 7. After the run

Deployment `PASS` means: 111/111 steps exited 0, ledger = 111 rows, 22/22 verify
checks PASS, cron tripwire clean. It does **not** mean CLASH works — this is
schema readiness only. Realtime delivery, the 45-message GROUP pagination
fixture and the A50 acceptance remain separate, unrun work.

Known post-deployment items, out of scope here:

- Auth parity (`jwt_expiry 3600`, email confirmations off) is a **project
  setting**, not a migration.
- The `realtime.messages` typing policies are only *consulted* when the project
  uses **private channels**; enabling that is a settings change.
- Realtime reports its node in `us-east-1` while the project is
  `ap-southeast-1` — expect elevated WebSocket latency.
- The project's `created_at` reads `2026-11-15`, later than the current date;
  reconcile timestamps when producing time-ordered evidence.

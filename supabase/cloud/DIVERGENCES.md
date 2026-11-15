# DIVERGENCES — cloud package for `kgaqejgubjemdecifzew`

Source commit: `9569391e0950956682c522d2d118bc8a711169d2`

Three recorded divergences: one substitution (D-1), one mechanical
normalisation (D-2) and one retraction of an earlier claim of mine (D-3).
No file under `supabase/migrations/` is edited, renamed or moved.

---

## D-1 — file 13 `20260927030000_clash_scheduler.sql` is substituted

| Field | Value |
|---|---|
| Original | `supabase/migrations/20260927030000_clash_scheduler.sql` (3 415 bytes) |
| Original sha256 | `manifest.json` → `entries[12].sha256` |
| Original status | **NOT APPLIED** — executed identity recorded as the variant |
| Executed source | `supabase/cloud/migrations/20260927030000_clash_scheduler__cloud_nocron.sql` |
| Executed sha256 | `manifest.json` → `entries[12].normalizedSha256` |
| Ledger `name` | `clash_scheduler__cloud_nocron` |
| Ledger `statements[1]` | `sha256:<hash of the variant text>` — verifies what ran, not what was skipped |

### Why

The original §1 runs `execute 'create extension if not exists pg_cron'` inside an
`exception when others` block, assuming the platform refuses. It does not:

```
supautils.privileged_extensions            → … pg_cron …
supautils.privileged_extensions_superuser  → supabase_admin
```

pg_cron is privileged, so the extension installs, §3's guard passes and
`clash-maintenance` is scheduled `* * * * *` → `public.run_maintenance(500)`
every 60 seconds. Because `run_maintenance` is redefined by eight later
migrations, that job keeps running the newest definition while fixtures and
acceptance tests are in progress.

### Exact comparison

| Original lines | Content | In variant |
|---|---|---|
| 1–28 | header comment | replaced by a cloud-specific header naming the base file |
| 30–36 | §1 pg_cron install | **removed** |
| 38–43 | §2 two REVOKEs | **preserved byte-identically** (verified by test) |
| 45–67 | §3 schedule block | **removed** |

Added: a fail-closed guard that raises if `cron.schedule` or schema `cron`
already exists, and a post-condition re-asserting pg_cron is still absent.
Nothing else is lost: both REVOKE targets are created in file 6, and the same
revokes are re-asserted by eight later migrations. No pgTAP test asserts the job.

### Ledger honesty

Recording the version is what prevents `db push` from replaying the original.
That is not a false claim *because* the ledger simultaneously records the
variant as the executed identity (`name` + sha256 of the executed text), the
variant's bytes are committed, and `90_verify.sql` check 6 fails closed unless
the name is exactly `clash_scheduler__cloud_nocron`. An earlier package version
stored `statements = null` here; the audit correctly rejected that as
indistinguishable from "the original ran", and it has been replaced by the
sha256 token above.

---

## D-2 — two migrations are normalised before wrapping (F2)

| Version | File | Own `begin;` | Own `commit;` |
|---|---|---|---|
| `20261023130000` | `meet_rpc_permission_hardening.sql` | line 4 | line 31 |
| `20261023140000` | `meet_private_typing.sql` | line 3 | line 87 |

Each wrapper must own exactly one transaction so the ledger insert commits with
the migration. A file that opens and closes its own transaction would commit
early and leave the ledger write outside it.

**Transformation:** standalone lines matching `^\s*(begin|commit)\s*;\s*$` are
removed. Nothing else is touched — comments, `notify pgrst,'reload schema'`,
and every DDL statement are preserved in order. The wrapper supplies `begin;`
and `commit;`.

**Recorded, not hidden:** `manifest.json` marks both entries
`normalisation: "strip-begin-commit"`, and their ledger identity token is the
sha256 of the *normalised* text (what actually executed). The originals remain
byte-identical on disk and are verified by `check-manifest.ps1`.

`tests/verify-package.mjs` asserts that exactly these two needed normalisation
and that their wrappers contain no second top-level `begin;`.

---

## D-3 — correction: migration 4 DOES create the Storage buckets and policies

My earlier package claimed migration 4 skips its Storage section on hosted
projects, and shipped a `10_storage_bootstrap.sql` to compensate. **That was
wrong**, and the Codex audit was right.

The actual guard in `20260926150000_media_storage.sql` is:

```sql
if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
  raise notice '… skipping bucket+policy bootstrap (local reset; restored by seed/config)';
  return;
end if;

insert into storage.buckets … on conflict (id) do nothing;
create policy "media objects are publicly readable" …   -- and four more
```

It returns early only when the Storage tables are **missing** (a local-reset
race). On hosted Supabase the tables always exist, so migration 4 creates both
buckets and all five policies.

**Remediation (F4):** `storage/10_storage_bootstrap.sql` is **deleted**. The
package now performs **no Storage writes of its own** — asserted by the test
suite over every hand-written SQL file. Configuration is verified instead, in
`verify/95_storage_config.sql` (bucket count, public flags, 100 MB limit, 8-entry
MIME allowlist, five named `storage.objects` policies).

---

## D-4 — Runner outcomes are classified, not narrated (Round 2)

Not a migration divergence: a change in what the package is allowed to *claim*.

The v2 runner printed "Wrapper transaction rolled back; ledger unchanged" for
every nonzero exit. A nonzero exit does not establish rollback — the error can
arrive after `COMMIT`, and a lost connection can leave the commit outcome
unknown. The runner now reads the ledger back and reports one of:

| Outcome | Evidence required |
|---|---|
| `COMMITTED` | exit 0 **and** the stored token equals `sha256:<normalizedSha256>` |
| `ROLLED_BACK_PROVEN` | nonzero exit **and** a successful probe finds no row for that version (the insert shares the wrapper transaction) |
| `COMMITTED_WITH_ERROR` | nonzero exit **and** the row is present with the expected token |
| `LEDGER_MISMATCH` | a row exists with an identity the manifest does not describe |
| `UNKNOWN` | probe failed, timeout, launch failure or no exit code |

`UNKNOWN` is a terminal state, not a retry prompt: the schema is treated as
unknown and the operator escalates.

## D-5 — Native process handling, sanitisation, exclusive evidence (Round 2)

The v2 runner used `& $Psql @Arguments 2>$errFile` under
`$ErrorActionPreference='Stop'`. On Windows PowerShell 5.1 that raises
`NativeCommandError` before `$LASTEXITCODE` is captured, so neither the exit code
nor the logs could be trusted. It also wrote raw stderr to the evidence path and
redacted it afterwards, and used `File.WriteAllText`, which overwrites.

Now: one adapter (`tools/lib/clash-native.ps1`) starts every child through
`System.Diagnostics.Process` with `UseShellExecute = $false`, drains both streams
asynchronously into memory, and reads `Process.ExitCode`. Text is sanitised
before it is encoded, every artefact is created with `FileMode::CreateNew`, and
receipts are hash-chained and sealed. `deploy.ps1` also refuses to run without a
PASS adapter self-test receipt bound to the adapter's sha256, because the adapter's
runtime behaviour cannot be proven by static analysis.

Connection policy (D-5b): `-ProjectRef` is mandatory and the host must belong to
it (`db.<ref>.supabase.co:5432`, or `aws-…pooler.supabase.com:6543` with user
`postgres.<ref>`); `PGSSLMODE` is forced to `verify-full`, a CA certificate is
mandatory, and `PGHOSTADDR`/`PGSERVICE`/`PGOPTIONS` are refused because each can
redirect the connection behind the approved host name.

---

## D-6 - The NativeCommandError defect is a tested regression (Round 3)

The package used to invoke psql through the PowerShell engine:

    $out = & $Psql @Arguments 2>$errFile
    $code = $LASTEXITCODE

Under `$ErrorActionPreference = 'Stop'`, PowerShell 5.1 raises `NativeCommandError`
for native stderr output *before* the exit code is captured, so the runner could
neither report the failure nor write a truthful receipt.

This is no longer merely described. `tools/test-native-capture.ps1` executes that
construct inside try/catch and asserts (a) that it raises on the runtime, (b) that
the exit code is lost as a result, (c) that the adapter does not raise on the same
child and captures exit code, stdout and stderr, and (d) the differential between
the two. `deploy.ps1` and `check-ledger.ps1` refuse to run without a PASS receipt
that contains those cases, bound to the adapter's sha256.

Receipts are also guaranteed to try to exist: the run directory first, then
`%TEMP%\clash-evidence-fallback`, then console only - always announced with the
path that was actually used.

---

## D-7 - A self-test case can no longer be lost (Round 4)

`Add-Case 'legacyPatternLosesExitCode' (...) @legacyDetail` splatted a hashtable,
so `-Detail` was never bound, `$Detail.Keys` raised `PropertyNotFoundStrict` under
strict mode 2.0, and - because the statement ran under
`$ErrorActionPreference = 'Continue'` - the case vanished while the verdict
remained PASS and the script exited 0. Fourteen PASS lines, one of them missing,
and no failure.

The harness now treats a lost case as a failure by construction: strict mode
policy, a trap that emits an EXCEPTION receipt and exits 1, a shared 18-case
inventory that both the harness and the receipt validator enforce, an
executed-count comparison before the verdict, guards in `Add-Case` for null
detail / duplicate / unknown names, validation of the receipt before it is
written, and a post-write re-read that must agree with the run.

The receipt contract changed, so the adapter version is now `4.0.0`: receipts
produced by earlier versions are rejected rather than reinterpreted.

---

## D-8 - The self-test inventory is flat and validated (Round 5)

`Get-ClashSelfTestInventory` returned `,@($script:ClashSelfTestRequiredCases)`.
The unary comma produces a one-element wrapper, and a caller capturing the value
twice (a second `@()`, a parameter binding, a JSON round-trip) can end up with a
nested array: one inventory item instead of 18, every case name rejected, and a
serialization failure further on.

It now returns an explicitly built flat `string[]`. `Assert-SelfTestInventory`
rejects nesting, dictionaries, nulls, blanks, duplicates, unknown names, and any
count other than 18; the harness runs it before starting any child process, and
`Test-SelfTestReceipt` runs it on both the declared inventory and the receipt's
case names. Receipt serialization is wrapped, so a failure produces a minimal
FAIL document and exit 1 instead of an unexplained exception.

---

## D-9 - Paths are derived with fileURLToPath, not URL.pathname (Round 6)

`new URL('..', import.meta.url).pathname` is a URL path, not a filesystem path: on
Windows it keeps the leading slash, the drive letter and percent-encoding
(`/C:/Users/.../clash%20cloud/`). Joining anything onto it produced
`C:\C:\Users\...\manifest.json` and ENOENT, so the offline suite failed before
its first assertion and the builder could not read the migrations.

`tests/paths.mjs` now converts with `fileURLToPath()` and resolves from there;
both consumers use it. A bootstrap failure prints `CLASH-TEST-BOOTSTRAP-FAILED`
and exits 1 before any assertion can run, and the suite fails if fewer than its 17
sections executed, so neither a broken bootstrap nor a truncated run can produce a
PASS summary.

---

## D-9a - Path validation is platform-explicit (Round 7)

Two assertions added in Round 6 passed on Linux and failed on Windows, because
they applied POSIX rules to a Windows filesystem: `posix.dirname()` of a
drive-letter path is `'.'`, and forbidding backslashes rejects every valid Windows
path.

`tests/paths.mjs` now exposes `pathArtefacts(path, { windows })`, which requires an
absolute path in the platform's own form - drive letter or UNC on Windows,
leading `/` on POSIX - and rejects percent-encoding, foreign separators, doubled
drive letters and a drive letter left on a POSIX path. The live comparison uses the
platform `dirname`. Both rules are asserted for both platforms from either
platform, so the suite is not silently host-dependent again.

---

## D-10 - The ledger insert aborts on conflict (Round 8)

Every wrapper previously ended its ledger insert with `on conflict (version) do
nothing`. A conflicting row therefore skipped the insert while the migration body
still executed, and the read-back that follows compares the stored token with the
expected one - so a re-executed body could produce a matching row and a PASS.

The insert now has no conflict clause: a duplicate version raises
`unique_violation`, the whole wrapper transaction aborts, and no statement of that
migration survives. Combined with the fresh-only gate this makes a second
application of the same version impossible rather than merely unlikely.

## D-11 - Fresh-only deployment, exclusive writer, no resume (Round 8)

`deploy.ps1` initialises an empty project and refuses a non-empty ledger. There is
no resume, no start index, no backfill and no retry; the resume that the earlier
documentation described could never run, because the fresh-baseline preflight
rejects any project that already has application objects.

Before the first wrapper the runner inserts one row into
`supabase_migrations.clash_deploy_claim` (primary key `claim_key`). A concurrent
runner collides and stops before executing anything. The row is removed only after
postflight passes, so an abandoned run leaves a claim that blocks the next run
until a human reads the evidence and clears it (ROLLBACK.md T1.1).

---

## No other divergences

| Pattern | Files | Executable? |
|---|---|---|
| `create extension` | `20260928130000` (postgis — already installed), `20260930110000` + `20261004120000` (pgcrypto, trusted), `20260927030000` (pg_cron) | pg_cron excluded by D-1; the rest no-op |
| `cron.schedule` / `cron.unschedule` / `cron.job` | `20260927030000` only | excluded by D-1 |
| `pg_cron` mentions elsewhere | `20260926170000:366-367`, `20260928020000:13`, `20260928040000:11`, `20261002150100:2261`, `20261022120000:22,208` | all inside `--` comments |
| `alter table realtime.*` / `storage.*` | none | — |
| `alter system` / `create role` / `create database` | none | — |
| `CONCURRENTLY` | none | every wrapper is safely transactional |

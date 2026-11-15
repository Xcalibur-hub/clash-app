# CLASH — Cloud Deployment Package (Round 2 corrections)

Hosted project: **`kgaqejgubjemdecifzew`** (PostgreSQL 17.11, `ap-southeast-1`)
Source commit: **`9569391e0950956682c522d2d118bc8a711169d2`**

> **Nothing has been deployed.** No cloud SQL writes, no history repair, no
> settings changes, no Docker, no local environment touched. This package is
> prepared, self-tested offline, and awaiting explicit authorization.
>
> **The PowerShell layer has never been executed on Windows from this
> environment** (no `pwsh`, no `psql` in the authoring sandbox). Round 2 of the
> independent audit parsed all four scripts with the Windows PowerShell 5.1
> parser (0 errors) and found the runner's *native-process* handling unsafe. That
> is corrected here, and the package now refuses to touch a database until the
> adapter has been certified on the target machine (§4.1).

---

## 1. Round 1 remediation (audit findings F1–F9)

| Finding | Was | Now |
|---|---|---|
| **F1** delayed ledger | 111 migrations applied first, ledger backfilled later — a window where the schema was applied but the ledger was not | Each migration is wrapped in **one transaction** that contains both the migration and its own ledger row (`generated/NNN_<version>.sql`). No window exists. No backfill step exists. |
| **F2** BEGIN/COMMIT in 110/111 | naive `psql -1` plus the file's own `begin;/commit;` would commit early and strand the ledger write | Those two standalone statements are stripped and recorded per entry as `normalisation: "strip-begin-commit"` (D-2) |
| **F3** file 13 identity | ledger row reused the original's version with a renamed label | The executed identity is recorded: `name = clash_scheduler__cloud_nocron` and `statements[1] = sha256:<hash of the variant's exact text>` (D-1) |
| **F4** Storage | an extra bootstrap script re-created buckets/policies | **Removed.** Migration 4 already creates both (the earlier claim that it skipped hosted was wrong — D-3). `verify/95_storage_config.sql` only verifies. |
| **F5** PowerShell | UTF-8 BOM output, `2>&1` merged streams, unchecked exit codes | Superseded by §1b: no PowerShell-native invocation remains at all |
| **F6** fail-open gates | gates returned rows a caller could ignore; name-only checks | Every gate ends with a `DO` block that **RAISEs** on any FAIL (exit non-zero under `ON_ERROR_STOP`); verification compares **per-migration sha256** and **exact RPC signatures** |
| **F7** credentials | connection URL passed as an argument | No credential in argv; connection comes from the child environment; every artefact passes a redactor before it is created (§1b) |
| **F8** unsafe recovery | "just re-run the backfill" | No backfill. The runner proceeds only when the ledger is a **proven prefix** of the manifest — same versions *and* same stored hashes; any gap, mismatch or extra row is a hard stop |
| **F9** no tests | none | `tests/verify-package.mjs`: **241 offline assertions** incl. failure injection, a PowerShell lexer and function/parameter resolution (§1b) |

## 1b. Round 2 corrections (independent re-audit of `68246b5`)

The Round 2 audit stopped at a critical finding and left the wrapper, SQL and
test layers unvalidated. Its source findings are addressed here.

| Round 2 finding | Correction | Where |
|---|---|---|
| **F2 critical** — `$ErrorActionPreference='Stop'` plus `& $Psql @Arguments 2>$errFile` raised `NativeCommandError` *before* the exit code was captured; logs could stay empty | A single adapter starts every child through `System.Diagnostics.Process` (`UseShellExecute=$false`), drains stdout/stderr asynchronously **into memory**, and reads `Process.ExitCode`. No `&`, no `2>`, no `$LASTEXITCODE`, no dependence on the error-action preference. stderr is data: a `NOTICE` never decides failure | `tools/lib/clash-native.ps1` |
| **F2** — adapter verified only by static reasoning | `tools/test-native-capture.ps1` proves the adapter on the target PowerShell 5.1 with harmless stderr-producing children (exit 0, exit 17, silent, launch failure, timeout, credential refusal, sanitiser, non-overwriting writer) and records the failed legacy construct as an informational control. **`deploy.ps1` refuses to run without a PASS receipt bound to the adapter's sha256** | `tools/test-native-capture.ps1`, `Assert-AdapterSelfTest` |
| **F4** — "Wrapper transaction rolled back; ledger unchanged" asserted for *every* nonzero exit | Outcomes are classified from evidence, never narrated: `COMMITTED`, `ROLLED_BACK_PROVEN` (only when a read-only probe proves the row absent), `COMMITTED_WITH_ERROR` (row present with the expected token ⇒ the error came after commit), `LEDGER_MISMATCH`, `UNKNOWN` (probe failed / timeout / no exit code) | `deploy.ps1` gate 4 |
| **F5** — `$actualSha` computed and never compared before execution | `manifest.json` now carries `wrapperSha256` per entry. The runner compares the bytes on disk with it **immediately before** spawning psql, cross-checks the same value against `checksums.sha256`, and verifies **all 238 files** plus the 111 originals and executed sources before the first database write | `build-package.mjs`, `deploy.ps1` gates 1 and 4 |
| **F7** — raw stderr written to the final evidence path, then rewritten redacted; `WriteAllText` overwrites; `Write-Stop` printed an unsanitised reason | Output never reaches disk raw: `Write-Evidence` sanitises **then** encodes, and creates every file with `FileMode::CreateNew` (an existing path is an error, never an overwrite). STOP stores and prints the same sanitised string. Receipts are hash-chained (`prevReceiptSha`) and the run is sealed (`EVIDENCE-MANIFEST.json`) | `clash-native.ps1`, `deploy.ps1` |
| **F7** — arbitrary host/port accepted, any `PGSSLMODE` retained, `require` default | `-ProjectRef` is mandatory; the host must be `db.<ref>.supabase.co` (port 5432) or `aws-…pooler.supabase.com` (port 6543, user `postgres.<ref>`); `PGSSLMODE` is forced to **verify-full** and a **CA certificate is mandatory**; `PGHOSTADDR`/`PGSERVICE`/`PGOPTIONS` are refused because they can redirect the connection behind the approved name | `Resolve-ExecutionPolicy` |
| **Round 2** — 0 of 67 package tests observed; wrappers/SQL unvalidated | The suite is now 241 assertions, including a real PowerShell lexer (comments/here-strings/strings removed, then bracket balance) and two-direction fixtures proving the lexer distinguishes prose from code. **Still offline only** — it proves the package, not the hosted database | `tests/verify-package.mjs` |

### 1c. Round 3 (audit of `68246b5`) - the regression, executed

The Round 3 report's findings were structural and are covered by §1b. What it also
required, and what §1b did not provide, is a **Windows PowerShell 5.1 regression
test for the actual `NativeCommandError` failure** rather than static checks.

`tools/test-native-capture.ps1` now executes the failing construct and asserts it:

| Case | Assertion |
|---|---|
| `legacyPatternRaisesNativeCommandError` | `$ErrorActionPreference='Stop'` + `& $cmd /c '...' 2>$file` **does** raise on this runtime (the defect reproduces) |
| `legacyPatternLosesExitCode` | the raised exception prevents `$LASTEXITCODE` from holding `5` - the exit code is lost, which is the harm |
| `adapterSurvivesSameChild` | the adapter, same child, same policy: no exception, exit code `5`, stdout and stderr both captured |
| `differentialProven` | legacy threw **and** adapter did not, on the same runtime and the same child |

`Assert-AdapterSelfTest` requires all four, so `deploy.ps1` cannot start a
database session on a host where the regression has not been demonstrated. If the
defect does not reproduce, the gate **fails closed** rather than assuming the
harness is fine.

Receipt guarantees (F7) were also strengthened: `Write-EvidenceOrFallback` tries
the run directory, then a per-machine directory under `%TEMP%`, and always prints
a `TERMINAL RECEIPT` line. A receipt that could not be written is now announced
instead of being swallowed, so "no receipt" cannot be misread as "nothing
happened". `tools/run-tests.ps1` requires the suite's own machine-readable
`CLASH-TEST-SUMMARY {passed,failed,total}` line to agree with the PASS/FAIL lines
it actually printed - a truncated run cannot be read as a pass.

### 1d. Round 4 (audit of `a88cc26`) - self-test integrity

The report found `tools/test-native-capture.ps1:261` passing a hashtable by
splatting (`@legacyDetail`). Splatting binds **keys** as parameter names, so
`-Detail` stayed unbound, `$Detail.Keys` raised `PropertyNotFoundStrict` under
`Set-StrictMode 2.0`, and because that line ran under
`$ErrorActionPreference = 'Continue'` the case was silently dropped while the
verdict stayed PASS.

The line is fixed (`-Detail $legacyDetail`), and the whole class is closed:

| Control | Effect |
|---|---|
| `-Detail $legacyDetail` explicitly, twice | the Round 4 construct is gone; a detector forbids any `@name` splatting in the package |
| `$ErrorActionPreference = 'Stop'` at the top | an unexpected error can no longer skip a case and continue |
| script-scope `trap` | writes an `EXCEPTION` receipt through the fallback writer and exits 1 |
| shared inventory (`$script:ClashSelfTestRequiredCases`, 18 cases) | harness, receipt and gate agree on one list |
| `Add-Case` guards | rejects a null/invalid detail, a duplicate name, or a name outside the inventory; each is a recorded problem |
| executed-count check | `casesExecuted` must equal the inventory **before** the verdict |
| validate-then-write | the receipt is validated *before* it is written, so a rejected run cannot leave a PASS artefact for `deploy.ps1` to accept |
| on-disk re-check | the file is re-read and must match the run |
| four integrity cases | deliberate exception, dropped case, null detail, tampered receipt - each proven not to produce PASS |

`Assert-AdapterSelfTest` now delegates to `Test-SelfTestReceipt`, one shared
implementation used by `deploy.ps1`, `check-ledger.ps1` **and** the harness. It
rejects a receipt that is failed, incomplete (missing case, wrong `casesExecuted`,
count disagreement), contradictory (FAIL verdict, non-empty `problems`) or bound
to another adapter. The adapter version moved to `4.0.0`, so every receipt issued
before this correction is rejected by version.

### 1e. Round 5 (audit of `3f2e816`) - flat inventory

`tools/lib/clash-native.ps1` returned the inventory as `return ,@(...)`. The unary
comma emits a one-element wrapper whose element is the array, so a caller that
captures the result a second time can hold a nested array: the harness sees one
inventory item instead of 18, rejects every legitimate case name, and can fail
while serialising.

| Correction | Detail |
|---|---|
| flat return | the getter builds a `List[string]` and returns `.ToArray()`; no unary comma anywhere, and a detector forbids `return ,@` in code |
| one inventory | `Assert-SelfTestInventory` is called by the harness, by `Test-SelfTestReceipt` on the **declared** list, and on the **receipt's** names |
| asserted before children | the harness validates exactly 18 unique, non-empty strings *before* spawning any process; failure writes a FAIL receipt and exits 1 |
| shape rejection | nested arrays, dictionaries, nulls, blanks, duplicates, unexpected names, short/extra inventories |
| serialization | the receipt's `ConvertTo-Json`/`ConvertFrom-Json` round-trip is wrapped; a failure downgrades to a minimal FAIL document rather than escaping as a stack trace |

Still unproven, and stated as such: the four scripts have **never run**, the SQL
gates have **never run against the hosted database**, and the ledger/CLI
interoperability is **documented, not executed**.

## 2. Layout

```
manifest.json                  111 entries: version, hashes, normalisation, executed identity, wrapperSha256
generated/000_ledger_bootstrap.sql  CLI-shaped ledger table (create-only)
generated/NNN_<version>.sql    111 atomic wrappers (migration + ledger row, one transaction)
generated/.gitattributes       pins LF so ledger hashes survive checkout
migrations/…__cloud_nocron.sql the only substituted step (D-1)
preflight/00_preflight.sql     21 fail-closed gates, read-only
verify/90_verify.sql           19 fail-closed post-conditions incl. identity + RPC signatures
verify/95_storage_config.sql   storage configuration checks, read-only
tools/lib/clash-native.ps1     native-process adapter, sanitiser, exclusive evidence writer,
                               connection policy, adapter self-test validation
tools/test-native-capture.ps1  certifies the adapter on this machine (must pass first)
tools/run-tests.ps1            runs the offline suite through the adapter (never '& node');
                               requires the suite's summary line to match its own counts
tools/build-package.mjs        regenerates every artefact deterministically
tools/check-manifest.ps1       offline integrity proof (originals, wrappers, checksums, git)
tools/check-ledger.ps1         READ-ONLY ledger audit (SELECT only)
tools/deploy.ps1               sequential runner, stop-on-first-failure, proof-based resume
tests/verify-package.mjs       offline test suite (241 assertions)
checksums.sha256               238 files: originals + every package file
evidence/                      run artefacts (git-ignored, append-only)
evidence-adapter/              adapter self-test receipts (git-ignored, append-only)
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
verifiable rather than asserted. `90_verify.sql` compares the stored token
against the manifest's expected value for all 111 versions and fails closed on
any drift.

**Why the wrappers matter for `db push`:** after deployment the ledger contains
all 111 file versions, so `supabase db push` sees nothing pending and cannot
replay the originals — including the original file 13, which would install
pg_cron and schedule `clash-maintenance` every minute.

## 4. Running it

Credentials **never** appear on a command line. Set them in the environment:

```powershell
$env:PGPASSWORD = '<postgres password>'      # or: $env:PGPASSFILE = 'C:\secure\pgpass'
```

Do **not** set `PGSSLMODE`: the runner forces `verify-full` and records the value
it overrode. Download the Supabase CA (`prod-ca-2021.crt`) and pass its path.

### 4.1 Order, mandatory

```powershell
node tools/build-package.mjs                  # only if you intend to regenerate
.\tools\run-tests.ps1                         # offline suite, through the adapter
.\tools\check-manifest.ps1                    # offline: originals, wrappers, checksums, git
.\tools\test-native-capture.ps1               # ONCE per machine: certifies the adapter
.\tools\check-ledger.ps1  -ProjectRef <ref> -CaCert C:\certs\prod-ca-2021.crt `
                          -AdapterSelfTestReceipt .\evidence-adapter\<stamp>-adapter-selftest.json
.\tools\deploy.ps1        -ProjectRef <ref> -CaCert C:\certs\prod-ca-2021.crt `
                          -AdapterSelfTestReceipt .\evidence-adapter\<stamp>-adapter-selftest.json `
                          -ConfirmDeployment
```

`deploy.ps1` performs, in order:

```
gate 0  connection policy + adapter self-test receipt + baseline record
gate 1  full package integrity — 238 checksum files, 111 originals, executed
        sources and wrapper digests — BEFORE any database connection
gate 2  preflight SQL (fail-closed DO block)
gate 3  ledger prefix proof (read-only)
gate 3b step 0: if the ledger table is absent the runner creates it from
        generated/000_ledger_bootstrap.sql (digest checked first), then proves
        the table exists and is empty; if the table is present it is skipped
gate 4  111 wrappers: digest compared → execute → ledger read-back → classify
gate 5  postflight verification + storage verification
        seal EVIDENCE-MANIFEST.json, print the terminal receipt
```

Step 0 is create-only and is **not** counted in the 111. The operator does not
run it by hand: leaving it to a human was one of the unvalidated steps Round 2
named, so the runner owns it and records its digest and read-back.

Prefer the **direct** connection (port 5432): a transaction-mode pooler can break
the multi-statement DDL in this set. If the direct host does not resolve from the
deployment host (a project without the IPv4 add-on resolves `db.<ref>.supabase.co`
to IPv6 only), the package accepts the session pooler instead -
`aws-<n>-<region>.pooler.supabase.com:6543` with user `postgres.<ref>` - and
nothing else. A HostNotFound or an IPv6 route failure is a network problem, not a
package problem: fix connectivity rather than loosening the policy.

Note for auditors: `node tests/verify-package.mjs` is itself a native child
process. Run it from `cmd.exe`, or use `tools\run-tests.ps1`, which is what the
adapter exists for. Invoking `node` from a PowerShell script that sets
`$ErrorActionPreference = 'Stop'` reproduces exactly the Round 2 critical failure
and can report "0 assertions" for a suite that is not at fault.

## 5. STOP conditions

Stop, record, do not retry, do not repair, do not "make it pass":

| ID | Condition |
|---|---|
| S1 | `check-manifest.ps1` fails (originals, wrappers or checksums drifted) |
| S2 | Preflight gate raises, or its report shows a FAIL row |
| S3 | Ledger contains a version the manifest does not describe |
| S4 | Ledger identity mismatch, or a gap (a later version present while an earlier one is missing) |
| S5 | Any wrapper exits non-zero, or times out, or cannot be launched. **The outcome is classified, not assumed** — see §5.1. Never continue to the next wrapper |
| S6 | Ledger read-back after a wrapper does not equal the expected token |
| S7 | Postflight gate raises, or its report shows a FAIL row |
| S8 | Storage gate raises |
| S9 | Package integrity failure (digest drift, missing file, dirty `supabase/migrations`) |
| S10 | Anyone proposes `migration repair --status reverted 20260927030000`, deleting the ledger, or `db push` before `check-ledger.ps1` reports 111/111 |
| S11 | A step would edit `supabase/migrations/`, disable triggers, bypass RLS, set `session_replication_role` or change ownership |
| S12 | No adapter self-test receipt, or one that fails validation: failed verdict, non-empty problems, missing/incomplete/duplicated cases, `casesExecuted` disagreement, different adapter hash or version, non-PowerShell-5.1, or missing the executed `NativeCommandError` regression cases |
| S13 | A wrapper's digest on disk differs from the manifest at execution time |
| S14 | Connection policy violated (host not belonging to the project, wrong port/user for the mode, `PGSSLMODE` forced, CA certificate missing, `PGHOSTADDR`/`PGSERVICE`/`PGOPTIONS` set) |

There is **no automatic retry and no automatic recovery**. A re-run is a new
attempt folder, and it is allowed to continue only if the ledger proof in §3
succeeds — never because a previous run "probably worked".

### 5.1 Outcome taxonomy (replaces "rolled back")

A nonzero exit does **not** establish that the transaction rolled back — the
error may have arrived after `COMMIT`, or the connection may have died. The
runner asks the ledger and reports what it can prove:

| Outcome | Meaning | Operator action |
|---|---|---|
| `COMMITTED` | exit 0 **and** the ledger row carries the expected token | continue |
| `ROLLED_BACK_PROVEN` | exit non-zero and the read-only probe shows the version **absent**; the insert shares the wrapper transaction, so it did not commit | fix the cause, then re-run from that index (allowed: the ledger is a proven prefix) |
| `COMMITTED_WITH_ERROR` | exit non-zero but the row **is** present with the expected token — the wrapper committed and the error came afterwards | **do not re-run**; investigate, then continue from the next index |
| `LEDGER_MISMATCH` | a row exists whose identity the manifest does not describe | human decision, S4 |
| `UNKNOWN` | probe failed, timeout, or no exit code — neither success nor rollback is established | treat the schema as **unknown**; `check-ledger.ps1` is read-only and safe; escalate |

## 6. Evidence

```
evidence/<UTC>Z-attempt-<n>/
  00-baseline.json            git sha, migrations-dirty flag, psql version, connection policy
  01-integrity.json           files verified, package tree hash, problems
  02-preflight.json           exit code, duration, PASS/FAIL row counts, sanitised excerpt
  01-gates/preflight.{out,err}
  03-ledger.json              ledger rows, resume index, proof statement
  02-ledger/ledger.{out,err}
  0NN-<version>-applied.json  per-wrapper receipt: digest, exit code, outcome, read-back
  03-migrations/NNN-<version>.{out,err,readback.out,readback.err,json}
  03b-bootstrap.json          step 0: digest, rows after create, or SKIPPED
  02-ledger/{bootstrap,bootstrap-recheck}.{out,err}
  04-postflight.json / 05-storage.json / 06-complete.json
  04-postflight/{verify,storage}.{out,err}
  STOP.json, STOP.txt         only when a gate or wrapper failed
  99-runner-exception.json    only when an unhandled exception escaped a phase
  EVIDENCE-MANIFEST.json      seal: per-file sha256 + hash chain head
```

Every artefact is created with `FileMode::CreateNew`: an existing path is an
error, so nothing is ever overwritten and a retry cannot erase its predecessor.
Text is sanitised **before** it is encoded, so credentials never reach the disk
even transiently. Receipts chain by `prevReceiptSha`; a deleted or reordered
receipt breaks the chain. `evidence/` and `evidence-adapter/` are git-ignored —
archive them separately.

## 7. Not covered here

Auth parity (`jwt_expiry`, confirmations), the Realtime private-channel setting,
Realtime node region (`us-east-1` reported vs `ap-southeast-1` project), the
project clock skew (`created_at` 2026-11-15 vs today), the seeds
(`clash_dev_fixtures`, `local_dev_auth`, `vault_creator_worlds`) and the A50
acceptance run are all separate, unexecuted work.

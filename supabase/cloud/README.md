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
| **F8** unsafe recovery | "just re-run the backfill" | No backfill, no retry, **no resume** (Round 8). The runner is fresh-only: it requires an empty ledger and stops on a gap, a mismatch, an extra row, a malformed row or any recorded version at all |
| **F9** no tests | none | `tests/verify-package.mjs`: **456 offline assertions** incl. failure injection, a PowerShell lexer and function/parameter resolution (§1b) |

## 1b. Round 2 corrections (independent re-audit of `68246b5`)

The Round 2 audit stopped at a critical finding and left the wrapper, SQL and
test layers unvalidated. Its source findings are addressed here.

| Round 2 finding | Correction | Where |
|---|---|---|
| **F2 critical** — `$ErrorActionPreference='Stop'` plus `& $Psql @Arguments 2>$errFile` raised `NativeCommandError` *before* the exit code was captured; logs could stay empty | A single adapter starts every child through `System.Diagnostics.Process` (`UseShellExecute=$false`), drains stdout/stderr asynchronously **into memory**, and reads `Process.ExitCode`. No `&`, no `2>`, no `$LASTEXITCODE`, no dependence on the error-action preference. stderr is data: a `NOTICE` never decides failure | `tools/lib/clash-native.ps1` |
| **F2** — adapter verified only by static reasoning | `tools/test-native-capture.ps1` proves the adapter on the target PowerShell 5.1 with harmless stderr-producing children (exit 0, exit 17, silent, launch failure, timeout, credential refusal, sanitiser, non-overwriting writer) and records the failed legacy construct as an informational control. **`deploy.ps1` refuses to run without a PASS receipt bound to the adapter's sha256** | `tools/test-native-capture.ps1`, `Assert-AdapterSelfTest` |
| **F4** — "Wrapper transaction rolled back; ledger unchanged" asserted for *every* nonzero exit | Outcomes are classified from evidence, never narrated: `COMMITTED` (row present with the expected token), `ROLLED_BACK_PROVEN` (Round 8: psql exit 3 **and** a fresh read-back showing the row absent), `LEDGER_MISMATCH`, `UNKNOWN` (connection loss, timeout, incomplete capture, unreadable probe) | `deploy.ps1` gate 4, `Test-RollbackProvable` |
| **F5** — `$actualSha` computed and never compared before execution | `manifest.json` now carries `wrapperSha256` per entry. The runner compares the bytes on disk with it **immediately before** spawning psql, cross-checks the same value against `checksums.sha256`, and verifies **all 240 files** plus the 111 originals and executed sources before the first database write | `build-package.mjs`, `deploy.ps1` gates 1 and 4 |
| **F7** — raw stderr written to the final evidence path, then rewritten redacted; `WriteAllText` overwrites; `Write-Stop` printed an unsanitised reason | Output never reaches disk raw: `Write-Evidence` sanitises **then** encodes, and creates every file with `FileMode::CreateNew` (an existing path is an error, never an overwrite). STOP stores and prints the same sanitised string. Receipts are hash-chained (`prevReceiptSha`) and the run is sealed (`EVIDENCE-MANIFEST.json`) | `clash-native.ps1`, `deploy.ps1` |
| **F7** — arbitrary host/port accepted, any `PGSSLMODE` retained, `require` default | `-ProjectRef` is mandatory; the host must be `db.<ref>.supabase.co` (port 5432) or `aws-…pooler.supabase.com` (port 6543, user `postgres.<ref>`); `PGSSLMODE` is forced to **verify-full** and a **CA certificate is mandatory**; `PGHOSTADDR`/`PGSERVICE`/`PGOPTIONS` are refused because they can redirect the connection behind the approved name | `Resolve-ExecutionPolicy` |
| **Round 2** — 0 of 67 package tests observed; wrappers/SQL unvalidated | The suite is now 456 assertions, including a real PowerShell lexer (comments/here-strings/strings removed, then bracket balance) and two-direction fixtures proving the lexer distinguishes prose from code. **Still offline only** — it proves the package, not the hosted database | `tests/verify-package.mjs` |

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

### 1f. Round 6 (audit of `7311238`) - filesystem paths from `import.meta.url`

The suite derived its directories from `new URL('..', import.meta.url).pathname`.
On Windows that is `/C:/Users/.../` - leading slash, drive letter, percent-encoded
spaces - and `path.join` turns it into `C:\C:\Users\...\manifest.json`, so the
suite died with ENOENT **before its first assertion**. The builder carried the same
line, so it would have failed the same way on Windows - inferred, not observed:
the audit ran the suite, not the builder.

| Correction | Detail |
|---|---|
| `fileURLToPath()` everywhere | new `tests/paths.mjs` owns the derivation; `tests/verify-package.mjs` and `tools/build-package.mjs` both use it, and a detector forbids `.pathname` in the package's JavaScript |
| bootstrap guard | path derivation and the first reads are wrapped; failure prints `CLASH-TEST-BOOTSTRAP-FAILED {json}` and exits 1 before any assertion or summary can print |
| section accounting | the suite counts the 17 sections it runs; fewer than expected is a failure, so a truncated run cannot pass |
| platform regressions | section [17]: the old expression reproduced and rejected, Windows (`C:\...\clash cloud\...`) with spaces, macOS and Linux POSIX paths, the live derivation re-checked by independent recomputation, and a **real child process** run from a directory without `manifest.json` |

#### Round 7 - two Windows-only test defects in that section

Codex ran the suite on Windows: 264/266. Both failures were in the *tests*, not the
package.

| Defect | Why it failed on Windows | Correction |
|---|---|---|
| `posix.dirname(fileURLToPath(...))` for the live comparison | `posix.dirname('C:\\Users\\...\\tests\\verify-package.mjs')` is `'.'`, so the comparison degraded to `resolve('.', '..')` and always mismatched | the live check uses the platform `dirname`; a test pins `win32.dirname` vs `posix.dirname` on a drive path |
| "the live path must not contain a backslash" | on Windows the backslash **is** the separator | replaced by `pathArtefacts()`, which is platform-explicit: absolute drive or UNC path, no foreign separator, no doubled drive, no percent-encoding, no drive letter on a POSIX path |

The replacement is stricter than the rule it replaces, and it is covered for
Windows drive paths, UNC, spaces, mixed separators and POSIX paths.

#### Counts in this file are checked by the suite

The numbers above have drifted before: this file claimed 238 checksummed files
while there were 239 and then 240. Section [18] now asserts that the counts
written here - checksums, migrations, wrappers, assertions - equal what the suite
measures, and the suite fails if its own assertion total differs from
`EXPECTED_ASSERTIONS`. A stale number in this file is a test failure, not a
puzzle for the reader.

### 1g. Round 8 (audit of `7133e642`) - recovery and fail-closed defects

Codex reproduced four safety failures that the offline suite did not cover. All
four are fixed, and each now has an adversarial regression in section [19].

| # | Defect | Fix |
|---|---|---|
| R1 | `check-ledger.ps1` counted missing rows but never a version recorded *after* a missing one, so a gapped ledger read as `PREFIX` - a resumable-looking verdict, exit 0 | classification moved to `Get-LedgerVerdict` in the adapter: a gap, a malformed row, an identity mismatch or an unexpected version is `PROBLEM`, and `PARTIAL_PREFIX` exits 1. Shared with the runner so the two cannot disagree |
| R1 | table presence inferred from `"does not exist"` in stderr | `to_regclass()` catalog probe; a failed probe is UNREADABLE, never "absent". `Get-PgSqlState` extracts SQLSTATE for diagnostics only |
| R2 | the advertised resume conflicted with the fresh-baseline preflight and could never run | the runner is **fresh-only**: an empty ledger is required, anything else stops with `03-ledger-not-empty.json`. All resume machinery removed; `ROLLBACK.md` rewritten |
| R3 | an absent ledger row after any failure - including a lost connection - was labelled `ROLLED_BACK_PROVEN` | only psql exit 3 (script error under `ON_ERROR_STOP`, COMMIT never reached) plus a successful fresh read-back proves a rollback. Everything else is `UNKNOWN`. The trap no longer claims "no database write" |
| R4 | receipt persistence could fail in both destinations while the run continued with an empty hash | `Add-Receipt` throws; `Write-RequiredReceipt` wraps every required JSON receipt; the throw reaches the trap and exits 1 |
| - | incomplete child-output capture was recorded and ignored | `Test-NativeSuccess` and `Get-PsqlExitClass` both fail closed; the outcome label becomes `UNKNOWN-CAPTURE-INCOMPLETE` |
| - | `on conflict (version) do nothing` skipped the row while re-executing the migration body | the ledger insert now ABORTS on conflict, and step 0 creates `clash_deploy_claim`, a single-row writer claim the runner takes before the first wrapper and releases after postflight |

The adapter is `4.1.0` and the native self-test is 24 cases (was 18). Its receipt
must be regenerated before `deploy.ps1` will run: an old receipt is bound to the
old adapter hash and is refused.

### 1h. Round 9 (audit of `52b50a6`) - fail-closed ledger parsing

| # | Defect | Fix |
|---|---|---|
| B1 (critical) | both tools parsed the ledger with `if ($parts.Count -ge 2) { $ledger[$k] = $v }`. Every other nonblank row was dropped silently, so an unparseable listing became an EMPTY ledger and the fresh-only gate passed | one shared parser, `ConvertFrom-ClashLedgerOutput`, used by the runner and by `check-ledger.ps1`: exactly two fields, a 14-digit version that exists in the manifest, a `sha256:<64 hex>` identity, no duplicate version, no stray output, and an empty listing when the table is absent. Any problem stops the runner **before step 0 creates a table** |
| B2 | with the ledger table ABSENT, `check-ledger.ps1` skipped the branch that assigns the query result and then read it under StrictMode, so the receipt crashed instead of recording a clean-empty ledger | the ledger-query result starts as `$null`; the branch-dependent receipt fields come from `New-LedgerAuditFields`, which records the presence probe that actually ran and marks the ledger query `not issued: table absent` |
| B3 | `Get-PgSqlState` existed but neither command builder requested verbose diagnostics, so a normal ERROR line carried no SQLSTATE | both add `-v VERBOSITY=verbose`; claim collisions and probe failures now record a real state |
| - | step 0 used `if not exists` and never checked the keys of a pre-existing table | after step 0 the runner reads `pg_constraint` and requires exactly `ledger=version;claim=claim_key` |
| - | claim release accepted exit 0 without proving which row was removed | release uses `delete … returning run_id` and requires **exactly one** returned row equal to this run's id |
| - | stale-claim instructions did not require proving the previous writer was gone | `ROLLBACK.md` T1.1 now demands an `pg_stat_activity` check, evidence for the abandoned run, a `check-ledger.ps1` verdict and a single-row `RETURNING` delete |

Adapter `4.2.0` (was `4.1.0`), native self-test 26 cases (was 24): both additions
execute the real parser and the real receipt-field builder, so a malformed
listing or an ABSENT ledger is exercised in PowerShell, not just in JavaScript.

Adapter `4.3.0` (was `4.2.0`), native self-test 33 cases (was 26).

One consequence is worth stating: psql builds the `(N rows)` footer with
`ngettext("(%lu row)", "(%lu rows)", n)`, so the footer is *translated*. A host
whose message catalog is not English would render `(19 Zeilen)`, the strict
parser would call a good report truncated, and gate 5 would stop a correct
deployment. The psql child environment therefore pins `LC_ALL=C` (alongside the
`-X` that already ignores `~/.psqlrc`), and the parser's environment is part of
the contract rather than an accident of the host.

Adapter `5.0.0` (was `4.7.0`), native self-test 120 cases (was 75): completion is
now a commit protocol rather than a receipt the runner wrote before sealing (see
§1n), and sixteen cases execute it against real directories - the success path,
a refused seal publication, an injected seal write failure, the committed
completion region of `deploy.ps1` run for real (success and failure), a second
finalization, a doubt marker, a missing required receipt, and five ways a
consumer must reject a run whose evidence does not verify.

Adapter `4.7.0` (was `4.6.0`), native self-test 75 cases (was 65): the framing
characters of a report are now validated at every separator-derived boundary (see
§1m), and ten cases execute the mutation the Round 14 audit used - the exact
four-delimiter replacement - plus shifted, unpadded and misaligned headers for
all three reports, alongside valid controls for embedded pipes, right-aligned
numbers, LF/CRLF and padded short values.

Adapter `4.6.0` (was `4.5.0`), native self-test 65 cases (was 55): gate 2 is now
held to a report contract too (see §1l), and ten cases execute the committed
gate-2 region - the real 21-row report, the audit's arbitrary suffix line, a
missing check, a duplicate, a reordering, a rename, a rendered FAIL, a truncation,
the `postgis|extensions` row that proves the framing, and an INFO-only report
whose receipt must not say PASS.

Adapter `4.5.0` (was `4.4.0`), native self-test 55 cases (was 46): the envelope
itself is now parsed strictly - header, separator, one `(N rows)` footer with a
validated count, and nothing else - and nine cases execute it for both verifiers:
valid envelope, footer-count mismatch, missing footer, malformed footer, trailing
output, the extra line the old parser silently skipped, an invalid ordinal and
status on the same row, a stream cut mid-row, and the storage trailer.

Adapter `4.4.0` (was `4.3.0`), native self-test 46 cases (was 33): the report
contract (`Get-ClashVerifyContract`) and its enforcer (`Test-VerifyReport`) are
certified on the runtime, and thirteen new cases execute the committed gate 5
region of `deploy.ps1` - both reports complete, empty, truncated, duplicated,
malformed, renamed, FAIL-rendering and unprovable - so "exit 0 with no rows" is
a stopped run, not a COMPLETE.

### 1i. Round 10 (audit of `fd453b5`) - claim release could never succeed

| # | Defect | Fix |
|---|---|---|
| R9-C1 (critical) | `if (Test-NativeSuccess $release -and -not $releasedOwned)` is ONE PowerShell command: `-and`, `-not` and the ownership value were passed as extra **arguments**, so the condition collapsed to the function's own result and a correct release entered the STOP branch. Every migration and both verifiers could pass and the run still never reached COMPLETE | the call is parenthesised: `if ((Test-NativeSuccess $release) -and (-not $releasedOwned))` |
| - | the failure was invisible to the offline suite, which only asserted the block's text | `test-native-capture.ps1` now reads `deploy.ps1`, extracts the committed release region between two anchors, refuses it unless all five receipt markers appear with their expected per-branch counts, the release carries `returning run_id`, and no `exit`/seal sits inside the region, and **executes** it with only the process and evidence layers stubbed. Seven cases cover owner row -> COMPLETE, zero rows, wrong owner, two rows, nonzero exit, timeout and incomplete capture |
| - | two `Test-NativeSuccess` calls in one expression is the shape that broke; nothing checked for the others | section [21] tokenises all six scripts and fails if any condition, assignment or return combines a bare command invocation with a binary operator. Failure injection proves the detector fires on the shipped form |

Still unproven, and stated as such: the four scripts have **never run**, the SQL
gates have **never run against the hosted database**, and the ledger/CLI
interoperability is **documented, not executed**. The Round-10 PowerShell cases
have not been executed on this machine either - they are executed by
`test-native-capture.ps1` on the Windows host, and only that receipt counts.

### 1j. Round 12 (audit of `3e95e2f`) - the verification gate accepted an empty report

| # | Defect | Fix |
|---|---|---|
| R11-C1 (critical) | gate 5 counted FAIL rows only. A `psql` child that exited 0 with **zero** rendered rows satisfied `Test-NativeSuccess` and `failRows -eq 0`, so the run released the exclusive-writer claim and wrote `06-complete.json` on unproven evidence. Storage verification had no PASS/INFO contract at all | `Get-ClashVerifyContract` declares the exact report each script must render - 19 gating checks for `90_verify.sql`, 6 gating + 1 INFO for `95_storage_config.sql`, each with its ord, check name and expected text - and `Test-VerifyReport` accepts a report only when it renders exactly those identities, in order, with no missing, duplicated, malformed, undeclared or drifted row, correct gating/INFO counts and no gating FAIL. Both phase receipts now carry `verdict`, `rows`, `problems` and the contract size |
| - | an ambiguous child could be read as a content failure | the verdict is forced to `UNPROVEN` whenever `Test-NativeSuccess` is false, so a timeout, launch error or partial capture is never PASS and never FAIL-on-content |
| - | the STOP did not say whether the claim was still held | both STOPs state that no rollback is implied, that the claim stays held for human review (T1) and that completion is withheld; a third invariant STOP fires if the release is ever reached without two proven reports |
| - | the offline suite could not see this: it only grepped `deploy.ps1` | section [22] compares the declared contract with the identities the SQL itself renders, mirrors the thirteen decisions, and `test-native-capture.ps1` executes the committed gate 5 region with the process and evidence layers stubbed (46 native cases) |

### 1k. Round 13 (audit of `b7000ec`) - the parser skipped what it did not understand

| # | Defect | Fix |
|---|---|---|
| R12-C1 (critical) | `Test-VerifyReport` parsed only lines it recognised and `continue`d past everything else. `psql`'s row-count footer was skipped by design, but so was *any* extra line: an extra malformed row, stray prose, a second footer or trailing output left the 19 parsed rows and the verdict untouched, so a report that was not the report could still be PASS | the envelope is now explicit and total: preamble blanks, header, separator, complete data rows, exactly one `(N rows)` footer, trailing blanks. The footer count must equal the parsed row count; a missing or malformed footer, a blank line inside the body, an unexpected line anywhere, more or fewer than five fields, a non-numeric ordinal or an unknown status are each reported problems. Nothing is skipped |
| - | the same class in two sibling parsers | `check-manifest.ps1` skipped a checksum line it could not split (a truncated list still passed while 200 well-formed lines remained); it now FAILs that line with its number. `Test-SelfTestReceipt` skipped a case recorded with no body, so "present but null" satisfied the name and count checks; it is now a problem |
| - | the offline suite could not see any of this | section [23] mirrors the envelope grammar independently and runs ten scenarios through it, and the nine new native cases execute the real parser and the real gate for both verifiers |

### 1l. Round 14 (audit of `3bd6c18`) - gate 2 counted suffixes

| # | Defect | Fix |
|---|---|---|
| R13-C1 (critical) | the preflight gate counted lines ending in `\| PASS` / `\| FAIL` and refused only when FAIL > 0 or PASS < 1. The independent audit ran the committed block on PowerShell 5.1 with exit 0, a complete capture and the single line `THIS IS NOT A PREFLIGHT REPORT \| PASS`: the receipt said PASS, no STOP was taken, and the run would have advanced to the ledger gate. Nothing about `00_preflight.sql` - its 21 checks, their names, expected values, statuses, order or framing - was validated | `Get-ClashVerifyContract` now declares `00_preflight.sql` (19 gating checks 1-19, INFO checks 20-21) and gate 2 calls `Test-VerifyReport` exactly as gate 5 does. A report that is not those 21 rows, in that order, framed by header, separator and `(21 rows)` footer, is a problem; the gate STOPs with `02-preflight-rows.json` and lists them |
| - | the phase receipt said PASS whenever the child exited 0 | `02-preflight.json` now takes its `status` from `$pfReport.verdict`, so a rendered FAIL, an INFO-only or a malformed report can never leave a PASS receipt behind, and an unprovable child is `UNPROVEN` |
| - | a five-column `\|` splitter would have broken the new gate immediately | `00_preflight.sql` renders the literal `postgis\|extensions` in the *expected* column and `postgis\|<schema>` (or `ABSENT`) in *actual*, so a pipe splitter reads seven cells from a good row. Rows are now framed on the column spans the dashed separator declares - `(width + 2)` dashes per column joined by `+` - and the pipe stays inside its cell. `Test-VerifyReportHeader`/`Separator` and the envelope are unchanged |
| - | the offline suite asserted the old behaviour | section [24] derives the 21 rows from `00_preflight.sql` itself (both copies of the list must agree), compares them with the declaration, mirrors the boundary framing independently, and the ten new native cases execute the committed gate-2 block with the child and evidence layers stubbed |

### 1m. Round 15 (audit of `03861c2`) - the delimiters were never checked

| # | Defect | Fix |
|---|---|---|
| R14-C1 (critical) | `Get-ReportColumnBounds` records each column's span and `Get-ReportCellsFromBounds` slices inside it, but nothing looked at the character *between* spans. Replacing the four structural `\|` on row 1 with `!` left every cell at its position, so the report parsed to 21 rows, matched the contract, produced a PASS receipt and advanced gate 2 | `Test-ReportRowFraming` checks the framing at the exact positions the separator declares - a space at the first character of every column and a `\|` at `start + width` for every column but the last - for **both** the header and every data row. A row whose framing fails is reported, counted as malformed and **not** counted as a row, so the verdict is FAIL, the receipt is non-PASS and the gate STOPs before anything after it |
| - | a `\|` inside a cell had to stay a value | only the declared boundaries are delimiters, so `postgis|extensions` (preflight ord 8, in *expected* and in *actual*) still frames exactly - case 75 asserts the report parses with zero problems while containing the literal pipe twice |
| - | the header was checked by splitting it, so it could still sit off the separator's columns | once the separator is seen the recorded header line is framed against the same spans and each header cell must read `ord`, `check_name`, `expected`, `actual`, `status` *at its column*; a shifted header is a reported problem |
| - | the offline suite had no framing mirror | section [25] re-derives the 21 preflight rows from the SQL, frames them independently, and replays the audit's mutation on row 1 and on the pipe row, plus shifted, unpadded, header-misaligned, LF/CRLF and short-padded-value controls |

### 1n. Round 16 (audit of `cc3dd1f`) - COMPLETE was written before the seal

| # | Defect | Fix |
|---|---|---|
| R15-C1 (critical) | the runner wrote `06-complete.json` with `status=COMPLETE` and announced `TERMINAL RECEIPT: COMPLETE` **before** calling `Seal-Evidence`. The audit replayed that tail on PowerShell 5.1 with only the seal write fault-injected: the marker was durably persisted and announced, the seal threw, the trap wrote `99-runner-exception.json` with `status=EXCEPTION`, and the process exited 1 - so the evidence directory said COMPLETE and EXCEPTION at the same time, and a consumer reading the marker accepted a run whose evidence was never sealed | completion is now a commit protocol in `Publish-ClashCompletion` with **one** commit point: (1) `06-finalization-intent.json`, a provisional receipt that says `FINALIZING`; (2) the seal, published atomically (exclusive temp file, then a move that cannot overwrite) and excluding the completion artifacts; (3) the seal verified against disk - every hash, every chain link, the declared count and the required evidence; (4) the marker written exclusively to a scratch name; (5) an atomic rename onto `06-complete.json` - **the commit point**; (6) the marker re-read and re-verified against the seal. Nothing is announced before step 6, and a failure at any step leaves no `06-complete.json` |
| - | the marker and the seal could have hashed each other | the seal's file set excludes `06-complete.json` and `06-complete-unverified.json`, and the marker binds the seal's sha256 instead of being sealed. Case 77 corrupts the marker and shows the seal still verifies (no circular dependency) while the consumer still rejects the run |
| - | the release region could still write a completion receipt | the claim-release region ends where completion begins and may not contain `06-complete.json`; its probe now asserts the release proves the **claim**, not completion (case 27, renamed `claimReleaseOwnedRowReleasesClaimOnly`) |
| - | a consumer had no way to tell a finished run from a finalized one | `Test-ClashRunCompletion` is the consumer contract: the marker must exist, carry `protocol = clash-completion/2`, `status = COMPLETE` and a boolean `finalized = true`, bind the seal that is on disk, the seal must re-derive from the files, every authoritative field must agree with sealed evidence (see §1o), no `06-complete-unverified.json` and no `99-runner-exception.json` may be present, and no file may have been written after sealing. The runner calls it on itself, so runner and consumer cannot disagree |
| - | a failure at the very end could be read as a rollback, or invite a re-run | a finalization failure writes `06-finalize-fail.json` (`status=STOPPED`, `claimReleased=true`, `rollbackImplied=false`, `completionMarkerWritten`), the trap's exception receipt carries `completionAccepted=false` and `rollbackImplied=false`, and both say the schema was applied and the claim released - only the evidence failed. Nothing is deleted, rewritten or repaired, and a second finalization refuses |
| - | the earlier tests proved a hand-assembled copy of the tail | cases 82/83 read `deploy.ps1`, extract the committed completion region between two anchors, refuse it unless it calls the protocol exactly once, demands all five required receipts, never writes the marker itself and announces after the call - then **execute** it with the real protocol, real receipts and real sealing. Only `exit 0` is substituted (a test process cannot exit), and the announcement case records whether the marker existed **at the moment** the COMPLETE line was printed |

### 1o. Round 17 (audit of `27db5b8`) - the marker's own chain claims were never read

| # | Defect | Fix |
|---|---|---|
| C16-C1 (critical against the completion-acceptance contract) | `Test-ClashRunCompletion` proved the seal, the marker-to-seal SHA binding and the file count - but it never read `prevReceiptSha` or `seal.chainHead`. The independent audit published a real run with the real publisher, then changed exactly those two fields to 64 zeros. The seal still verified and the consumer still returned `ok=true` with no problems, so a run whose receipt predecessor and chain head contradicted its own sealed evidence was accepted | every authoritative marker field is now compared against evidence derived independently from disk: `prevReceiptSha` must equal the hash of the sealed `06-finalization-intent.json`, and `seal.chainHead` must equal the chain head re-derived from the seal's entries (which `Test-EvidenceSeal` already recomputes). `seal.name`, the adapter identity, and `writerRunId` (against the sealed claim release) are verified too, and the sealed intent must itself chain to the sealed `06-claim-release.json` and declare required evidence that is really sealed |
| - | hash comparisons used `-eq`, which is case-insensitive for strings | every hash comparison is `-ceq`/`-cne`, the format is `^[0-9a-f]{64}$` (`Test-ClashSha256Text`), and `finalized` must be a JSON boolean and `fileCount` a JSON integer - the strings `"true"` and `"six"` are rejected |
| - | marker fields that nothing verified were still presented as facts | the authoritative set is declared in one place (the comment above `Test-ClashRunCompletion`) and everything else the runner contributes (`appliedThisRun`, `freshOnly`, `packageTreeHash`, `step0Bootstrap`, `ledgerReadBack`) is written under `metadata`, which the consumer ignores. `utc` is checked for parseability only and is documented as ordering metadata, not authority |
| - | the producer could publish a marker the consumer would reject | `Publish-ClashCompletion` now runs `Test-ClashRunCompletion` on its own output after the commit; if the consumer refuses, a doubt marker records the problems and the finalization throws instead of reporting success. The required evidence is declared once (`Get-ClashCompletionRequiredEvidence`) and demanded by both the producer and the consumer, so a run cannot drop a receipt from both the intent and the seal |
| - | only the audit's two-field mutation was known to be accepted | eleven executed cases mutate a real published marker field by field: the exact Codex mutation (case 92), each field alone (93, 94, 100, 101, 102), a missing intent (95), wrong JSON types (96), malformed and case-folded hashes (97), a mis-chained intent (98) and required evidence removed after sealing (99) |

### 1p. Round 18 (audit of `6bd5667`) - a JSON type boundary that enumerated its own input

| # | Defect | Fix |
|---|---|---|
| C17-C1 (critical against the strict typed completion-acceptance contract) | `Get-ClashProperty` ended with `return $prop.Value`. A `return` writes its value into the PowerShell **output pipeline**, and the pipeline **enumerates an array**: a marker field of `["clash-completion/2"]` reached the consumer as the string `clash-completion/2`, `[]` arrived as nothing at all, and `[{...}]` arrived as the seal object. The consumer then tested `$proto -is [string]` on the *pipeline's output*, not on the JSON field, so the audit's `protocol: ["clash-completion/2"]` was **accepted** with no problems, and `Get-DocumentProperty` (the receipt accessor) had the identical defect | both accessors now emit the value without enumeration (`return ,$prop.Value`, `return ,$p.Value`, `return ,$Object[$Name]`), so an array arrives as an array, `[]` as an empty array and a nested array stays nested. A separate record reader, `Get-ClashJsonField`, reports `present`, the exact `kind` (`missing`/`null`/`string`/`boolean`/`integer`/`number`/`object`/`array`) and the untouched value, so "absent" and "null" are different answers |
| - | a type test on a coerced local variable cannot be a type test | every authoritative field is gated on its exact JSON kind before its value is used: `protocol`, `status`, `adapter`, `prevReceiptSha`, `writerRunId`, `utc` and `seal.name` must be JSON strings, `finalized` a JSON boolean, `seal.fileCount` a JSON integer, `seal` and the marker root JSON objects, `requiredEvidence` a JSON array of strings, and the sealed claim release's `status`/`runId` strings with `released` a JSON boolean. `Get-ClashJsonKind`/`Test-ClashJsonKind` **classify and never convert**: `"6"` is not an integer, `6.5` is not an integer, `["s"]` is not a string |
| - | the seal and the verification receipt trusted their own shape | `Test-EvidenceSeal` now requires an object root, a JSON array in `files`, an object in every entry, strings for `path`/`sha256`/`chain`, a string `chainHead` and a JSON **integer** `fileCount` (the old reader cast the claim with `[int]`, so `"6"` passed). `Test-SelfTestReceipt` requires `verdict`/`adapterId`/`adapterVersion`/`adapterSha256`/`powerShellVersion` strings, `problems` an array, `casesExecuted` a JSON integer and `cases` an object |
| - | the producer could still write, or accept, a wrongly typed marker | `Publish-ClashCompletion` asserts the JSON kind of every authoritative field **it** wrote, independently of the consumer (a serializer that turns `true` into `"true"`, `6` into `"6"` or an object into an array is caught before publication), and its post-commit re-verification compares kinds as well as values. The consumer's verdict record reports `protocol` only when the marker really carries a string, plus the observed `protocolKind`, so the record can no longer make an accepted-looking shape out of a rejected one |
| - | the audit's exact input was the only collection case known | eighteen executed cases (103-120): the accessor keeps empty/singleton/multi/nested arrays, an object, a null and scalars; the kind classifier separates `missing` from `null`; the exact Codex input `protocol: ["clash-completion/2"]` (106) plus `[]` (107), two elements (108), a nested array (109), an object (110) and `null` (111); every other authoritative field as a one-element array (112); all four seal-block fields as arrays (113); an array-rooted marker (114); a seal whose `files` is a string (115), whose `fileCount` is `"6"` (116) and whose `chainHead` is an array (117); a collection-valued intent (118) and claim release (119); and a verification receipt that says `["PASS"]`/`[102]`/`"none"` (120) |

Still not proven: the consumer validates *files*, not signatures. A privileged
writer can replace the whole artifact set consistently; the seal is consistency
evidence, not an attestation.

**Authority rule.** `06-complete.json` is evidence, not a verdict: a run is
complete only when `Test-ClashRunCompletion` accepts the directory it lives in.
The seal is authoritative for *what the evidence is*, the run directory is
authoritative for *what happened*, and no single file may be read in isolation.
`06-finalization-intent.json` (`FINALIZING`) and `06-complete-unverified.json`
(`UNVERIFIED`) are explicitly **not** completion, and a `99-runner-exception.json`
anywhere in the directory means the outcome is UNKNOWN - the schema may have been
applied and the claim may have been released.

Still unproven, and stated as such: `deploy.ps1` has never run against a
database. The finalization protocol is proven against real files on a real
PowerShell 5.1 runtime, not against a real deployment.

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
tools/deploy.ps1               sequential runner, stop-on-first-failure, fresh-only (no resume)
tests/verify-package.mjs       offline test suite (456 assertions)
checksums.sha256               240 files: 111 originals + 129 package files
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
gate 1  full package integrity — 240 checksum files, 111 originals, executed
        sources and wrapper digests — BEFORE any database connection
gate 2  preflight SQL (fail-closed DO block)
gate 3  ledger must be EMPTY (read-only; fresh-only policy)
gate 3b step 0: the runner creates the ledger and claim tables from
        generated/000_ledger_bootstrap.sql (digest checked first), then proves
        the table exists and is empty; if the table is present it is skipped
gate 4  111 wrappers: digest compared → execute → ledger read-back → classify
gate 5  postflight verification + storage verification
        seal EVIDENCE-MANIFEST.json, print the terminal receipt
```

Gate 5 does not infer success from an exit code, and it does not count FAIL
rows. Each verification report is checked against a contract declared in
`tools/lib/clash-native.ps1` (`Get-ClashVerifyContract`, enforced by
`Test-VerifyReport`): `90_verify.sql` must render exactly its 19 declared gating
checks and no INFO row, `95_storage_config.sql` exactly its 6 gating checks plus
its 1 INFO row, each with the declared ord, check name, expected text and status,
with nothing missing, duplicated, malformed or undeclared. An empty, truncated,
reordered or unproven report stops gate 5 before the writer claim is released, so
`06-complete.json` is only written when both reports satisfy their contract.

The shape of that report is part of the contract. `psql` prints one result set as
a five-column header (`ord | check_name | expected | actual | status`), a dashed
separator, one row per check, and the default `(N rows)` footer — `-q` does not
suppress that footer (it is `-t`/`\pset footer off` that do), and an empty result
still prints `(0 rows)`. `Test-VerifyReport` therefore recognises exactly that
envelope: nothing before the header and nothing after the row-count footer except
blank lines, no blank line inside the body, one footer whose count equals the
number of parsed data rows, five fields per row, a numeric ordinal and a
`PASS`/`FAIL`/`INFO` status. Every other non-blank line is a reported problem —
never skipped — so an extra row, stray prose, a second footer or a filtered or
truncated stream cannot leave a PASS behind.

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
| `COMMITTED` | the ledger row **is** present with the expected token | continue |
| `ROLLED_BACK_PROVEN` | psql exit **3** (script error under `ON_ERROR_STOP`, so the wrapper's `COMMIT` was never reached) **and** a fresh read-back shows the row absent | the version is not applied; there is still no resume — the run stops and a human decides (ROLLBACK.md T1) |
| `LEDGER_MISMATCH` | a row exists whose identity the manifest does not describe | human decision, S4 |
| `UNKNOWN` | connection loss (exit 2), timeout, incomplete capture, unreadable probe or any other exit — the commit outcome is **not** established | do **not** assume success and do **not** assume rollback; the original backend may still commit. `check-ledger.ps1` is read-only and safe; escalate |

## 6. Evidence

```
evidence/<UTC>Z-attempt-<n>/
  00-baseline.json            git sha, migrations-dirty flag, psql version, connection policy
  01-integrity.json           files verified, package tree hash, problems
  02-preflight.json           exit code, duration, PASS/FAIL row counts, sanitised excerpt
  01-gates/preflight.{out,err}
  03-ledger.json              ledger verdict, row count, gaps/mismatches, policy statement
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
